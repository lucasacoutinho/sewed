import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class Rejected extends Schema.TaggedError()("Rejected", { message: Schema.String }) {}

export const Protocol = RpcGroup.make(
  Rpc.make("info", {
    success: Schema.Struct({
      thread: Schema.Number,
      alive: Schema.Boolean,
      active: Schema.Number,
      released: Schema.Number,
    }),
  }),
  Rpc.make("wait", { payload: { milliseconds: Schema.Number }, success: Schema.String }),
  Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
  Rpc.make("reject", { error: Rejected }),
  Rpc.make("events", { success: Schema.Number, stream: true }),
);
