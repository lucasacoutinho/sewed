import type { EventEmitter } from "node:events";
import type { BaseWindow as NativeBaseWindow, WebContents as NativeWebContents } from "electron";
import { nativeImage } from "electron";
import { Deferred, Effect, Exit, PubSub, Schema, Scope, Stream } from "effect";
import { generateInstanceId } from "../InstanceId.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as CloseGate from "./CloseGate.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as View from "./View.ts";
import * as TouchBar from "./TouchBar.ts";
import * as WindowControls from "../WindowControls.ts";
import { webContents } from "./WebContents.ts";
import { Options as OptionsSchema } from "./WindowOptions.ts";

export type AttachOptions = View.AttachOptions;
const decodeBounds = Schema.decodeUnknownSync(WindowControls.BoundsUpdate);
const decodeFullScreen = Schema.decodeUnknownSync(Schema.Boolean);
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeString = Schema.decodeUnknownSync(Schema.String);
const decodePath = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeOpacity = Schema.decodeUnknownSync(WindowControls.Opacity);
const decodeProgress = Schema.decodeUnknownSync(WindowControls.Progress);
const decodeProgressMode = Schema.decodeUnknownSync(WindowControls.ProgressMode);
const decodeLevel = Schema.decodeUnknownSync(WindowControls.AlwaysOnTopLevel);
const decodeOptions = Schema.decodeUnknownSync(OptionsSchema);

/** Any Sewed window handle; the registry resolves it to its native window. */
export interface Parent {
  readonly id: string;
}
export type Options = typeof OptionsSchema.Type;

const natives = new WeakMap<object, NativeBaseWindow>();
const ids = new WeakMap<NativeBaseWindow, string>();
export const register = (handle: { readonly id: string }, native: NativeBaseWindow): void => {
  natives.set(handle, native);
  ids.set(native, handle.id);
};
/** The Sewed id of a native window, or undefined for windows the library did not create. */
export const idOf = (native: NativeBaseWindow): string | undefined => ids.get(native);
const parentOf = (handle: Parent): NativeBaseWindow => {
  const native = natives.get(handle);
  if (native === undefined) throw protocolError("Parent window was not created by Sewed");
  if (native.isDestroyed()) throw closedError("Parent window is closed");
  return native;
};
/** Validates plain options and resolves the parent handle into Electron's constructor options. */
export const nativeOptions = (options: Options, parent: Parent | undefined) => {
  let settings: Options;
  try {
    settings = decodeOptions(options);
  } catch (cause) {
    throw protocolError("Invalid window options", cause);
  }
  if (settings.modal === true && parent === undefined)
    throw protocolError("A modal window needs a parent");
  return parent === undefined ? settings : { ...settings, parent: parentOf(parent) };
};
const image = (path: string, what: string) => {
  const value = nativeImage.createFromPath(decodePath(path));
  if (value.isEmpty()) throw protocolError(`${what} is not a readable image: ${path}`);
  return value;
};

const closedError = (message: string) => new SewedError({ code: "Closed", message });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

export const make = (native: NativeBaseWindow, primary?: NativeWebContents) =>
  Effect.gen(function* () {
    yield* MainContext;
    const parent = yield* Effect.scope;
    const lifetime = yield* Scope.fork(parent);
    const closed = yield* Deferred.make<void>();
    yield* Scope.addFinalizer(
      lifetime,
      Effect.sync(() => {
        if (!native.isDestroyed()) native.destroy();
      }),
    );
    return yield* Effect.gen(function* () {
      const id = yield* generateInstanceId();
      if (primary !== undefined) {
        const unregister = ContentsRegistry.register(primary.id, id);
        yield* Scope.addFinalizer(lifetime, Effect.sync(unregister));
      }
      const contents =
        primary === undefined
          ? undefined
          : yield* webContents(primary).pipe(Scope.provide(lifetime));
      let windowClosed = false;
      let approvedClose = false;
      let closing = false;
      const children = View.makeParent(
        () => native.contentView,
        () => windowClosed || native.isDestroyed(),
      );

      const approveClose = () => {
        if (closing || windowClosed || native.isDestroyed()) return;
        closing = true;
        Effect.runFork(
          Effect.sync(() => {
            try {
              if (!native.isDestroyed()) {
                approvedClose = true;
                native.close();
              }
            } finally {
              approvedClose = false;
              closing = false;
            }
          }),
        );
      };
      const gate = CloseGate.make(approveClose);
      const onClosed = () => {
        if (windowClosed) return;
        windowClosed = true;
        Effect.runFork(Scope.close(lifetime, Exit.void));
      };
      const onClose = (event: Electron.Event) => {
        if (approvedClose || windowClosed) return;
        event.preventDefault();
        gate.request();
      };
      native.on("close", onClose);
      native.once("closed", onClosed);

      yield* Scope.addFinalizer(
        lifetime,
        Effect.ensuring(
          Effect.gen(function* () {
            windowClosed = true;
            yield* children.closeAll;
          }),
          Effect.gen(function* () {
            native.off("close", onClose);
            yield* gate.close();
            if (!native.isDestroyed()) {
              approvedClose = true;
              try {
                native.destroy();
              } finally {
                approvedClose = false;
              }
            }
            native.off("closed", onClosed);
            if (native.isDestroyed()) Deferred.doneUnsafe(closed, Effect.void);
          }),
        ),
      );

      const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
        Effect.andThen(
          MainContext,
          Effect.try({
            try: () => {
              if (windowClosed || native.isDestroyed()) throw closedError("Window is closed");
              return run();
            },
            catch: (cause) =>
              cause instanceof SewedError ? cause : nativeError("Window operation failed", cause),
          }),
        );
      /** A main-only read that fails with Closed once the window is gone. */
      const read = <A>(message: string, run: () => A) =>
        Effect.andThen(
          MainContext,
          Effect.suspend(() =>
            windowClosed || native.isDestroyed()
              ? Effect.fail(closedError("Window is closed"))
              : Effect.try({ try: run, catch: (cause) => nativeError(message, cause) }),
          ),
        );
      const readState = (): WindowControls.State => ({
        bounds: native.getBounds(),
        normalBounds: native.getNormalBounds(),
        contentBounds: native.getContentBounds(),
        visible: native.isVisible(),
        focused: native.isFocused(),
        minimized: native.isMinimized(),
        maximized: native.isMaximized(),
        fullScreen: native.isFullScreen(),
        title: native.getTitle(),
        alwaysOnTop: native.isAlwaysOnTop(),
        opacity: native.getOpacity(),
        resizable: native.isResizable(),
        movable: native.isMovable(),
        minimizable: native.isMinimizable(),
        maximizable: native.isMaximizable(),
        closable: native.isClosable(),
        fullScreenable: native.isFullScreenable(),
        menuBarVisible: native.isMenuBarVisible(),
        kiosk: native.isKiosk(),
      });
      const state = yield* PubSub.sliding<WindowControls.State>({ capacity: 2, replay: 1 });
      const update = () => {
        if (!windowClosed && !native.isDestroyed())
          Effect.runSync(PubSub.publish(state, readState()));
      };
      update();
      const events = [
        "show",
        "hide",
        "focus",
        "blur",
        "move",
        "resize",
        "minimize",
        "restore",
        "maximize",
        "unmaximize",
        "enter-full-screen",
        "leave-full-screen",
        "always-on-top-changed",
      ] as const;
      // The title event precedes the native title change; read it on the next turn.
      const updateLater = () => {
        setImmediate(update);
      };
      const emitter: EventEmitter = native;
      for (const event of events) emitter.on(event, update);
      emitter.on("page-title-updated", updateLater);
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(() => {
          for (const event of events) emitter.off(event, update);
          emitter.off("page-title-updated", updateLater);
        }),
      );
      // Settings decode before the native call so invalid values fail with Protocol.
      const setting = <A>(decode: () => A, apply: (value: A) => void) =>
        Effect.andThen(
          Effect.try({
            try: decode,
            catch: (cause) =>
              cause instanceof SewedError ? cause : protocolError("Invalid window setting", cause),
          }),
          (value) =>
            operation(() => {
              apply(value);
              update();
            }),
        );
      const setTitle = (title: string) =>
        setting(
          () => decodeString(title),
          (value) => native.setTitle(value),
        );
      const setAlwaysOnTop = (alwaysOnTop: boolean, level?: WindowControls.AlwaysOnTopLevel) =>
        setting(
          () =>
            [
              decodeBoolean(alwaysOnTop),
              level === undefined ? undefined : decodeLevel(level),
            ] as const,
          ([flag, tier]) => native.setAlwaysOnTop(flag, tier),
        );
      const setOpacity = (opacity: number) =>
        setting(
          () => decodeOpacity(opacity),
          (value) => native.setOpacity(value),
        );
      const flag = (apply: (value: boolean) => void) => (value: boolean) =>
        setting(() => decodeBoolean(value), apply);
      const setResizable = flag((value) => native.setResizable(value));
      const setMovable = flag((value) => native.setMovable(value));
      const setMinimizable = flag((value) => native.setMinimizable(value));
      const setMaximizable = flag((value) => native.setMaximizable(value));
      const setClosable = flag((value) => native.setClosable(value));
      const setFullScreenable = flag((value) => native.setFullScreenable(value));
      const setMenuBarVisibility = flag((value) => native.setMenuBarVisibility(value));
      const setKiosk = flag((value) => native.setKiosk(value));
      const setSkipTaskbar = flag((value) => native.setSkipTaskbar(value));
      const setContentProtection = flag((value) => native.setContentProtection(value));
      const flash = flag((value) => native.flashFrame(value));
      const setWindowButtonVisibility = (visible: boolean) =>
        setting(
          () => decodeBoolean(visible),
          (value) => {
            if (process.platform !== "darwin")
              throw nativeError("Window button visibility is available only on macOS", undefined);
            native.setWindowButtonVisibility(value);
          },
        );
      const setProgress = (progress: number, mode?: WindowControls.ProgressMode) =>
        setting(
          () =>
            [
              decodeProgress(progress),
              mode === undefined ? undefined : decodeProgressMode(mode),
            ] as const,
          ([value, tier]) =>
            native.setProgressBar(value, tier === undefined ? undefined : { mode: tier }),
        );
      const setOverlayIcon = (icon: string | null, description: string) =>
        setting(
          () =>
            [
              icon === null ? null : image(icon, "Overlay icon"),
              decodeString(description),
            ] as const,
          ([value, text]) => native.setOverlayIcon(value, text),
        );
      const setIcon = (icon: string) =>
        setting(
          () => image(icon, "Window icon"),
          (value) => native.setIcon(value),
        );
      const setParent = (parent: Parent | null) =>
        setting(
          () => {
            if (native.isModal()) throw protocolError("A modal window keeps its parent");
            if (parent === null) return null;
            const value = parentOf(parent);
            if (value === native) throw protocolError("A window cannot be its own parent");
            return value;
          },
          (value) => native.setParentWindow(value),
        );

      const show = operation(() => {
        native.show();
      });
      const showInactive = operation(() => {
        native.showInactive();
      });
      const hide = operation(() => {
        native.hide();
      });
      const focus = operation(() => {
        native.focus();
      });
      const setBounds = (bounds: WindowControls.BoundsUpdate) =>
        operation(() => {
          native.setBounds(decodeBounds(bounds));
        });
      const setFullScreen = (fullScreen: boolean) =>
        operation(() => {
          native.setFullScreen(decodeFullScreen(fullScreen));
        });
      const minimize = operation(() => {
        native.minimize();
      });
      const maximize = operation(() => {
        native.maximize();
      });
      const restore = operation(() => {
        native.restore();
        native.unmaximize();
      });
      const close = operation(() => {
        native.close();
      });
      const changes = Stream.unwrap(Effect.as(MainContext, Stream.fromPubSub(state))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      );
      // The one-shot read behind the capability's `state`; the stream above it replays and follows.
      const current = operation(readState);

      return {
        native,
        closed,
        webContents: contents,
        id,
        current,
        show,
        showInactive,
        hide,
        focus,
        setBounds,
        setFullScreen,
        minimize,
        maximize,
        restore,
        close,
        setTitle,
        setAlwaysOnTop,
        setOpacity,
        setResizable,
        setMovable,
        setMinimizable,
        setMaximizable,
        setClosable,
        setFullScreenable,
        setMenuBarVisibility,
        setKiosk,
        setSkipTaskbar,
        setContentProtection,
        flash,
        setWindowButtonVisibility,
        setProgress,
        setOverlayIcon,
        setIcon,
        setParent,
        guardClose: <R>(decision: Effect.Effect<boolean, never, R>) =>
          Effect.andThen(MainContext, gate.guard(decision)),
        state: changes,
        awaitClosed: Effect.andThen(MainContext, Deferred.await(closed)),
        attach: children.attach,
        mediaSourceId: read("Could not read the window media source id", () =>
          native.getMediaSourceId(),
        ),
        contentBounds: read("Could not read the window content bounds", () =>
          native.getContentBounds(),
        ),
        touchBar: TouchBar.make(native, () => windowClosed || native.isDestroyed()),
      };
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
  });

export type Handle = Effect.Success<ReturnType<typeof make>>;

export const toPublic = <
  T extends {
    readonly native: NativeBaseWindow;
    readonly closed: Deferred.Deferred<void>;
    readonly webContents: unknown;
  },
>(
  handle: T,
): Omit<T, "native" | "closed" | "webContents"> => {
  const { native: _native, closed: _closed, webContents: _webContents, ...publicHandle } = handle;
  return publicHandle;
};
