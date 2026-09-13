import { BrowserWindow as NativeWindow, session as nativeSession } from "electron";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import * as Session from "./internal/Session.ts";
import * as Window from "./internal/Window.ts";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { dialogs } from "./internal/Dialog.ts";
import { menus } from "./internal/Menu.ts";
import * as WindowControls from "./WindowControls.ts";

export const Controls = WindowControls.protocol;

export interface Options extends Window.Options {
  readonly session?: Session.Handle;
  /** Another Sewed window; with `modal: true` this window blocks it. */
  readonly parent?: Window.Parent;
}

export type AttachOptions = Window.AttachOptions;

export const make = (options: Options = {}) =>
  Effect.gen(function* () {
    yield* MainContext;
    const native = yield* Effect.try({
      try: () => {
        const { session, parent, ...settings } = options;
        return new NativeWindow({
          ...Window.nativeOptions(settings, parent),
          webPreferences: {
            preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            session: Session.resolve(
              session === undefined ? Session.fromNative(nativeSession.defaultSession) : session,
            ),
          },
        });
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: "Could not create window", cause }),
    });
    const common = yield* Window.make(native, native.webContents).pipe(
      Effect.onError(() =>
        Effect.sync(() => {
          if (!native.isDestroyed()) native.destroy();
        }),
      ),
    );
    const contents = common.webContents;
    if (contents === undefined)
      return yield* Effect.fail(
        new SewedError({ code: "Native", message: "BrowserWindow WebContents was not created" }),
      );
    const handle = {
      ...Window.toPublic(common),
      webContents: contents,
      dialog: dialogs(native, common.closed),
      menu: menus(native),
    };
    Window.register(handle, native);
    return handle;
  });

export type Handle = Effect.Success<ReturnType<typeof make>>;
