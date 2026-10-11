import type { EventEmitter } from "node:events";
import type { BaseWindow as NativeBaseWindow, WebContents as NativeWebContents } from "electron";
import { Deferred, Effect, Exit, PubSub, Schema, Scope, Stream } from "effect";
import type { Source as ImageSource } from "../Image.ts";
import { generateInstanceId } from "../InstanceId.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import { nativeImageOf } from "./ImageSource.ts";
import * as Observation from "./Observation.ts";
import * as View from "./View.ts";
import * as TouchBar from "./TouchBar.ts";
import * as WindowControls from "../WindowControls.ts";
import { webContents } from "./WebContents.ts";
import { Options as OptionsSchema } from "./WindowOptions.ts";
import * as WindowClose from "./WindowClose.ts";
import * as WindowPlatform from "./WindowPlatform.ts";
import * as WindowTitle from "./WindowTitle.ts";

export type AttachOptions = View.AttachOptions;
const decodeBounds = Schema.decodeUnknownSync(WindowControls.BoundsUpdate);
const decodeFullScreen = Schema.decodeUnknownSync(Schema.Boolean);
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeString = Schema.decodeUnknownSync(Schema.String);
const decodeOpacity = Schema.decodeUnknownSync(WindowControls.Opacity);
const decodeProgress = Schema.decodeUnknownSync(WindowControls.Progress);
const decodeProgressMode = Schema.decodeUnknownSync(WindowControls.ProgressMode);
const decodeLevel = Schema.decodeUnknownSync(WindowControls.AlwaysOnTopLevel);
const decodeSize = Schema.decodeUnknownSync(WindowControls.Size);
const decodeRectangle = Schema.decodeUnknownSync(WindowControls.Bounds);
const decodeShape = Schema.decodeUnknownSync(Schema.Array(WindowControls.Bounds));
const decodeOverlay = Schema.decodeUnknownSync(WindowControls.TitleBarOverlay);
const decodeSourceId = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeAspectRatio = Schema.decodeUnknownSync(WindowControls.AspectRatio);
const decodeOptions = Schema.decodeUnknownSync(OptionsSchema);

/** Any Sewed window handle; the registry resolves it to its native window. */
export interface Parent {
  readonly id: string;
}
export type Options = OptionsSchema;

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
  if (
    settings.windowStatePersistence !== undefined &&
    settings.windowStatePersistence !== false &&
    settings.name === undefined
  )
    throw protocolError("A window that persists its state needs a name");
  return parent === undefined ? settings : { ...settings, parent: parentOf(parent) };
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
      // Native callbacks run their Effects with the services this program was given.
      const surrounding = yield* Effect.context<never>();
      const id = yield* generateInstanceId();
      if (primary !== undefined) {
        const unregister = ContentsRegistry.register(primary.id, id);
        yield* Scope.addFinalizer(lifetime, Effect.sync(unregister));
      }
      const { contents, registry } =
        primary === undefined
          ? { contents: undefined, registry: undefined }
          : yield* webContents(primary, { windowDecidesTitle: true }).pipe(Scope.provide(lifetime));
      let windowClosed = false;
      let approvedClose = false;
      let closing = false;
      const children = View.makeParent({
        view: () => native.contentView,
        state: () => (native.isDestroyed() ? "destroyed" : windowClosed ? "closed" : "open"),
      });

      const approveClose = () => {
        if (closing || windowClosed || native.isDestroyed()) return;
        closing = true;
        Effect.runForkWith(surrounding)(
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
      const {
        gate,
        decide,
        registry: windowRegistry,
      } = WindowClose.make(id, approveClose, () => windowClosed || native.isDestroyed());
      const onClosed = () => {
        if (windowClosed) return;
        windowClosed = true;
        Effect.runForkWith(surrounding)(Scope.close(lifetime, Exit.void));
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
        simpleFullScreen: native.isSimpleFullScreen(),
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
          Effect.runSyncWith(surrounding)(PubSub.publish(state, readState()));
      };
      const updateAfterEvent = () => {
        setImmediate(update);
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
      // Electron documents `preventDefault` as holding the native title bar on the WINDOW's own
      // `page-title-updated`. For one title change Electron emits this event first, with its own
      // event object, and then the contents' event of the same name; preventing the contents'
      // event, even from a listener prepended ahead of every other, leaves the title to change
      // (probed on 44.3.0, see `docs/window-controls.md`). This listener is therefore the one that
      // asks `Decidables.WebContents.TitleUpdate` for a window's own contents, and the contents'
      // listener does not ask again (`windowDecidesTitle` above): `"keep"` (the decidable's own
      // fallback) holds the title Electron already has; `"accept"` lets the native change through.
      // The title *stream* keeps following the page regardless of this decision. The title event
      // precedes the native title change; the state snapshot's own read of it is deferred to the
      // next turn either way.
      const titleUpdated = (event: Electron.Event, title: string) => {
        if (registry !== undefined && WindowTitle.holdsTitle(registry, title))
          event.preventDefault();
        updateAfterEvent();
      };
      const emitter: EventEmitter = native;
      for (const event of events) emitter.on(event, updateAfterEvent);
      emitter.on("page-title-updated", titleUpdated);
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(() => {
          for (const event of events) emitter.off(event, updateAfterEvent);
          emitter.off("page-title-updated", titleUpdated);
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
      const platform = WindowPlatform.make(native, {
        id,
        closed,
        registry: windowRegistry,
        operation,
        read,
        setting,
        nativeOf: parentOf,
      });
      yield* Scope.addFinalizer(lifetime, Effect.sync(platform.release));
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
      const setEnabled = flag((value) => native.setEnabled(value));
      const setIgnoreMouseEvents = flag((value) => native.setIgnoreMouseEvents(value));
      const setAutoHideMenuBar = flag((value) => native.setAutoHideMenuBar(value));
      const setVisibleOnAllWorkspaces = flag((value) => native.setVisibleOnAllWorkspaces(value));
      const setMinimumSize = (size: WindowControls.Size) =>
        setting(
          () => decodeSize(size),
          ({ width, height }) => native.setMinimumSize(width, height),
        );
      const setMaximumSize = (size: WindowControls.Size) =>
        setting(
          () => decodeSize(size),
          ({ width, height }) => native.setMaximumSize(width, height),
        );
      const setAspectRatio = (ratio: number, extra?: WindowControls.Size) =>
        setting(
          () =>
            [
              decodeAspectRatio(ratio),
              extra === undefined ? undefined : decodeSize(extra),
            ] as const,
          ([value, size]) => native.setAspectRatio(value, size),
        );
      const setBackgroundColor = (color: string) =>
        setting(
          () => View.decodeColor(color),
          (value) => native.setBackgroundColor(value),
        );
      const setHasShadow = flag((value) => native.setHasShadow(value));
      const setContentBounds = (bounds: WindowControls.Bounds) =>
        setting(
          () => decodeRectangle(bounds),
          (value) => native.setContentBounds(value),
        );
      const setContentSize = (size: WindowControls.Size) =>
        setting(
          () => decodeSize(size),
          ({ width, height }) => native.setContentSize(width, height),
        );
      const moveAbove = (mediaSourceId: string) =>
        setting(
          () => decodeSourceId(mediaSourceId),
          (value) => native.moveAbove(value),
        );
      const setAccessibleTitle = (title: string) =>
        setting(
          () => decodeString(title),
          (value) => {
            native.accessibleTitle = value;
          },
        );
      const setTitleBarOverlay = (overlay: WindowControls.TitleBarOverlay) =>
        setting(
          () => decodeOverlay(overlay),
          (value) => native.setTitleBarOverlay({ ...value }),
        );
      const setShape = (rectangles: ReadonlyArray<WindowControls.Bounds>) =>
        setting(
          () => decodeShape(rectangles),
          (value) => native.setShape(value.map((rectangle) => ({ ...rectangle }))),
        );
      const removeMenu = operation(() => {
        native.removeMenu();
      });
      const windowEvents = Observation.fromEmitter<WindowControls.Event>("Window", () => native, [
        ["ready-to-show", (): WindowControls.Event => ({ kind: "ready-to-show" })],
        [
          "persisted-state-restored",
          (): WindowControls.Event => ({ kind: "persisted-state-restored" }),
        ],
        [
          "app-command",
          (_event: unknown, command: string): WindowControls.Event => ({
            kind: "app-command",
            command,
          }),
        ],
        [
          "system-context-menu",
          (
            _event: unknown,
            point: { readonly x: number; readonly y: number },
          ): WindowControls.Event => ({
            kind: "system-context-menu",
            x: point.x,
            y: point.y,
          }),
        ],
        ["moved", (): WindowControls.Event => ({ kind: "moved" })],
        ["resized", (): WindowControls.Event => ({ kind: "resized" })],
        [
          "will-move",
          (_event: unknown, bounds: Electron.Rectangle): WindowControls.Event => ({
            kind: "will-move",
            bounds: { ...bounds },
          }),
        ],
        [
          "will-resize",
          (
            _event: unknown,
            bounds: Electron.Rectangle,
            details: { readonly edge: string },
          ): WindowControls.Event => ({
            kind: "will-resize",
            bounds: { ...bounds },
            edge: details.edge,
          }),
        ],
        [
          "swipe",
          (_event: unknown, direction: string): WindowControls.Event => ({
            kind: "swipe",
            direction,
          }),
        ],
        [
          "rotate-gesture",
          (_event: unknown, rotation: number): WindowControls.Event => ({
            kind: "rotate-gesture",
            rotation,
          }),
        ],
        ["sheet-begin", (): WindowControls.Event => ({ kind: "sheet-begin" })],
        ["sheet-end", (): WindowControls.Event => ({ kind: "sheet-end" })],
        ["new-window-for-tab", (): WindowControls.Event => ({ kind: "new-window-for-tab" })],
        [
          "session-end",
          (event: { readonly reasons: ReadonlyArray<string> }): WindowControls.Event => ({
            kind: "session-end",
            reasons: [...event.reasons],
          }),
        ],
      ]).pipe(Stream.interruptWhen(Deferred.await(closed)));
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
      const setOverlayIcon = (icon: ImageSource | null, description: string) =>
        setting(
          () =>
            [
              icon === null ? null : nativeImageOf(icon, "Overlay icon"),
              decodeString(description),
            ] as const,
          ([value, text]) => native.setOverlayIcon(value, text),
        );
      const setIcon = (icon: ImageSource) =>
        setting(
          () => nativeImageOf(icon, "Window icon"),
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
      const setSimpleFullScreen = (simpleFullScreen: boolean) =>
        operation(() => {
          native.setSimpleFullScreen(decodeBoolean(simpleFullScreen));
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
      const center = operation(() => {
        native.center();
      });
      const moveTop = operation(() => {
        native.moveTop();
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
        setSimpleFullScreen,
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
        /** Whether the window takes input; a disabled window ignores mouse and keyboard. */
        setEnabled,
        /** Lets mouse events pass through the window to whatever is beneath it. */
        setIgnoreMouseEvents,
        setAutoHideMenuBar,
        setVisibleOnAllWorkspaces,
        setMinimumSize,
        /** Zero in a dimension leaves that dimension unlimited. */
        setMaximumSize,
        /** Keeps `ratio` (width over height) while resizing, not counting `extra`; zero removes it. */
        setAspectRatio,
        setBackgroundColor,
        setHasShadow,
        /** Places the content area, not the frame, at `bounds`. */
        setContentBounds,
        setContentSize,
        /** Raises the window just above another, named by its media source id (`mediaSourceId`). */
        moveAbove,
        /** The title assistive technology reads instead of the window's own. */
        setAccessibleTitle,
        /** Restyles the native controls of a window created with a title bar overlay. */
        setTitleBarOverlay,
        /** Makes only the given rectangles of the window drawn and clickable, on Linux and Windows. */
        setShape,
        /** Removes the window's menu bar, on Linux and Windows. */
        removeMenu,
        /** What happens to the window outside its state: see `WindowControls.Event`. */
        events: windowEvents,
        ...platform.members,
        /** Moves the window to the center of its display. */
        center,
        /** Raises the window above the others without focusing it. */
        moveTop,
        /**
         * Installs a decider for `Decidables.Window.Close` against this window's own registry, for
         * the caller's scope. Any number of deciders may be installed, and the decidable's own
         * composition decides among them. The decider sees the window's own id.
         */
        decide,
        state: changes,
        awaitClosed: Effect.andThen(MainContext, Deferred.await(closed)),
        attach: children.attach,
        mediaSourceId: read("Could not read the window media source id", () =>
          native.getMediaSourceId(),
        ),
        contentBounds: read("Could not read the window content bounds", () =>
          native.getContentBounds(),
        ),
        sizeLimits: read("Could not read the window size limits", (): WindowControls.SizeLimits => {
          const [minWidth = 0, minHeight = 0] = native.getMinimumSize();
          const [maxWidth = 0, maxHeight = 0] = native.getMaximumSize();
          return {
            minimum: { width: minWidth, height: minHeight },
            maximum: { width: maxWidth, height: maxHeight },
          };
        }),
        enabled: read("Could not read whether the window is enabled", () => native.isEnabled()),
        backgroundColor: read("Could not read the window background color", () =>
          native.getBackgroundColor(),
        ),
        visibleOnAllWorkspaces: read("Could not read the window workspace visibility", () =>
          native.isVisibleOnAllWorkspaces(),
        ),
        shadow: read("Could not read whether the window has a shadow", () => native.hasShadow()),
        accessibleTitle: read(
          "Could not read the window accessible title",
          () => native.accessibleTitle,
        ),
        /** Whether the window is neither maximized, minimized nor fullscreen. */
        normal: read("Could not read whether the window is normal", () => native.isNormal()),
        menuBarAutoHide: read("Could not read whether the menu bar hides itself", () =>
          native.isMenuBarAutoHide(),
        ),
        /** The platform's own handle: an X11 `Window`, an `HWND`, or an `NSView*`, as bytes. */
        nativeHandle: read(
          "Could not read the native window handle",
          () => new Uint8Array(native.getNativeWindowHandle()),
        ),
        touchBar: TouchBar.make(native, () => windowClosed || native.isDestroyed(), closed),
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
