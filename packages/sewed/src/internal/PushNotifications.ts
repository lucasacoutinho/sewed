import type { EventEmitter } from "node:events";
import { pushNotifications } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const service = () => {
  if (process.platform !== "darwin")
    throw nativeError("Push notifications are unavailable on this platform", undefined);
  return pushNotifications;
};
const decodeJson = Schema.decodeUnknownSync(Schema.Json);

/** Registers with APNS and returns the device token; macOS only, `Native` elsewhere. */
export const register: Effect.Effect<string, SewedError, MainContext> = Effect.andThen(
  MainContext,
  Effect.tryPromise({
    try: () => service().registerForAPNSNotifications(),
    catch: (cause) =>
      cause instanceof SewedError
        ? cause
        : nativeError("Could not register for push notifications", cause),
  }),
);

export const unregister: Effect.Effect<void, SewedError, MainContext> = Effect.andThen(
  MainContext,
  Effect.try({
    try: () => {
      service().unregisterForAPNSNotifications();
    },
    catch: (cause) =>
      cause instanceof SewedError
        ? cause
        : nativeError("Could not unregister push notifications", cause),
  }),
);

/** Received APNS payloads as JSON; each observer owns its listener and a queue of 128 payloads. */
export const notifications: Stream.Stream<typeof Schema.Json.Type, SewedError, MainContext> =
  Stream.callback<typeof Schema.Json.Type, SewedError, MainContext>(
    (queue) =>
      Effect.gen(function* () {
        yield* MainContext;
        const emitter: EventEmitter = yield* Effect.try({
          try: () => service(),
          catch: (cause) =>
            cause instanceof SewedError
              ? cause
              : nativeError("Could not observe notifications", cause),
        });
        const listener = (_event: unknown, userInfo: unknown) => {
          let payload: typeof Schema.Json.Type;
          try {
            payload = decodeJson(userInfo);
          } catch {
            return;
          }
          if (!Queue.offerUnsafe(queue, payload))
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new SewedError({ code: "Limit", message: "Notification observer queue is full" }),
              ),
            );
        };
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            emitter.on("received-apns-notification", listener);
          }),
          () =>
            Effect.sync(() => {
              emitter.off("received-apns-notification", listener);
            }),
        );
      }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
    { bufferSize: 128 },
  );
