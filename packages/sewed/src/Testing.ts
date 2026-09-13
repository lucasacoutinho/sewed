import { Effect, Layer } from "effect";
import type { Rpc } from "effect/unstable/rpc";
import { clientContext, to, type Slot } from "./Binding.ts";
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
): Layer.Layer<ClientContext, E | SewedError, R> =>
  Layer.effect(
    ClientContext,
    Effect.gen(function* () {
      const owner = yield* host(slot.protocol, handlers).pipe(Effect.provide(main));
      return yield* clientContext([to(slot, owner)]);
    }),
  );
