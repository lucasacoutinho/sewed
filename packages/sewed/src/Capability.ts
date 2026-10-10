import { Context, Effect, Layer } from "effect";
import type { Stream } from "effect";
import type { Rpc, RpcGroup, RpcSchema } from "effect/rpc";
import * as Binding from "./Binding.ts";
import { ClientContext } from "./RuntimeContext.ts";
import * as CapabilityClient from "./internal/CapabilityClient.ts";
import * as CapabilityDispatch from "./internal/CapabilityDispatch.ts";
import type { HandlerLayer } from "./internal/HandlerLayer.ts";
import { SewedError } from "./SewedError.ts";

/**
 * What a capability offers its caller: one method per RPC, carrying only the requirements that are
 * genuinely the caller's to provide — the protocol's own schema services. Acquiring the capability
 * is what proves the environment, so an operation needs no client context, no scope, and no
 * middleware service. Both layers satisfy this: the native one calls handlers directly, and the
 * client one captures its environment when it is built.
 */
export type Operations<Rpcs extends Rpc.Any> = {
  readonly [Current in Rpcs as Current["_tag"]]: (
    input: Rpc.PayloadConstructor<Current>,
  ) => Current extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer Success,
    infer Error,
    infer _Middleware,
    infer _Requires
  >
    ? Success extends RpcSchema.Stream<infer A, infer E>
      ? Stream.Stream<
          A["Type"],
          E["Type"] | Error["Type"] | SewedError,
          Rpc.ServicesClient<Current>
        >
      : Effect.Effect<Success["Type"], Error["Type"] | SewedError, Rpc.ServicesClient<Current>>
    : never;
};

export interface Capability<
  Rpcs extends Rpc.Any,
  Key extends string = string,
> extends Context.Service<Capability<Rpcs, Key>, Operations<Rpcs>> {
  readonly key: Key;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly slot: Binding.Slot<Rpcs, Key>;
}

// The shape `Client` and `Implementation` need of their type parameter: the capability's nominal
// `key` (every real `Capability` carries one through `Context.Service`, and nothing else does, so
// a bare `{ protocol }` object without it is refused instead of silently extracting an empty
// shape) plus the one property they read from `protocol`, only as far as recovering its Rpcs
// needs. Naming the full `Capability<Rpc.Any, string>` interface here instead — which is what the
// type reads like it should be — asks TypeScript to compare a concrete capability's
// `RpcGroup<Rpcs>` against `RpcGroup<Rpc.Any>` structurally in both directions, because
// `RpcGroup`'s own type parameter is declared invariant; and one direction fails, because
// `Rpc.Any` cannot satisfy the `Rpc<Tag, Payload, ...>` pattern several of `RpcGroup`'s own methods
// (`middleware`, `omit`, `prefix`) match on, so those methods' return types collapse to
// `RpcGroup<never>` for `Rpc.Any` where they do not for a real protocol. That makes every concrete
// `typeof capability` fail the full interface bound — proven, not assumed:
// `Capability.define("x", Protocol) satisfies Capability<Rpc.Any, string>` does not compile. This
// narrower shape asks nothing else of `C`, so a concrete capability satisfies it outright.
type HasProtocol = {
  readonly key: string;
  readonly protocol: { readonly requests: ReadonlyMap<string, Rpc.Any> };
};

// The `Rpcs` a capability's protocol declares, recovered from the capability itself so a helper
// can be written against `typeof capability` alone. An indexed access into `C["protocol"]`, handed
// to Effect's own `RpcGroup.Rpcs` — which already extracts correctly from a concrete protocol,
// because that check never compares two different instantiations of `RpcGroup` against each other —
// reads the property without ever comparing it against `RpcGroup<Rpc.Any>`.
type RpcsOf<C extends HasProtocol> = RpcGroup.Rpcs<C["protocol"]>;

/**
 * A capability's operations: what `yield* capability` answers, named so a helper can take it as a
 * parameter instead of writing out `Operations<Rpcs>` by hand.
 */
export type Client<C extends HasProtocol> = Operations<RpcsOf<C>>;

/**
 * A capability's handler record — one function per operation — sharing the requirement `R`.
 * Effect's own `RpcGroup.HandlersFrom` types every handler's requirement as `any`, because its
 * `Rpc.ToHandlerFn` defaults `R` to `any` when nothing supplies one; a record annotated with
 * `HandlersFrom` therefore makes `toLayer` infer `R = any`, and a host built over it collapses
 * `R | MainContext | Scope` to `any` — a requirement no caller can discharge, so `Effect.runPromise`
 * accepts it though nothing was actually provided. A record typed with `Implementation` keeps `R`,
 * so the host built from it carries a requirement a caller can still discharge, and `R` defaults to
 * `never` for a record whose handlers need nothing.
 */
export type Implementation<C extends HasProtocol, R = never> = {
  readonly [Current in RpcsOf<C> as Current["_tag"]]: Rpc.ToHandlerFn<Current, R>;
};

// RPC middleware is applied by the server that owns the transport, on a path a native call never
// reaches. Rather than let the two layers of one capability behave differently, a protocol that
// declares middleware has no capability at all, and says so where the capability is defined.
const refuseMiddleware = <Rpcs extends Rpc.Any>(
  key: string,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): void => {
  for (const [tag, request] of protocol.requests) {
    if (Binding.propsOf(request).middlewares.size === 0) continue;
    throw new SewedError({
      code: "Protocol",
      message:
        `Capability ${key} declares RPC middleware on ${tag}, ` + `which a capability cannot apply`,
    });
  }
};

export const define = <const Name extends string, Rpcs extends Rpc.Any>(
  name: Name,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Capability<Rpcs, `sewed/binding/${Name}`> => {
  const slot = Binding.slot(name, protocol);
  refuseMiddleware(slot.key, protocol);
  const tag = Context.Service<Capability<Rpcs, typeof slot.key>, Operations<Rpcs>>(slot.key);
  return Object.assign(tag, { key: slot.key, protocol, slot });
};

// The client capability reaches its owner over a binding. It reads the client environment once,
// while this layer builds, and provides it around every call, so an operation carries none of it:
// composing with Layer.provide is enough, and a caller needs no scope of its own.
export const client = <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
  options: { readonly connection?: Binding.Connection } = {},
): Layer.Layer<Capability<Rpcs, Key>, never, ClientContext> =>
  Layer.effect(capability, CapabilityClient.operations(capability.slot, options));

/**
 * The handlers a host serves for a capability's protocol: a Layer of the protocol's handlers, or
 * a function of `implement` (the protocol's `toLayer`) returning one. This is what
 * {@link fromHandlers}, `Testing.client`, and `Testing.layer` all take, named so a function can
 * take a host as a parameter.
 */
export type Handlers<Rpcs extends Rpc.Any, E = never, R = never> = HandlerLayer<Rpcs, E, R>;

// The native capability calls its handlers in this process: no connection, no encoding, and no
// client environment, so a caller in the runtime that owns the handlers pays nothing for the
// transport. Only the handlers' own requirements remain in the Layer.
export const fromHandlers = <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability<Rpcs, Key>,
  handlers: HandlerLayer<Rpcs, E, R>,
): Layer.Layer<Capability<Rpcs, Key>, E, R> =>
  Layer.effect(capability, CapabilityDispatch.dispatch(capability.slot, handlers));

// `serve` is the document-facing counterpart to `fromHandlers`, and it lives in
// `internal/CapabilityServe.ts`, which `sewed/main` exports. It builds an RPC server and requires
// `MainContext`, exactly as `host` does, so it belongs behind the main entry point: every
// capability's root module imports this file to define its contract, and a renderer imports those
// root modules, so a server reachable from here would enter every renderer bundle.

/**
 * The slot a served capability's owner binds to, for a renderer entry's `bindings` list.
 * `Binding.to(capability.slot, owner)` pairs it with the owner `serve` returns.
 */
export const declaration = <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
): Binding.Declaration<Key> => capability.slot;
