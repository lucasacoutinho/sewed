import { Context, Effect, Layer, Option, Scope, Stream } from "effect";
import { RpcClient, RpcSchema } from "effect/unstable/rpc";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import { ClientContext, MainContext, type ConnectionFactory } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { location, sink } from "./internal/Diagnostics.ts";
import { taggedFunction } from "./Util/effect.ts";
import { clientProtocol } from "./internal/Transport.ts";
import { encodingOf } from "./internal/Encoding.ts";

declare const slotIdentifier: unique symbol;
declare const ownerType: unique symbol;

export type Client<Rpcs extends Rpc.Any> = {
  readonly [Current in Rpcs as Current["_tag"]]: (
    input: Rpc.PayloadConstructor<Current>,
  ) => Current extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer Success,
    infer Error,
    infer Middleware,
    infer _Requires
  >
    ? Success extends RpcSchema.Stream<infer A, infer E>
      ? Stream.Stream<
          A["Type"],
          | E["Type"]
          | Error["Type"]
          | Middleware["error"]["Type"]
          | Middleware["~ClientError"]
          | RpcClientError
          | SewedError,
          ClientContext | Scope.Scope | Rpc.ServicesClient<Current> | Rpc.MiddlewareClient<Rpcs>
        >
      : Effect.Effect<
          Success["Type"],
          | Error["Type"]
          | Middleware["error"]["Type"]
          | Middleware["~ClientError"]
          | RpcClientError
          | SewedError,
          ClientContext | Scope.Scope | Rpc.ServicesClient<Current> | Rpc.MiddlewareClient<Rpcs>
        >
    : never;
};

export interface Slot<Rpcs extends Rpc.Any> extends Context.Service<
  typeof slotIdentifier,
  ConnectionFactory
> {
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  (): Effect.Effect<
    Client<Rpcs>,
    SewedError,
    ClientContext | Scope.Scope | Rpc.MiddlewareClient<Rpcs>
  >;
}

export interface Owner<Rpcs extends Rpc.Any> {
  readonly id: string;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [ownerType]: (rpc: Rpcs) => Rpcs;
}

export interface Bound {
  readonly slot: Context.Service<typeof slotIdentifier, ConnectionFactory>;
  readonly ownerId: string;
}

const owners = new WeakMap<object, ConnectionFactory>();
const factories = new WeakMap<Bound, ConnectionFactory>();

export const makeBound = (
  slot: Bound["slot"],
  ownerId: string,
  factory: ConnectionFactory,
): Bound => {
  const bound = Object.freeze({ slot, ownerId });
  factories.set(bound, factory);
  return bound;
};

export const factoryOf = (bound: Bound): ConnectionFactory => {
  const factory = factories.get(bound);
  if (!factory)
    throw new SewedError({ code: "Protocol", message: "Binding was not created by Sewed" });
  return factory;
};

export const makeOwner = <Rpcs extends Rpc.Any, Fields extends object>(
  id: string,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  factory: ConnectionFactory,
  fields: Fields,
): Owner<Rpcs> & Fields => {
  // The private registry is the runtime authority; the invariant phantom prevents protocol widening.
  const owner = Object.freeze({ ...fields, id, protocol }) as Owner<Rpcs> & Fields;
  owners.set(owner, factory);
  return owner;
};

export const slot = <Rpcs extends Rpc.Any>(
  name: string,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Slot<Rpcs> => {
  const tag = Object.assign(
    Context.Service<typeof slotIdentifier, ConnectionFactory>(`sewed/binding/${name}`),
    { protocol },
  );
  const binding: Slot<Rpcs> = taggedFunction(tag, () => client(binding));
  return binding;
};

export const to = <Rpcs extends Rpc.Any>(slot: Slot<Rpcs>, owner: Owner<NoInfer<Rpcs>>): Bound => {
  const factory = owners.get(owner);
  if (!factory)
    throw new SewedError({
      code: "Protocol",
      message: "Binding target is not a running Sewed owner",
    });
  if (slot.protocol !== owner.protocol) {
    throw new SewedError({
      code: "Protocol",
      message: `Binding ${slot.key} has a different protocol`,
    });
  }
  return makeBound(slot, owner.id, factory);
};

export const clientContext = (bindings: readonly Bound[]) =>
  Effect.gen(function* () {
    const lifetime = yield* Effect.scope;
    const observer = yield* sink;
    const placement = yield* location;
    const environmentId = observer ? yield* generateInstanceId() : "";
    let context = Context.empty();
    const targets = new Map<string, string>();
    const names = new Set<string>();
    for (const binding of bindings) {
      if (names.has(binding.slot.key)) {
        return yield* Effect.fail(
          new SewedError({ code: "Protocol", message: `Duplicate binding ${binding.slot.key}` }),
        );
      }
      names.add(binding.slot.key);
      const factory = factoryOf(binding);
      targets.set(binding.slot.key, binding.ownerId);
      if (observer) {
        const bindingId = `${environmentId}/${binding.slot.key}`;
        observer.emit({
          _tag: "BindingOpened",
          bindingId,
          slot: binding.slot.key,
          ownerId: binding.ownerId,
          ...placement,
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() =>
            observer.emit({ _tag: "BindingClosed", bindingId, reason: "scope-closed" }),
          ),
        );
      }
      context = Context.add(context, binding.slot, {
        connect: Effect.gen(function* () {
          const scope = yield* Effect.acquireRelease(Scope.fork(lifetime), (scope, exit) =>
            Scope.close(scope, exit),
          );
          return yield* factory.connect.pipe(Scope.provide(scope));
        }),
      });
    }
    let closed = false;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
      }),
    );
    return ClientContext.of({
      identity: {},
      bindings: context,
      owners: targets,
      isClosed: () => closed,
    });
  });

export const layer = (
  bindings: readonly Bound[],
): Layer.Layer<ClientContext, SewedError, MainContext> =>
  Layer.effect(ClientContext, Effect.andThen(MainContext, clientContext(bindings)));

const checkContext = (expected: ClientContext["Service"]) =>
  Effect.gen(function* () {
    const current = yield* ClientContext;
    yield* Effect.scope;
    if (current.identity !== expected.identity || current.isClosed()) {
      return yield* Effect.fail(
        new SewedError({
          code: "Closed",
          message: "Binding belongs to a closed or different runtime",
        }),
      );
    }
  });

type DynamicCall = (
  tag: string,
  input: unknown,
) => Effect.Effect<unknown, unknown, unknown> | Stream.Stream<unknown, unknown, unknown>;

const methods = <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  invoke: DynamicCall,
): Client<Rpcs> =>
  // Each property and its Effect/Stream branch comes from the same RpcGroup used by RpcClient.
  // This is the sole dynamic method-table bridge; public signatures retain every RPC service.
  Object.fromEntries(
    [...protocol.requests.keys()].map((tag) => [tag, (input: unknown) => invoke(tag, input)]),
  ) as Client<Rpcs>;

export const client = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
): Effect.Effect<
  Client<Rpcs>,
  SewedError,
  ClientContext | Scope.Scope | Rpc.MiddlewareClient<Rpcs>
> =>
  Effect.gen(function* () {
    const runtime = yield* ClientContext;
    yield* checkContext(runtime);
    const factory = Context.getOption(runtime.bindings, binding);
    if (Option.isNone(factory)) {
      return yield* Effect.fail(
        new SewedError({ code: "Protocol", message: `Missing binding ${binding.key}` }),
      );
    }
    const connection = yield* factory.value.connect;
    const transport = yield* clientProtocol(connection, encodingOf(binding.protocol));
    const placement = yield* location;
    const raw = yield* RpcClient.make(binding.protocol, {
      flatten: true,
      spanAttributes: {
        "sewed.binding": binding.key,
        "sewed.owner.id": runtime.owners.get(binding.key),
        "sewed.runtime": placement.runtime,
        "sewed.runtime.id": placement.runtimeId,
        "sewed.thread.id": placement.threadId,
        ...("processId" in placement ? { "sewed.process.id": placement.processId } : {}),
      },
    }).pipe(Effect.provideService(RpcClient.Protocol, transport));
    // The generic RpcClient overload describes the same tag/payload relation as Client above.
    const invoke = raw as DynamicCall;
    let closed = false;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
      }),
    );
    const alive = Effect.flatMap(checkContext(runtime), () =>
      closed
        ? Effect.fail(
            new SewedError({ code: "Closed", message: "Binding client scope has closed" }),
          )
        : Effect.void,
    );
    return methods(binding.protocol, (tag, input) => {
      const result = invoke(tag, input);
      return Effect.isEffect(result)
        ? Effect.andThen(alive, result)
        : Stream.unwrap(Effect.as(alive, result));
    });
  });

const deferredClient = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
  expected: ClientContext["Service"],
): Client<Rpcs> =>
  methods(binding.protocol, (tag, input) => {
    const acquire = Effect.map(
      Effect.andThen(checkContext(expected), client(binding)),
      (client) => {
        const table = client as Record<string, (input: unknown) => ReturnType<DynamicCall>>;
        return table[tag]!(input);
      },
    );
    // Rpc.Any erases schema fields to avoid middleware variance; RpcGroup retains them.
    const rpc: Rpc.Any = binding.protocol.requests.get(tag)!;
    const schema = (rpc as Rpc.AnyWithProps).successSchema;
    return RpcSchema.isStreamSchema(schema)
      ? Stream.unwrap(
          acquire as Effect.Effect<Stream.Stream<unknown, unknown, unknown>, unknown, unknown>,
        )
      : Effect.flatten(
          acquire as Effect.Effect<Effect.Effect<unknown, unknown, unknown>, unknown, unknown>,
        );
  });

export const deferred = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
): Effect.Effect<Client<Rpcs>, never, ClientContext> =>
  Effect.map(ClientContext, (context) => deferredClient(binding, context));
