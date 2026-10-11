import { BaseWindow as NativeBaseWindow } from "electron";
import { Effect, Schema } from "effect";
import type * as Window from "./internal/Window.ts";
import * as Native from "./internal/Window.ts";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";

export interface Options extends Window.Options {
  /** Another Sewed window; with `modal: true` this window blocks it. */
  readonly parent?: Window.Parent;
}

export type AttachOptions = Window.AttachOptions;

export const make = (options: Options = {}) =>
  Effect.gen(function* () {
    yield* MainContext;
    const native = yield* Effect.try({
      try: () => {
        const { parent, ...settings } = options;
        return new NativeBaseWindow(Native.nativeOptions(settings, parent));
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: "Could not create BaseWindow", cause }),
    });
    const handle = yield* Native.make(native).pipe(
      Effect.onError(() =>
        Effect.sync(() => {
          if (!native.isDestroyed()) native.destroy();
        }),
      ),
    );
    const publicHandle = Native.toPublic(handle);
    Native.register(publicHandle, native);
    return publicHandle;
  });

export type Handle = Effect.Success<ReturnType<typeof make>>;

const decodeName = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));

/**
 * Forgets the bounds and display mode persisted for the window of this `name`, so its next
 * creation starts from its options. Works for a browser window's name too.
 */
export const clearPersistedState = (name: string): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeName(name),
      catch: (cause) => new SewedError({ code: "Protocol", message: "Invalid window name", cause }),
    }),
    (value) =>
      Effect.andThen(
        MainContext,
        Effect.try({
          try: () => NativeBaseWindow.clearPersistedState(value),
          catch: (cause) =>
            new SewedError({
              code: "Native",
              message: "Could not clear persisted window state",
              cause,
            }),
        }),
      ),
  );
