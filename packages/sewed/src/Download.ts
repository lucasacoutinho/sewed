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

/**
 * What a download knows about its file and its response: where it is being saved, when it started
 * and ended (seconds since the epoch; `endTime` is zero until it ends), and the validators a
 * server needs to resume it. `savePath` is empty until a path is chosen.
 */
export const Details = Schema.Struct({
  savePath: Schema.String,
  startTime: Schema.Finite,
  endTime: Schema.Finite,
  eTag: Schema.String,
  lastModified: Schema.String,
});
export type Details = typeof Details.Type;

/**
 * A download interrupted in an earlier run, described well enough to continue it: the partial
 * file at `path`, the URLs it came through, how many bytes are there (`offset`) and how many the
 * whole file has (`length`), and the validators the server sent.
 */
export const Resume = Schema.Struct({
  path: Schema.String.check(Schema.isMinLength(1)),
  urlChain: Schema.NonEmptyArray(Schema.String.check(Schema.isMinLength(1))),
  mimeType: Schema.optionalKey(Schema.String),
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  length: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  lastModified: Schema.optionalKey(Schema.String),
  eTag: Schema.optionalKey(Schema.String),
  startTime: Schema.optionalKey(Schema.Finite),
});
export type Resume = typeof Resume.Type;

export interface Handle {
  readonly snapshot: Effect.Effect<State, SewedError, MainContext>;
  /** The file and response facts of the download; see {@link Details}. */
  readonly details: Effect.Effect<Details, SewedError, MainContext>;
  readonly progress: Stream.Stream<State, SewedError, MainContext>;
  readonly awaitDone: Effect.Effect<Outcome, SewedError, MainContext>;
  readonly pause: Effect.Effect<void, SewedError, MainContext>;
  readonly resume: Effect.Effect<void, SewedError, MainContext>;
  readonly cancel: Effect.Effect<void, SewedError, MainContext>;
}
