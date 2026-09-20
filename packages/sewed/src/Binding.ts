import { Context, Deferred, Effect, Exit, Layer, Option, Scope, Stream } from "effect";
import { RpcClient, RpcSchema } from "effect/unstable/rpc";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import { ClientContext, MainContext, type ConnectionFactory } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { location, sink } from "./internal/Diagnostics.ts";
import { taggedFunction } from "./Util/effect.ts";
import { clientProtocol } from "./internal/Transport.ts";
import { boundsOf } from "./internal/Bulk.ts";
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
          | SewedError,
          ClientContext | Scope.Scope | Rpc.ServicesClient<Current> | Rpc.MiddlewareClient<Rpcs>
        >
      : Effect.Effect<
          Success["Type"],
          Error["Type"] | Middleware["error"]["Type"] | Middleware["~ClientError"] | SewedError,
          ClientContext | Scope.Scope | Rpc.ServicesClient<Current> | Rpc.MiddlewareClient<Rpcs>
        >
    : never;
};

export interface Slot<Rpcs extends Rpc.Any, Key extends string = string> extends Context.Service<
  typeof slotIdentifier,
  ConnectionFactory
> {
  readonly key: Key;
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

export interface Bound<Key extends string = string> {
  readonly slot: Context.Service<typeof slotIdentifier, ConnectionFactory>;
  readonly key: Key;
  readonly ownerId: string;
}

/** A declaration of the slots a runtime entry expects, by slot key. */
export interface Declaration<Keys extends string = string> {
  readonly key: Keys;
}

/**
 * The declared slot keys that a binding list leaves unbound. `unknown` when nothing is missing
 * or when the entry declared no keys to check; otherwise an object naming the missing slots,
 * which no binding list can satisfy, so the compiler reports them.
 */
export type Complete<Keys extends string, B extends readonly Bound<Keys>[]> = string extends Keys
  ? unknown
  : [Exclude<Keys, B[number]["key"]>] extends [never]
    ? unknown
    : { readonly missing: Exclude<Keys, B[number]["key"]> };

const prefix = "sewed/binding/";

const owners = new WeakMap<object, ConnectionFactory>();
const factories = new WeakMap<Bound, ConnectionFactory>();

export const makeBound = <Key extends string>(
  slot: Bound["slot"] & { readonly key: Key },
  ownerId: string,
  factory: ConnectionFactory,
): Bound<Key> => {
  const bound = Object.freeze({ slot, key: slot.key, ownerId });
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

// What is refused here is the protocol's encoding, and only that: a bulk declaration outside a
// `Binary.protocol` fails where every slot is declared — `Capability.define` builds its slot
// through this — rather than on the call that sends a document's first attachment.
//
// The field's own schema is not checked here. A bulk field must be `Binary.Bytes`, because that
// is what reaches the wire as the bytes the transport measures and slices, where a JSON codec
// would have turned it into base64 text; but `Schema.Uint8Array` inside a `Binary.protocol`
// satisfies `BytesField` and passes this slot. Such an operation fails closed on every call
// instead, with `Protocol: A bulk field is Binary.Bytes in a Binary.protocol` from the transport,
// which measures what the codec actually produced.
const refuseJsonBulk = <Rpcs extends Rpc.Any>(protocol: RpcGroup.RpcGroup<Rpcs>): void => {
  if (encodingOf(protocol) === "binary") return;
  const [declared] = boundsOf(protocol).keys();
  if (declared !== undefined) {
    throw new SewedError({
      code: "Protocol",
      message: `A bulk operation needs a Binary.protocol: ${declared}`,
    });
  }
};

export const slot = <const Name extends string, Rpcs extends Rpc.Any>(
  name: Name,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Slot<Rpcs, `${typeof prefix}${Name}`> => {
  refuseJsonBulk(protocol);
  const key = `${prefix}${name}` as const;
  const tag = Object.assign(Context.Service<typeof slotIdentifier, ConnectionFactory>(key), {
    protocol,
  });
  // The callable carries the literal key; the Context class's own key is the same string.
  const call = Object.assign(() => client(binding), { key });
  const binding: Slot<Rpcs, typeof key> = taggedFunction(tag, call);
  return binding;
};

export const to = <Rpcs extends Rpc.Any, Key extends string>(
  slot: Slot<Rpcs, Key>,
  owner: Owner<NoInfer<Rpcs>>,
): Bound<Key> => {
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
    const runtime = ClientContext.of({
      identity: {},
      bindings: context,
      owners: targets,
      isClosed: () => closed,
    });
    registries.set(runtime, { lifetime, clients: new Map() });
    return runtime;
  });

/**
 * How a deferred client reaches its owner: one connection per slot for the client environment,
 * or one connection per operation. The renderer bridge handshake dominates small calls, so
 * `shared` is the default and `per-call` is the isolation opt-out.
 */
export type Connection = "shared" | "per-call";

interface SharedEntry {
  readonly scope: Scope.Closeable;
  readonly ready: Deferred.Deferred<unknown, SewedError>;
}
interface Registry {
  readonly lifetime: Scope.Scope;
  readonly clients: Map<string, SharedEntry>;
}
const registries = new WeakMap<ClientContext["Service"], Registry>();

// A shared client lives in the runtime's lifetime, not in the operation's scope. Its connection
// is dropped from the registry the moment the transport reports loss, so the next operation
// opens a fresh one; the failed operations themselves are never retried.
const sharedClient = <Rpcs extends Rpc.Any>(
  runtime: ClientContext["Service"],
  binding: Slot<Rpcs>,
): Effect.Effect<Client<Rpcs>, SewedError, ClientContext | Rpc.MiddlewareClient<Rpcs>> =>
  Effect.gen(function* () {
    const registry = registries.get(runtime);
    if (registry === undefined || runtime.isClosed()) {
      return yield* Effect.fail(
        new SewedError({ code: "Closed", message: "Binding belongs to a closed runtime" }),
      );
    }
    const existing = registry.clients.get(binding.key);
    // One key has one protocol per runtime, so the stored client is this slot's client.
    if (existing !== undefined) return (yield* Deferred.await(existing.ready)) as Client<Rpcs>;
    const entry: SharedEntry = {
      scope: Scope.forkUnsafe(registry.lifetime),
      ready: Deferred.makeUnsafe<unknown, SewedError>(),
    };
    registry.clients.set(binding.key, entry);
    const evict = () => {
      if (registry.clients.get(binding.key) !== entry) return;
      registry.clients.delete(binding.key);
      Effect.runFork(Scope.close(entry.scope, Exit.void));
    };
    const built = yield* Effect.exit(openClient(binding, evict).pipe(Scope.provide(entry.scope)));
    if (built._tag === "Failure") evict();
    yield* Deferred.done(entry.ready, built);
    return yield* built;
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

export type DynamicResult =
  | Effect.Effect<unknown, unknown, unknown>
  | Stream.Stream<unknown, unknown, unknown>;
type DynamicCall = (tag: string, input: unknown) => DynamicResult;

// Rpc.Any erases schema fields to avoid middleware variance; RpcGroup retains them.
export const propsOf = (rpc: Rpc.Any): Rpc.AnyWithProps => rpc as Rpc.AnyWithProps;

// Each property and its Effect/Stream branch comes from the same RpcGroup used by RpcClient.
// `methods` and `table` are the two views of that dynamic method table; public signatures
// retain every RPC service. `Shape` names which view of the table is being built: the binding
// client by default, or a capability's operations, which carry different requirements for the
// same tags and payloads.
export const methods = <Rpcs extends Rpc.Any, Shape = Client<Rpcs>>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  invoke: DynamicCall,
): Shape =>
  Object.fromEntries(
    [...protocol.requests.keys()].map((tag) => [tag, (input: unknown) => invoke(tag, input)]),
  ) as Shape;

export const table = <Rpcs extends Rpc.Any, Shape = Client<Rpcs>>(
  client: Shape,
): Record<string, (input: unknown) => DynamicResult> =>
  client as Record<string, (input: unknown) => DynamicResult>;

export const client = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
): Effect.Effect<
  Client<Rpcs>,
  SewedError,
  ClientContext | Scope.Scope | Rpc.MiddlewareClient<Rpcs>
> => openClient(binding);

const openClient = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
  onConnectionLost?: () => void,
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
    const transport = yield* clientProtocol(
      connection,
      encodingOf(binding.protocol),
      boundsOf(binding.protocol),
      onConnectionLost,
    );
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
        ? Effect.mapError(Effect.andThen(alive, result), transportFailure)
        : Stream.mapError(Stream.unwrap(Effect.as(alive, result)), transportFailure);
    });
  });

// Callers see one error type. The RPC client error stays as the cause; its code follows the
// transport failure that produced it: Closed for lost connections, Limit for exceeded limits.
const transportFailure = (error: unknown): unknown => {
  if (!(error instanceof RpcClientError)) return error;
  const reason = error.reason;
  const cause = reason._tag === "RpcClientDefect" ? reason.cause : reason;
  return new SewedError({
    code: cause instanceof SewedError ? cause.code : "Protocol",
    message: cause instanceof SewedError ? cause.message : error.message,
    cause: error,
  });
};

const deferredClient = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
  expected: ClientContext["Service"],
  connection: Connection,
): Client<Rpcs> =>
  methods(binding.protocol, (tag, input) => {
    const open = connection === "shared" ? sharedClient(expected, binding) : client(binding);
    const acquire = Effect.map(Effect.andThen(checkContext(expected), open), (client) =>
      table(client)[tag]!(input),
    );
    const schema = propsOf(binding.protocol.requests.get(tag)!).successSchema;
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
  options: { readonly connection?: Connection } = {},
): Effect.Effect<Client<Rpcs>, never, ClientContext> =>
  Effect.map(ClientContext, (context) =>
    deferredClient(binding, context, options.connection ?? "shared"),
  );
