import { Effect, Layer } from "effect";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import { makeOwner } from "./Binding.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { scopedConnection, server } from "./Runtime.ts";
import { MainContext } from "./RuntimeContext.ts";
import { pair } from "./internal/Transport.ts";
import { handlerLayer, type HandlerLayer } from "./internal/HandlerLayer.ts";

export const host = <Rpcs extends Rpc.Any, E, R>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, R>,
) =>
  Effect.gen(function* () {
    yield* MainContext;
    const id = yield* generateInstanceId();
    const services = yield* Layer.build(handlerLayer(protocol, handlers));
    const runtime = yield* server(protocol, { ownerId: id }).pipe(Effect.provideContext(services));
    return makeOwner(
      id,
      protocol,
      {
        connect: scopedConnection(() => {
          const [client, server] = pair();
          runtime.accept(server);
          return client;
        }),
      },
      {},
    );
  });
