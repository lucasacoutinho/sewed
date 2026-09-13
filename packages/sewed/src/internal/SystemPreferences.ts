import type { EventEmitter } from "node:events";
import { systemPreferences } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as SystemPreferences from "../SystemPreferences.ts";

export {
  Animation,
  Appearance,
  Change,
  ColorName,
  MediaAccess,
  MediaKind,
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
  Stream.callback<SystemPreferences.Change, SewedError, MainContext>(
    (queue) =>
      Effect.gen(function* () {
        yield* MainContext;
        const offer = (change: SystemPreferences.Change) => {
          if (!Queue.offerUnsafe(queue, change))
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new SewedError({
                  code: "Limit",
                  message: "System preference observer queue is full",
                }),
              ),
            );
        };
        const accent = (_event: unknown, color: unknown) =>
          offer({ kind: "accent-color", color: String(color) });
        const colors = () => offer({ kind: "color" });
        const emitter: EventEmitter = systemPreferences;
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            emitter.on("accent-color-changed", accent);
            emitter.on("color-changed", colors);
          }),
          () =>
            Effect.sync(() => {
              emitter.off("accent-color-changed", accent);
              emitter.off("color-changed", colors);
            }),
        );
      }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
    { bufferSize: 128 },
  );
