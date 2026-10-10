import { Effect } from "effect";
import type { Scope } from "effect";
import type { Rpc } from "effect/rpc";
import * as Binding from "../Binding.ts";
import type { Capability, Operations } from "../Capability.ts";
import { host } from "../Host.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { HandlerLayer } from "./HandlerLayer.ts";

export * from "../Capability.ts";

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
//
// This lives in a main-only module rather than beside `define` and `client`, because it builds an
// RPC server and requires `MainContext`, exactly as `host` does. The root entry a renderer imports
// must not reach main implementations, and every capability's root module imports `Capability.ts`
// to define its contract, so `serve` living there would pull the server into every renderer bundle.
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
          (payload: unknown) => {
            const method = table[tag];
            if (method === undefined) {
              return Effect.fail(
                new SewedError({
                  code: "Protocol",
                  message: `Capability ${capability.key} has no handler for ${tag}`,
                }),
              );
            }
            return method(payload);
          },
        ]),
      ) as never,
    ) as HandlerLayer<Rpcs, never, never>;
    return yield* host(capability.protocol, handlers);
  });
