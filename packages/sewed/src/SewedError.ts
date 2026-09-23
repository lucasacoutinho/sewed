import { Schema } from "effect";

export class SewedError extends Schema.TaggedError<SewedError>()("SewedError", {
  code: Schema.Literals(["Closed", "Protocol", "Limit", "Startup", "Native", "Unknown"]),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown),
  /**
   * A stable identifier for why this error occurred, set only at the sites that document one
   * (`docs/api.md`'s "Reasons" list is the index). Most failures carry no `reason`: the field
   * exists for a caller that must branch on the specific cause, not on `code` or `message` alone.
   */
  reason: Schema.optionalKey(Schema.String),
}) {}
