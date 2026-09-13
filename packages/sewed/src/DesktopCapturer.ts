import { Schema } from "effect";
import * as Binary from "./Binary.ts";

export const SourceType = Schema.Literals(["screen", "window"]);
export type SourceType = typeof SourceType.Type;

const Dimension = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const Options = Schema.Struct({
  types: Schema.NonEmptyArray(SourceType),
  thumbnailSize: Schema.optionalKey(Schema.Struct({ width: Dimension, height: Dimension })),
  fetchWindowIcons: Schema.optionalKey(Schema.Boolean),
});
export type Options = typeof Options.Type;

/** A capturable screen or window; thumbnails and icons are PNG bytes, empty when not fetched. */
export const Source = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  displayId: Schema.String,
  thumbnail: Binary.Bytes,
  icon: Schema.NullOr(Binary.Bytes),
});
export type Source = typeof Source.Type;

export const Request = Schema.Struct({
  origin: Schema.String,
  videoRequested: Schema.Boolean,
  audioRequested: Schema.Boolean,
  userGesture: Schema.Boolean,
});
export type Request = typeof Request.Type;

/** What a display media request receives: nothing, or one capture source with optional system audio. */
export const Decision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({
    kind: Schema.Literal("source"),
    id: Schema.String.check(Schema.isMinLength(1)),
    audio: Schema.optionalKey(Schema.Literals(["loopback", "loopbackWithMute"])),
  }),
]);
export type Decision = typeof Decision.Type;
