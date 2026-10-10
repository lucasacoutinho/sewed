import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { SewedError } from "sewed";

export const Protocol = RpcGroup.make(
  Rpc.make("thread", { success: Schema.Number, error: SewedError }),
);
