import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import * as PowerMonitor from "../PowerMonitor.ts";
import { SewedError } from "../SewedError.ts";

const decodeThreshold = Schema.decodeUnknownSync(PowerMonitor.IdleThreshold);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/**
 * The platform calls a power capability makes once its input has been checked. `native` supplies
 * Electron's `powerMonitor`; a test supplies its own. `R` is whatever that implementation
 * requires, so the rules above it stay free of any runtime requirement of their own.
 */
export interface Core<R> {
  readonly state: (
    idleThresholdSeconds: number,
  ) => Effect.Effect<PowerMonitor.State, SewedError, R>;
  readonly events: Stream.Stream<PowerMonitor.Event, SewedError, R>;
}

/**
 * The power operations a capability serves, each one already behind the threshold check. That
 * check rejects a bad threshold without changing any signature, so this is the core's shape
 * exactly. One declaration, so the two cannot drift.
 */
export type Operations<R> = Core<R>;

/**
 * Returns operations that check the idle threshold before the core runs. This is the only place
 * that rule lives for the hosted path, so the native Layer, a served renderer call, and the memory
 * Layer cannot drift apart. The threshold arrives in the payload, so it is checked per call rather
 * than while the Layer builds. Observing events takes no input and is always allowed.
 */
export const operations = <R>(core: Core<R>): Effect.Effect<Operations<R>, SewedError> =>
  Effect.succeed({
    state: (idleThresholdSeconds) =>
      Effect.andThen(
        Effect.try({
          try: () => decodeThreshold(idleThresholdSeconds),
          catch: (cause) =>
            cause instanceof SewedError ? cause : protocolError("Invalid idle threshold", cause),
        }),
        (threshold) => core.state(threshold),
      ),
    events: core.events,
  });
