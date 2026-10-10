import { Effect, Layer, Scope } from "effect";
import type { Rpc, RpcGroup } from "effect/rpc";
import { clientContext, type Bound, type Declaration } from "./Binding.ts";
import { server } from "./Runtime.ts";
import { ClientContext, WorkerContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { handlerLayer, type HandlerLayer } from "./internal/HandlerLayer.ts";
import * as BindingContract from "./internal/BindingContract.ts";

declare const definitionType: unique symbol;
export interface Definition<Rpcs extends Rpc.Any, Keys extends string = never> {
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [definitionType]: { readonly rpcs: (rpc: Rpcs) => Rpcs; readonly keys: Keys };
}

/**
 * The entry's declared dependency keys. `string` leaves the spawn bindings unchecked; a
 * definition-typed or declaration-typed entry narrows them to the exact dependency set.
 */
export interface Entry<Rpcs extends Rpc.Any, Keys extends string = string> {
  readonly url: URL;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly bindings: readonly Declaration<Keys>[];
}

export type DefinitionRpcs<D> = D extends Definition<infer Rpcs, infer _Keys> ? Rpcs : never;
export type DefinitionKeys<D> = D extends Definition<infer _Rpcs, infer Keys> ? Keys : never;

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
): Definition<Rpcs, never>;
export function define<Rpcs extends Rpc.Any, E, Keys extends string>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, WorkerContext | ClientContext>,
  options: { readonly bindings: readonly Declaration<Keys>[] },
): Definition<Rpcs, Keys>;
export function define<Rpcs extends Rpc.Any, E, Keys extends string>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, WorkerContext | ClientContext>,
  options: { readonly bindings: readonly Declaration<Keys>[] } = { bindings: [] },
): Definition<Rpcs, Keys> {
  const definition = Object.freeze({ protocol }) as Definition<Rpcs, Keys>;
  definitions.set(definition, {
    bindings: options.bindings.map(({ key }) => ({ key })),
    program: Effect.gen(function* () {
      const services = yield* Layer.build(handlerLayer(protocol, handlers));
      return yield* server(protocol).pipe(Effect.provideContext(services));
    }),
  });
  return definition;
}

export function entry<Rpcs extends Rpc.Any>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Entry<Rpcs, string>;
export function entry<Rpcs extends Rpc.Any, Keys extends string>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: { readonly bindings: readonly Declaration<Keys>[] },
): Entry<Rpcs, Keys>;
/** Types the entry from the worker module without importing it into main. */
export function entry<Module extends { readonly default: unknown }>(
  url: URL,
  protocol: RpcGroup.RpcGroup<DefinitionRpcs<Module["default"]>>,
): Entry<DefinitionRpcs<Module["default"]>, DefinitionKeys<Module["default"]>>;
export function entry<Rpcs extends Rpc.Any, Keys extends string>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: { readonly bindings: readonly Declaration<Keys>[] } = { bindings: [] },
): Entry<Rpcs, Keys> {
  return { url, protocol, bindings: options.bindings };
}

export const start = (definition: unknown, bindings: readonly Bound[]) =>
  Effect.gen(function* () {
    const registered =
      typeof definition === "object" && definition !== null
        ? definitions.get(definition)
        : undefined;
    if (!registered)
      return yield* new SewedError({
        code: "Startup",
        message: "Worker entry must default-export Worker.define(...)",
      });
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
