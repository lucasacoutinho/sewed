import { pushNotifications } from "electron";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observation from "./Observation.ts";

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
  Observation.fromEmitter("Notification", service, [
    [
      "received-apns-notification",
      (_event: unknown, userInfo: unknown) => {
        try {
          return decodeJson(userInfo);
        } catch {
          return undefined;
        }
      },
    ],
  ]);
