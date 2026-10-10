import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { SewedError } from "../lib/index.js";

/** @type {typeof Schema.TaggedError<Rejected>} */
const taggedError = Schema.TaggedError;
export class Rejected extends taggedError()("Rejected", { message: Schema.String }) {}

export const Protocol = RpcGroup.make(
  Rpc.make("info", {
    success: Schema.Struct({
      thread: Schema.Finite,
      alive: Schema.Boolean,
      active: Schema.Finite,
      released: Schema.Finite,
    }),
    error: SewedError,
  }),
  Rpc.make("wait", {
    payload: { milliseconds: Schema.Finite },
    success: Schema.String,
    error: SewedError,
  }),
  Rpc.make("echo", {
    payload: { value: Schema.String },
    success: Schema.String,
    error: SewedError,
  }),
  Rpc.make("reject", { error: Schema.Union([Rejected, SewedError]) }),
  Rpc.make("events", { success: Schema.Finite, error: SewedError, stream: true }),
);
