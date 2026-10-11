import { BrowserWindow as NativeWindow, session as nativeSession } from "electron";
import { Deferred, Effect, Schema } from "effect";
import { fileURLToPath } from "node:url";
import * as Automation from "./Automation.ts";
import * as ContentsAutomation from "./internal/ContentsAutomation.ts";
import * as Session from "./internal/Session.ts";
import * as Window from "./internal/Window.ts";
import { decoded } from "./internal/WebContentsCore.ts";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { dialogs } from "./internal/Dialog.ts";
import { menus } from "./internal/Menu.ts";
import * as WindowControls from "./WindowControls.ts";

export const Controls = WindowControls.protocol;

const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeAutomation = Schema.decodeUnknownSync(Automation.Declaration);

export interface Options<A extends Automation.Declaration = {}> extends Window.Options {
  readonly session?: Session.Handle;
  /** Whether Chromium throttles timers and animations while the window is hidden or occluded. */
  readonly backgroundThrottling?: boolean;
  /**
   * Renders the page offscreen: nothing is drawn in a window, and `webContents.frames` delivers
   * each frame instead.
   */
  readonly offscreen?: boolean;
  /**
   * Lets the page use `<webview>`. Each attachment is still denied unless a
   * `Decidables.WebContents.WebviewAttach` decider allows it.
   */
  readonly webviewTag?: boolean;
  /** Another Sewed window; with `modal: true` this window blocks it. */
  readonly parent?: Window.Parent;
  /**
   * Automation for development tooling, declared by the composition that creates the window.
   * Undeclared members do not exist on the handle, so a composition that omits it has none.
   */
  readonly automation?: A;
}

export type AttachOptions = Window.AttachOptions;

export const make = <const A extends Automation.Declaration = {}>(options: Options<A> = {}) =>
  Effect.gen(function* () {
    yield* MainContext;
    const {
      session,
      parent,
      backgroundThrottling,
      offscreen,
      webviewTag,
      automation,
      ...settings
    } = options;
    const throttling =
      backgroundThrottling === undefined
        ? undefined
        : yield* decoded("Invalid background throttling", () =>
            decodeBoolean(backgroundThrottling),
          );
    const allowsWebviews =
      webviewTag === undefined
        ? false
        : yield* decoded("Invalid webview flag", () => decodeBoolean(webviewTag));
    const rendersOffscreen =
      offscreen === undefined
        ? false
        : yield* decoded("Invalid offscreen flag", () => decodeBoolean(offscreen));
    if (automation !== undefined)
      yield* decoded("Invalid window automation", () => decodeAutomation(automation));
    const native = yield* Effect.try({
      try: () =>
        new NativeWindow({
          ...Window.nativeOptions(settings, parent),
          webPreferences: {
            preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            ...(throttling === undefined ? {} : { backgroundThrottling: throttling }),
            ...(rendersOffscreen ? { offscreen: true } : {}),
            ...(allowsWebviews ? { webviewTag: true } : {}),
            session: Session.resolve(
              session === undefined ? Session.fromNative(nativeSession.defaultSession) : session,
            ),
          },
        }),
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
      return yield* new SewedError({
        code: "Native",
        message: "BrowserWindow WebContents was not created",
      });
    const fenced = ContentsAutomation.make(automation, native.webContents, {
      isClosed: () => native.isDestroyed() || Deferred.isDoneUnsafe(common.closed),
      closedError: () => new SewedError({ code: "Closed", message: "Window is closed" }),
    });
    yield* Effect.addFinalizer(() => Effect.sync(fenced.release));
    const handle = {
      ...Window.toPublic(common),
      webContents: contents,
      dialog: dialogs(native, common.closed),
      menu: menus(native),
      automation: fenced.automation,
    };
    Window.register(handle, native);
    return handle;
  });

export type Handle<A extends Automation.Declaration = {}> = Effect.Success<
  ReturnType<typeof make<A>>
>;
