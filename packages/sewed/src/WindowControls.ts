import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Binary from "./Binary.ts";
import * as Capability from "./Capability.ts";
import * as Image from "./Image.ts";
import { Bounds } from "./internal/Geometry.ts";
import { SewedError } from "./SewedError.ts";
import * as WebContents from "./WebContents.ts";

export { Bounds } from "./internal/Geometry.ts";

export const BoundsUpdate = Bounds.mapFields(Struct.map(Schema.optionalKey));
export type BoundsUpdate = typeof BoundsUpdate.Type;

const Dimension = Schema.Finite.check(Schema.isInt32(), Schema.isGreaterThanOrEqualTo(0));
/** A width and height in pixels. As a maximum, zero in a dimension leaves it unlimited. */
export const Size = Schema.Struct({ width: Dimension, height: Dimension });
export type Size = typeof Size.Type;
/** The smallest and largest size the user may resize the window to. */
export const SizeLimits = Schema.Struct({ minimum: Size, maximum: Size });
export type SizeLimits = typeof SizeLimits.Type;
/** Width divided by height that resizing keeps; zero removes the constraint. */
export const AspectRatio = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const Opacity = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
/** Taskbar progress from 0 to 1; a negative value removes the indicator. */
export const Progress = Schema.Finite.check(Schema.isBetween({ minimum: -1, maximum: 1 }));
export const ProgressMode = Schema.Literals(["none", "normal", "indeterminate", "error", "paused"]);
export type ProgressMode = typeof ProgressMode.Type;
export const AlwaysOnTopLevel = Schema.Literals([
  "normal",
  "floating",
  "torn-off-menu",
  "modal-panel",
  "main-menu",
  "status",
  "pop-up-menu",
  "screen-saver",
]);
export type AlwaysOnTopLevel = typeof AlwaysOnTopLevel.Type;

export const State = Schema.Struct({
  bounds: Bounds,
  normalBounds: Bounds,
  /** The content area, excluding the frame; attached views are positioned within it. */
  contentBounds: Bounds,
  visible: Schema.Boolean,
  focused: Schema.Boolean,
  minimized: Schema.Boolean,
  maximized: Schema.Boolean,
  fullScreen: Schema.Boolean,
  /**
   * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
   * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
   * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
   * distinct behavior (no Space) is.
   */
  simpleFullScreen: Schema.Boolean,
  title: Schema.String,
  alwaysOnTop: Schema.Boolean,
  opacity: Schema.Finite,
  resizable: Schema.Boolean,
  movable: Schema.Boolean,
  minimizable: Schema.Boolean,
  maximizable: Schema.Boolean,
  closable: Schema.Boolean,
  fullScreenable: Schema.Boolean,
  menuBarVisible: Schema.Boolean,
  kiosk: Schema.Boolean,
});
export type State = typeof State.Type;

/** Colors and height of the native window controls drawn over a frameless window's content. */
export const TitleBarOverlay = Schema.Struct({
  color: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  symbolColor: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  height: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type TitleBarOverlay = typeof TitleBarOverlay.Type;

/**
 * Something that happened to a window that is not part of its state: it is ready to be shown
 * without a flash, a media or browser key was pressed (`app-command`, on Linux and Windows), or the
 * system context menu was requested on its non-client area (on Linux and Windows).
 */
export const Event = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ready-to-show") }),
  /** The window took the bounds and display mode it persisted in an earlier run. */
  Schema.Struct({ kind: Schema.Literal("persisted-state-restored") }),
  Schema.Struct({ kind: Schema.Literal("app-command"), command: Schema.String }),
  /** The user moved or resized the window and let go, on macOS and Windows. */
  Schema.Struct({ kind: Schema.Literals(["moved", "resized"]) }),
  /** The window is about to take these bounds while the user drags it, on macOS and Windows. */
  Schema.Struct({
    kind: Schema.Literals(["will-move", "will-resize"]),
    bounds: Bounds,
    edge: Schema.optionalKey(Schema.String),
  }),
  /** A three-finger swipe, on macOS. */
  Schema.Struct({ kind: Schema.Literal("swipe"), direction: Schema.String }),
  /** A trackpad rotation in degrees, on macOS. */
  Schema.Struct({ kind: Schema.Literal("rotate-gesture"), rotation: Schema.Finite }),
  /** A sheet opened or closed on the window, on macOS. */
  Schema.Struct({ kind: Schema.Literals(["sheet-begin", "sheet-end"]) }),
  /** The user asked for a new tab from the window's tab bar, on macOS. */
  Schema.Struct({ kind: Schema.Literal("new-window-for-tab") }),
  /** The user's session is ending and the window is about to be closed, on Windows. */
  Schema.Struct({ kind: Schema.Literal("session-end"), reasons: Schema.Array(Schema.String) }),
  Schema.Struct({
    kind: Schema.Literal("system-context-menu"),
    x: Schema.Finite,
    y: Schema.Finite,
  }),
]);
export type Event = typeof Event.Type;

/** A macOS material drawn behind a window's content; `null` removes it. */
export const Vibrancy = Schema.NullOr(
  Schema.Literals([
    "titlebar",
    "selection",
    "menu",
    "popover",
    "sidebar",
    "header",
    "sheet",
    "window",
    "hud",
    "fullscreen-ui",
    "tooltip",
    "content",
    "under-window",
    "under-page",
  ]),
);
export type Vibrancy = typeof Vibrancy.Type;

/** A Windows 11 system material drawn behind a window's content. */
export const BackgroundMaterial = Schema.Literals(["auto", "none", "mica", "acrylic", "tabbed"]);
export type BackgroundMaterial = typeof BackgroundMaterial.Type;

/**
 * The Windows frame accent: `true` uses the system accent color, `false` none, a color string
 * that color, and `null` the system default.
 */
export const AccentColor = Schema.NullOr(
  Schema.Union([Schema.Boolean, Schema.String.check(Schema.isMinLength(1))]),
);
export type AccentColor = typeof AccentColor.Type;

/** How Windows groups and relaunches a window in the taskbar. */
export const AppDetails = Schema.Struct({
  appId: Schema.optionalKey(Schema.String),
  appIconPath: Schema.optionalKey(Schema.String),
  appIconIndex: Schema.optionalKey(Schema.Int),
  relaunchCommand: Schema.optionalKey(Schema.String),
  relaunchDisplayName: Schema.optionalKey(Schema.String),
});
export type AppDetails = typeof AppDetails.Type;

/** One button of a Windows taskbar thumbnail toolbar; `id` names it in `thumbarClicks`. */
export const ThumbarButton = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  icon: Image.Source,
  tooltip: Schema.optionalKey(Schema.String),
  flags: Schema.optionalKey(
    Schema.Array(
      Schema.Literals([
        "enabled",
        "disabled",
        "dismissonclick",
        "nobackground",
        "hidden",
        "noninteractive",
      ]),
    ),
  ),
});
export type ThumbarButton = typeof ThumbarButton.Type;

/** A raw Windows message delivered to a window, with its parameters as bytes. */
export const WindowMessage = Schema.Struct({ wParam: Binary.Bytes, lParam: Binary.Bytes });
export type WindowMessage = typeof WindowMessage.Type;

export const protocol = RpcGroup.make(
  Rpc.make("show", { error: SewedError }),
  Rpc.make("showInactive", { error: SewedError }),
  Rpc.make("hide", { error: SewedError }),
  Rpc.make("focus", { error: SewedError }),
  Rpc.make("setBounds", { payload: BoundsUpdate, error: SewedError }),
  Rpc.make("setFullScreen", { payload: { fullScreen: Schema.Boolean }, error: SewedError }),
  Rpc.make("setSimpleFullScreen", {
    payload: { simpleFullScreen: Schema.Boolean },
    error: SewedError,
  }),
  Rpc.make("minimize", { error: SewedError }),
  Rpc.make("maximize", { error: SewedError }),
  Rpc.make("restore", { error: SewedError }),
  Rpc.make("close", { error: SewedError }),
  Rpc.make("state", { success: State, error: SewedError }),
  Rpc.make("changes", { success: State, stream: true, error: SewedError }),
  Rpc.make("setTitle", { payload: { title: Schema.String }, error: SewedError }),
  Rpc.make("setAlwaysOnTop", {
    payload: { alwaysOnTop: Schema.Boolean, level: Schema.optionalKey(AlwaysOnTopLevel) },
    error: SewedError,
  }),
  Rpc.make("setOpacity", { payload: { opacity: Opacity }, error: SewedError }),
  Rpc.make("setProgress", {
    payload: { progress: Progress, mode: Schema.optionalKey(ProgressMode) },
    error: SewedError,
  }),
  Rpc.make("flash", { payload: { flash: Schema.Boolean }, error: SewedError }),
  // Web contents presentation and navigation; a window without web contents fails with Protocol.
  Rpc.make("zoom", { success: WebContents.Zoom, stream: true, error: SewedError }),
  Rpc.make("setZoom", { payload: { factor: WebContents.ZoomFactor }, error: SewedError }),
  Rpc.make("audio", { success: WebContents.Audio, stream: true, error: SewedError }),
  Rpc.make("setAudioMuted", { payload: { muted: Schema.Boolean }, error: SewedError }),
  Rpc.make("history", { success: WebContents.History, stream: true, error: SewedError }),
  Rpc.make("back", { success: WebContents.Settled, error: SewedError }),
  Rpc.make("forward", { success: WebContents.Settled, error: SewedError }),
  /** One request is one search: its results end when the search stops, and interrupting it stops the search. */
  Rpc.make("find", {
    payload: { text: WebContents.FindText, options: Schema.optionalKey(WebContents.FindOptions) },
    success: WebContents.FindResult,
    stream: true,
    error: SewedError,
  }),
  Rpc.make("findNext", { payload: { forward: Schema.Boolean }, error: SewedError }),
  Rpc.make("stopFind", { payload: { action: WebContents.FindStop }, error: SewedError }),
);

/**
 * One window's controls as one capability. Unlike the ambient surfaces, this one belongs to an
 * owner: `WindowControls.native(window)` in `sewed/main` carries the window it was built for, so
 * every operation reaches that window and no other. `Capability.client` reaches it from a
 * document, and serving it twice for two windows gives two owners over this one protocol.
 */
export const capability = Capability.define("window-controls", protocol);
