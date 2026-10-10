import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Capability from "./Capability.ts";
import { Bounds } from "./internal/Geometry.ts";
import { SewedError } from "./SewedError.ts";
import * as WebContents from "./WebContents.ts";

export { Bounds } from "./internal/Geometry.ts";

export const BoundsUpdate = Bounds.mapFields(Struct.map(Schema.optionalKey));
export type BoundsUpdate = typeof BoundsUpdate.Type;

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
