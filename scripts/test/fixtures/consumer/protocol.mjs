import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { SewedError } from "sewed";

export const Protocol = RpcGroup.make(
  Rpc.make("thread", { success: Schema.Number, error: SewedError }),
);
