import { Effect } from "effect";
import { SewedError } from "../SewedError.ts";

/**
 * Shared by `internal/Session.ts` and `internal/SessionSettings.ts`, which cannot import each other's
 * copy directly: `SessionSettings.ts` imports `resolve` from `Session.ts`, so `Session.ts` importing
 * back from `SessionSettings.ts` would be a cycle. Neither imports this module's own dependencies
 * (`effect`, `SewedError`), so both importing from here instead is cycle-free.
 */
export const protocolError = (message: string, cause?: unknown, reason?: string): SewedError =>
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
