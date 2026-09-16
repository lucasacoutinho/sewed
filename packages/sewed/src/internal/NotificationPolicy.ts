import { Effect, Schema, Stream } from "effect";
import * as Notification from "../Notification.ts";
import { SewedError } from "../SewedError.ts";

const decodeOptions = Schema.decodeUnknownSync(Notification.Options);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/**
 * The platform call a notification capability makes once its options have been checked. `native`
 * supplies Electron's `Notification`; a test supplies its own. `R` is whatever that implementation
 * requires, so the rules above it stay free of any runtime requirement of their own.
 */
export interface Core<R> {
  readonly show: (
    options: Notification.Options,
  ) => Stream.Stream<Notification.Event, SewedError, R>;
}

/** The notification operations a capability serves, already behind the options check. */
export interface Operations<R> {
  readonly show: (
    options: Notification.Options,
  ) => Stream.Stream<Notification.Event, SewedError, R>;
}

/**
 * Returns operations that check the options before the core runs, so the core only ever sees
 * options the schema accepted. This is the only place that rule lives for the hosted path, so the
 * native Layer, a served renderer call, and the memory Layer cannot drift apart. The options
 * arrive in the payload, so they are checked per call rather than while the Layer builds, and an
 * invalid request fails on its own stream.
 */
export const operations = <R>(core: Core<R>): Effect.Effect<Operations<R>, SewedError> =>
  Effect.succeed({
    show: (options) =>
      Stream.unwrap(
        Effect.map(
          Effect.try({
            try: () => decodeOptions(options),
            catch: (cause) =>
              cause instanceof SewedError
                ? cause
                : protocolError("Invalid notification options", cause),
          }),
          (settings) => core.show(settings),
        ),
      ),
  });
