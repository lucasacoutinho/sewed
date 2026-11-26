import { Effect } from "effect";
import { SewedError, type SewedErrorReason } from "../SewedError.ts";

/**
 * Shared by session and web contents modules to build `Protocol` errors without circular imports.
 */
export const protocolError = (
  message: string,
  cause?: unknown,
  reason?: SewedErrorReason,
): SewedError =>
  new SewedError({
    code: "Protocol",
    message,
    ...(cause === undefined ? {} : { cause }),
    ...(reason === undefined ? {} : { reason }),
  });

/** Wraps `run`, mapping anything it throws to a `Protocol` `SewedError` unless it already is one. */
export const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });
