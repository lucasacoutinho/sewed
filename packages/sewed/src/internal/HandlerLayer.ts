import type { Layer } from "effect";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import type { HandlerServices } from "../Runtime.ts";

// Extract requirements before blocking inference; wrapping Rpcs can suppress union distribution.
export type HandlerLayer<Rpcs extends Rpc.Any, E, R> =
  | Layer.Layer<NoInfer<HandlerServices<Rpcs>>, E, R>
  | ((
      implement: NoInfer<RpcGroup.RpcGroup<Rpcs>["toLayer"]>,
    ) => Layer.Layer<NoInfer<HandlerServices<Rpcs>>, E, R>);

export const handlerLayer = <Rpcs extends Rpc.Any, E, R>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, R>,
): Layer.Layer<HandlerServices<Rpcs>, E, R> =>
  typeof handlers === "function" ? handlers(protocol.toLayer.bind(protocol)) : handlers;
