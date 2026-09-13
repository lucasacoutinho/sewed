import { Schema } from "effect";

export const CaptureMode = Schema.Literals(["default", "includeSensitive", "everything"]);
export type CaptureMode = typeof CaptureMode.Type;

export const Options = Schema.Struct({
  captureMode: Schema.optionalKey(CaptureMode),
  maxFileSize: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
});
export type Options = typeof Options.Type;
