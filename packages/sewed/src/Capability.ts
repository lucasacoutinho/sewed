import { Context, Effect, Layer } from "effect";
import type { Scope, Stream } from "effect";
import type { Rpc, RpcGroup, RpcSchema } from "effect/unstable/rpc";
import * as Binding from "./Binding.ts";
import { host } from "./Host.ts";
import { ClientContext, MainContext } from "./RuntimeContext.ts";
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

// The native capability calls its handlers in this process: no connection, no encoding, and no
// client environment, so a caller in the runtime that owns the handlers pays nothing for the
// transport. Only the handlers' own requirements remain in the Layer.
export const fromHandlers = <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability<Rpcs, Key>,
  handlers: HandlerLayer<Rpcs, E, R>,
): Layer.Layer<Capability<Rpcs, Key>, E, R> =>
  Layer.effect(capability, CapabilityDispatch.dispatch(capability.slot, handlers));

// `serve` is the document-facing counterpart to `fromHandlers`: whichever capability layer is in
// scope when it runs — native or client — becomes an owner a document can bind to, over the same
// protocol. `host` does the RPC-server work; the only thing `serve` adds is a bridge from the
// capability's own operations to the untyped handler shape `toLayer` expects. That bridge is
// dynamic for the same reason `Binding.methods` and `Binding.table` are: the tags are not known
// until the protocol is inspected at runtime, so the table is built, and read, through `unknown`.
// This is the single `as never` that crosses that gap; nothing beyond it forges a type.
//
// `toLayer`'s own return type states every service a *statically* declared handler set could owe
// — schema and RPC middleware services included — which `refuseMiddleware` has already ruled out
// for any capability's protocol, and a dynamic dispatch table never reads regardless. TypeScript
// cannot see that for an abstract `Rpcs`, so the built layer is asserted into the shape `host`
// expects, exactly as `Remote.ts` asserts the same dynamic-handler shape for its own wire group.
export const serve = <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
): Effect.Effect<
  Binding.Owner<Rpcs>,
  SewedError,
  Capability<Rpcs, Key> | MainContext | Scope.Scope
> =>
  Effect.gen(function* () {
    const shape = yield* capability;
    const table = Binding.table<Rpcs, Operations<Rpcs>>(shape);
    const handlers = capability.protocol.toLayer(
      Object.fromEntries(
        [...capability.protocol.requests.keys()].map((tag) => [
          tag,
          (payload: unknown) => table[tag]!(payload),
        ]),
      ) as never,
    ) as HandlerLayer<Rpcs, never, never>;
    return yield* host(capability.protocol, handlers);
  });

/**
 * The slot a served capability's owner binds to, for a renderer entry's `bindings` list.
 * `Binding.to(capability.slot, owner)` pairs it with the owner `serve` returns.
 */
export const declaration = <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
): Binding.Declaration<Key> => capability.slot;
