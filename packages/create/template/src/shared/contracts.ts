import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const ClockProtocol = RpcGroup.make(
  Rpc.make("thread", { success: Schema.Finite }),
  Rpc.make("ticks", { success: Schema.Finite, stream: true }),
);
