import { Schema, SchemaGetter } from "effect";

const diagnostic = Schema.Json.pipe(
  Schema.decodeTo(Schema.Unknown, {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.transform(Schema.encodeSync(Schema.Defect())),
  }),
);

export const SewedErrorCode = Schema.Literals([
  "Closed",
  "Protocol",
  "Limit",
  "Startup",
  "Native",
  "Unknown",
]);
export type SewedErrorCode = typeof SewedErrorCode.Type;

/**
 * Documented stable reasons attached to a `SewedError` when callers need to branch on a specific
 * cause beyond `code`.
 */
export const SewedErrorReason = Schema.Literals([
  "history/no-entry",
  "policy/denied",
  "transport/answer-over-limit",
  "transport/answer-refused",
  "transport/closed-before-send",
  "transport/lost-after-send",
  "transport/pending-bytes-limit",
  "transport/undecodable-answer",
  "transport/undecodable-request",
]);
export type SewedErrorReason = typeof SewedErrorReason.Type;

export class SewedError extends Schema.TaggedError<SewedError>()("SewedError", {
  code: SewedErrorCode,
  message: Schema.String,
  cause: Schema.optionalKey(diagnostic),
  /**
   * A stable identifier for why this error occurred, set only at the sites that document one.
   * Most failures carry no `reason`.
   */
  reason: Schema.optionalKey(SewedErrorReason),
}) {
  static readonly Code = SewedErrorCode;
  static readonly Reason = SewedErrorReason;
  static readonly isCode =
    <C extends SewedErrorCode>(code: C) =>
    (error: unknown): error is SewedError & { readonly code: C } =>
      error instanceof SewedError && error.code === code;
  static readonly isReason =
    <R extends SewedErrorReason>(reason: R) =>
    (error: unknown): error is SewedError & { readonly reason: R } =>
      error instanceof SewedError && error.reason === reason;
}
