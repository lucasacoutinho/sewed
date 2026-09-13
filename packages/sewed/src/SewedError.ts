import { Schema } from "effect";

export class SewedError extends Schema.TaggedError<SewedError>()("SewedError", {
  code: Schema.Literals(["Closed", "Protocol", "Limit", "Startup", "Native"]),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown),
}) {}
