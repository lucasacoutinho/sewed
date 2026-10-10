import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { SewedError } from "../lib/index.js";

/** @type {typeof Schema.TaggedError<Rejected>} */
const taggedError = Schema.TaggedError;
export class Rejected extends taggedError()("Rejected", { message: Schema.String }) {}

export const Protocol = RpcGroup.make(
  Rpc.make("info", {
    success: Schema.Struct({
      thread: Schema.Number,
      alive: Schema.Boolean,
      active: Schema.Number,
      released: Schema.Number,
    }),
    error: SewedError,
  }),
  Rpc.make("wait", {
    payload: { milliseconds: Schema.Number },
    success: Schema.String,
    error: SewedError,
  }),
  Rpc.make("echo", {
    payload: { value: Schema.String },
    success: Schema.String,
    error: SewedError,
  }),
  Rpc.make("reject", { error: Schema.Union([Rejected, SewedError]) }),
  Rpc.make("events", { success: Schema.Number, error: SewedError, stream: true }),
);
