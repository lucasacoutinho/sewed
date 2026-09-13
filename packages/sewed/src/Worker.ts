import { Effect, Layer, Scope } from "effect";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import { clientContext, type Bound } from "./Binding.ts";
import { server } from "./Runtime.ts";
import { ClientContext, WorkerContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { handlerLayer, type HandlerLayer } from "./internal/HandlerLayer.ts";
import * as BindingContract from "./internal/BindingContract.ts";

declare const definitionType: unique symbol;
export interface Definition<Rpcs extends Rpc.Any> {
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [definitionType]: (rpc: Rpcs) => Rpcs;
}

export interface Entry<Rpcs extends Rpc.Any> {
  readonly url: URL;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
}

type Server = Effect.Success<ReturnType<typeof server>>;
const definitions = new WeakMap<
  object,
  {
    readonly bindings: readonly { readonly key: string }[];
    readonly program: Effect.Effect<Server, unknown, WorkerContext | ClientContext | Scope.Scope>;
  }
>();

export function define<Rpcs extends Rpc.Any, E>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, WorkerContext>,
): Definition<Rpcs>;
export function define<Rpcs extends Rpc.Any, E>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, WorkerContext | ClientContext>,
  options: { readonly bindings: readonly { readonly key: string }[] },
): Definition<Rpcs>;
export function define<Rpcs extends Rpc.Any, E>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, WorkerContext | ClientContext>,
  options: { readonly bindings: readonly { readonly key: string }[] } = { bindings: [] },
): Definition<Rpcs> {
  const definition = Object.freeze({ protocol }) as Definition<Rpcs>;
  definitions.set(definition, {
    bindings: options.bindings.map(({ key }) => ({ key })),
    program: Effect.gen(function* () {
      const services = yield* Layer.build(handlerLayer(protocol, handlers));
      return yield* server(protocol).pipe(Effect.provideContext(services));
    }),
  });
  return definition;
}

export const entry = <Rpcs extends Rpc.Any>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Entry<Rpcs> => ({ url, protocol });

export const start = (definition: unknown, bindings: readonly Bound[]) =>
  Effect.gen(function* () {
    const registered =
      typeof definition === "object" && definition !== null
        ? definitions.get(definition)
        : undefined;
    if (!registered)
      return yield* Effect.fail(
        new SewedError({
          code: "Startup",
          message: "Worker entry must default-export Worker.define(...)",
        }),
      );
    yield* BindingContract.validate(
      registered.bindings.map(({ key }) => key),
      bindings.map(({ slot }) => slot.key),
      "Worker bindings do not match its dependency declarations",
    );
    const environmentScope = yield* Scope.fork(yield* Effect.scope);
    const context = yield* clientContext(bindings).pipe(Scope.provide(environmentScope));
    return yield* registered.program.pipe(Effect.provideService(ClientContext, context));
  });

export const threadId = Effect.map(WorkerContext, (worker) => worker.threadId);
