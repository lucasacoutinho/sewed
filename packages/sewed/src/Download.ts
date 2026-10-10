import { Schema } from "effect";
import * as Dialog from "./Dialog.ts";
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
  receivedBytes: Schema.Finite,
  totalBytes: Schema.Finite,
  percent: Schema.Finite,
  currentBytesPerSecond: Schema.Finite,
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

/** A download a document started; `sourceId` names the Sewed window, view, or guest that started it. */
export const Offer = Schema.Struct({
  url: Schema.String,
  filename: Schema.String,
  mimeType: Schema.String,
  totalBytes: Schema.Finite,
  sourceId: Schema.String,
  /** Every URL the request passed through, the first being the one asked for and the last `url`. */
  urlChain: Schema.Array(Schema.String),
  /** Whether a user gesture started the download, as opposed to the page on its own. */
  userGesture: Schema.Boolean,
  /** The response's `Content-Disposition` header, empty when it sent none. */
  contentDisposition: Schema.String,
});
export type Offer = typeof Offer.Type;

/**
 * What happens to an offered download: `deny` cancels it, `save` writes to a path without a
 * dialog, and `prompt` lets Electron show its save dialog, with these options when given.
 */
export const Decision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({ kind: Schema.Literal("save"), path: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("prompt"), dialog: Schema.optionalKey(Dialog.SaveOptions) }),
]);
export type Decision = typeof Decision.Type;

export interface Handle {
  readonly snapshot: Effect.Effect<State, SewedError, MainContext>;
  readonly progress: Stream.Stream<State, SewedError, MainContext>;
  readonly awaitDone: Effect.Effect<Outcome, SewedError, MainContext>;
  readonly pause: Effect.Effect<void, SewedError, MainContext>;
  readonly resume: Effect.Effect<void, SewedError, MainContext>;
  readonly cancel: Effect.Effect<void, SewedError, MainContext>;
}
