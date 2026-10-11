import { systemPreferences } from "electron";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as SystemPreferences from "../SystemPreferences.ts";
import * as Observation from "./Observation.ts";
import { only } from "./Platform.ts";

export {
  Animation,
  Appearance,
  Change,
  ColorName,
  MediaAccess,
  CenterNotification,
  Defaults,
  MediaKind,
  NotificationCenter,
  SystemColor,
} from "../SystemPreferences.ts";

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });
/** Electron leaves platform-specific functions undefined elsewhere; report that as Native. */
const supported = <K extends keyof typeof systemPreferences>(name: K) => {
  if (typeof systemPreferences[name] !== "function")
    throw nativeError(`${String(name)} is unavailable on this platform`, undefined);
  return systemPreferences;
};
const operation = <A>(message: string, run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );

const decodeMediaKind = Schema.decodeUnknownSync(SystemPreferences.MediaKind);
const decodeColorName = Schema.decodeUnknownSync(SystemPreferences.ColorName);
const decodeSystemColor = Schema.decodeUnknownSync(SystemPreferences.SystemColor);

export const animation: Effect.Effect<SystemPreferences.Animation, SewedError, MainContext> =
  operation("Could not read animation settings", () => {
    const settings = systemPreferences.getAnimationSettings();
    return {
      shouldRenderRichAnimation: settings.shouldRenderRichAnimation,
      scrollAnimationsEnabledBySystem: settings.scrollAnimationsEnabledBySystem,
      prefersReducedMotion: settings.prefersReducedMotion,
    };
  });

export const accentColor: Effect.Effect<string, SewedError, MainContext> = operation(
  "Could not read the accent color",
  () => supported("getAccentColor").getAccentColor(),
);

export const appearance: Effect.Effect<SystemPreferences.Appearance, SewedError, MainContext> =
  operation("Could not read the effective appearance", () =>
    supported("getEffectiveAppearance").getEffectiveAppearance(),
  );

export const mediaAccess = (
  kind: SystemPreferences.MediaKind,
): Effect.Effect<SystemPreferences.MediaAccess, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid media kind", () => decodeMediaKind(kind)),
    (value) =>
      operation("Could not read media access status", () =>
        supported("getMediaAccessStatus").getMediaAccessStatus(value),
      ),
  );

export const askForMediaAccess = (
  kind: Exclude<SystemPreferences.MediaKind, "screen">,
): Effect.Effect<boolean, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid media kind", () => {
      const value = decodeMediaKind(kind);
      if (value === "screen") throw protocolError("Screen access cannot be requested");
      return value;
    }),
    (value) =>
      Effect.andThen(
        MainContext,
        Effect.tryPromise({
          try: () => supported("askForMediaAccess").askForMediaAccess(value),
          catch: (cause) =>
            cause instanceof SewedError
              ? cause
              : nativeError("Could not ask for media access", cause),
        }),
      ),
  );

export const color = (name: string): Effect.Effect<string, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid color name", () => decodeColorName(name)),
    (value) =>
      operation("Could not read the system color", () =>
        supported("getColor").getColor(value as Parameters<typeof systemPreferences.getColor>[0]),
      ),
  );

export const systemColor = (
  name: SystemPreferences.SystemColor,
): Effect.Effect<string, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid system color", () => decodeSystemColor(name)),
    (value) =>
      operation("Could not read the system color", () =>
        supported("getSystemColor").getSystemColor(value),
      ),
  );

/** Accent and theme color changes; each observer owns its listeners and a queue of 128 changes. */
export const changes: Stream.Stream<SystemPreferences.Change, SewedError, MainContext> =
  Observation.fromEmitter<SystemPreferences.Change>("System preference", () => systemPreferences, [
    [
      "accent-color-changed",
      (_event: unknown, color: unknown) => ({ kind: "accent-color", color: String(color) }),
    ],
    ["color-changed", () => ({ kind: "color" })],
  ]);

const decodeText = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeFlag = Schema.decodeUnknownSync(Schema.Boolean);
const decodeDefaults = Schema.decodeUnknownSync(SystemPreferences.Defaults);
const decodeCenter = Schema.decodeUnknownSync(SystemPreferences.NotificationCenter);
const decodeEvent = Schema.decodeUnknownSync(
  Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
);
const decodeUserInfo = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json));
const isJson = Schema.is(Schema.Json);

/** Whether this Mac can ask for Touch ID. */
export const canPromptTouchId: Effect.Effect<boolean, SewedError, MainContext> = operation(
  "Could not read Touch ID availability",
  () => {
    only(["darwin"], "Touch ID");
    return systemPreferences.canPromptTouchID();
  },
);

/**
 * Asks the user to authenticate with Touch ID, showing `reason`. Succeeds when they do and fails
 * `Native` when they cancel or cannot.
 */
export const promptTouchId = (reason: string): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid Touch ID reason", () => decodeText(reason)),
    (value) =>
      Effect.andThen(
        MainContext,
        Effect.tryPromise({
          try: async () => {
            only(["darwin"], "Touch ID");
            await systemPreferences.promptTouchID(value);
          },
          catch: (cause) =>
            cause instanceof SewedError ? cause : nativeError("Touch ID was not confirmed", cause),
        }),
      ),
  );

/**
 * Whether the application is trusted to use the macOS accessibility API; with `prompt`, macOS
 * asks the user to grant it when it is not.
 */
export const trustedAccessibilityClient = (
  prompt = false,
): Effect.Effect<boolean, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid prompt flag", () => decodeFlag(prompt)),
    (value) =>
      operation("Could not read accessibility trust", () => {
        only(["darwin"], "Accessibility trust");
        return systemPreferences.isTrustedAccessibilityClient(value);
      }),
  );

/** Whether the user enabled swiping between pages with a scroll gesture, on macOS. */
export const swipeTrackingFromScrollEvents: Effect.Effect<boolean, SewedError, MainContext> =
  operation("Could not read swipe tracking", () => {
    only(["darwin"], "Swipe tracking");
    return systemPreferences.isSwipeTrackingFromScrollEventsEnabled();
  });

/** Registers fallback values in the macOS user defaults, used until a key is set. */
export const registerDefaults = (
  defaults: SystemPreferences.Defaults,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid defaults", () => decodeDefaults(defaults)),
    (value) =>
      operation("Could not register defaults", () => {
        only(["darwin"], "User defaults");
        systemPreferences.registerDefaults({ ...value });
      }),
  );

const decodeUserDefaultType = Schema.decodeUnknownSync(SystemPreferences.UserDefaultType);
const decodeUserDefault = Schema.decodeUnknownSync(SystemPreferences.UserDefault);

/**
 * Reads a key of the macOS user defaults as the given type. What comes back is checked against
 * that type, so a key stored as something else fails `Protocol` and is never a mistyped value.
 */
export const userDefault = (
  key: string,
  type: SystemPreferences.UserDefaultType,
): Effect.Effect<SystemPreferences.UserDefault, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid user default", () => ({
      key: decodeText(key),
      type: decodeUserDefaultType(type),
    })),
    (request) =>
      operation("Could not read the user default", () => {
        only(["darwin"], "User defaults");
        const value: unknown = systemPreferences.getUserDefault(request.key, request.type);
        try {
          return decodeUserDefault({ type: request.type, value });
        } catch (cause) {
          throw new SewedError({
            code: "Protocol",
            message: `The user default is not stored as ${request.type}`,
            cause,
          });
        }
      }),
  );

/** Sets a key of the macOS user defaults to a value of a stated type. */
export const setUserDefault = (
  key: string,
  entry: SystemPreferences.UserDefault,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid user default", () => ({
      key: decodeText(key),
      entry: decodeUserDefault(entry),
    })),
    ({ key: name, entry: value }) =>
      operation("Could not set the user default", () => {
        only(["darwin"], "User defaults");
        // One call per stored type: Electron's signature ties the value's type to the type name.
        switch (value.type) {
          case "string":
          case "url":
            return systemPreferences.setUserDefault(name, value.type, value.value);
          case "boolean":
            return systemPreferences.setUserDefault(name, "boolean", value.value);
          case "integer":
            return systemPreferences.setUserDefault(name, "integer", value.value);
          case "float":
          case "double":
            return systemPreferences.setUserDefault(name, value.type, value.value);
          case "array":
            return systemPreferences.setUserDefault(name, "array", [...value.value]);
          case "dictionary":
            return systemPreferences.setUserDefault(name, "dictionary", { ...value.value });
        }
      }),
  );

/** Removes a key from the macOS user defaults, restoring its registered or global value. */
export const removeUserDefault = (key: string): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid defaults key", () => decodeText(key)),
    (value) =>
      operation("Could not remove the default", () => {
        only(["darwin"], "User defaults");
        systemPreferences.removeUserDefault(value);
      }),
  );

type CenterCallback = (event: string, userInfo: Record<string, unknown>, object: string) => void;
const centers = {
  distributed: {
    subscribe: (event: string | null, callback: CenterCallback) =>
      systemPreferences.subscribeNotification(event, callback),
    unsubscribe: (id: number) => systemPreferences.unsubscribeNotification(id),
    post: (event: string, userInfo: Record<string, Schema.Json>, immediately: boolean) =>
      systemPreferences.postNotification(event, userInfo, immediately),
  },
  local: {
    subscribe: (event: string | null, callback: CenterCallback) =>
      systemPreferences.subscribeLocalNotification(event, callback),
    unsubscribe: (id: number) => systemPreferences.unsubscribeLocalNotification(id),
    post: (event: string, userInfo: Record<string, Schema.Json>) =>
      systemPreferences.postLocalNotification(event, userInfo),
  },
  workspace: {
    subscribe: (event: string | null, callback: CenterCallback) =>
      systemPreferences.subscribeWorkspaceNotification(event, callback),
    unsubscribe: (id: number) => systemPreferences.unsubscribeWorkspaceNotification(id),
    post: (event: string, userInfo: Record<string, Schema.Json>) =>
      systemPreferences.postWorkspaceNotification(event, userInfo),
  },
};

/**
 * Messages posted to a macOS notification center under one name, or under every name with
 * `null`. Each observer holds its own subscription.
 */
export const notifications = (
  center: SystemPreferences.NotificationCenter,
  event: string | null,
): Stream.Stream<SystemPreferences.CenterNotification, SewedError, MainContext> =>
  Observation.listen<SystemPreferences.CenterNotification>("Notification center", (offer) =>
    Effect.andThen(
      decoded("Invalid notification subscription", () => ({
        center: decodeCenter(center),
        event: decodeEvent(event),
      })),
      (value) =>
        operation("Could not subscribe to the notification center", () => {
          only(["darwin"], "Notification centers");
          const id = centers[value.center].subscribe(value.event, (name, userInfo, object) =>
            offer({ event: name, userInfo: isJson(userInfo) ? userInfo : null, object }),
          );
          return () => {
            centers[value.center].unsubscribe(id);
          };
        }),
    ),
  );

/**
 * Posts a message to a macOS notification center. `deliverImmediately` applies to the distributed
 * center, which otherwise waits for the receiving application to be active.
 */
export const postNotification = (
  center: SystemPreferences.NotificationCenter,
  event: string,
  userInfo: Record<string, Schema.Json> = {},
  deliverImmediately = false,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid notification", () => ({
      center: decodeCenter(center),
      event: decodeText(event),
      userInfo: decodeUserInfo(userInfo),
      immediately: decodeFlag(deliverImmediately),
    })),
    (value) =>
      operation("Could not post the notification", () => {
        only(["darwin"], "Notification centers");
        centers[value.center].post(value.event, { ...value.userInfo }, value.immediately);
      }),
  );
