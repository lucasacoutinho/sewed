import { Schema } from "effect";
import type { Effect, Stream } from "effect";
import type { MainContext } from "./RuntimeContext.ts";
import type { SewedError } from "./SewedError.ts";

export const Options = Schema.Struct({
  url: Schema.String,
  savePath: Schema.String,
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type Options = typeof Options.Type;

const metrics = {
  receivedBytes: Schema.Number,
  totalBytes: Schema.Number,
  percent: Schema.Number,
  currentBytesPerSecond: Schema.Number,
  canResume: Schema.Boolean,
  paused: Schema.Boolean,
} as const;

export const State = Schema.Union([
  Schema.Struct({ ...metrics, status: Schema.Literal("pending") }),
  Schema.Struct({
    ...metrics,
    status: Schema.Literal("active"),
    phase: Schema.Literals(["progressing", "interrupted"]),
  }),
  Schema.Struct({
    ...metrics,
    status: Schema.Literal("terminal"),
    outcome: Schema.Literals(["completed", "cancelled", "interrupted"]),
  }),
]);
export type State = typeof State.Type;

export const Outcome = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("completed") }),
  Schema.Struct({ kind: Schema.Literal("cancelled") }),
  Schema.Struct({ kind: Schema.Literal("interrupted") }),
]);
export type Outcome = typeof Outcome.Type;

export interface Handle {
  readonly snapshot: Effect.Effect<State, SewedError, MainContext>;
  readonly progress: Stream.Stream<State, SewedError, MainContext>;
  readonly awaitDone: Effect.Effect<Outcome, SewedError, MainContext>;
  readonly pause: Effect.Effect<void, SewedError, MainContext>;
  readonly resume: Effect.Effect<void, SewedError, MainContext>;
  readonly cancel: Effect.Effect<void, SewedError, MainContext>;
}
