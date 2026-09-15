import { Effect, Layer } from "effect";
import type { Rpc } from "effect/unstable/rpc";
import { clientContext, factoryOf, makeBound, to, type Slot } from "./Binding.ts";
import { host } from "./Host.ts";
import { type HandlerServices } from "./Runtime.ts";
import { ClientContext, MainContext, mainIdentity } from "./RuntimeContext.ts";
import type { SewedError } from "./SewedError.ts";

export const main = Layer.succeed(MainContext, mainIdentity);

export { host } from "./Host.ts";
export * as Worker from "./WorkerHost.ts";

export const layer = <Rpcs extends Rpc.Any, E, R>(
  slot: Slot<Rpcs>,
  handlers: Layer.Layer<NoInfer<HandlerServices<Rpcs>>, E, R>,
  options: { readonly onConnect?: () => void } = {},
): Layer.Layer<ClientContext, E | SewedError, R> =>
  Layer.effect(
    ClientContext,
    Effect.gen(function* () {
      const owner = yield* host(slot.protocol, handlers).pipe(Effect.provide(main));
      const bound = to(slot, owner);
      const { onConnect } = options;
      const binding =
        onConnect === undefined
          ? bound
          : makeBound(slot, bound.ownerId, {
              connect: Effect.tap(factoryOf(bound).connect, () => Effect.sync(onConnect)),
            });
      return yield* clientContext([binding]);
    }),
  );
