import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const ClockProtocol = RpcGroup.make(
  Rpc.make("thread", { success: Schema.Number }),
  Rpc.make("ticks", { success: Schema.Number, stream: true }),
);
