import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Bounds } from "./internal/Geometry.ts";
import { SewedError } from "./SewedError.ts";
import * as WebContents from "./WebContents.ts";

export { Bounds } from "./internal/Geometry.ts";

export const BoundsUpdate = Bounds.mapFields(Struct.map(Schema.optionalKey));
export type BoundsUpdate = typeof BoundsUpdate.Type;

export const State = Schema.Struct({
  bounds: Bounds,
  normalBounds: Bounds,
  visible: Schema.Boolean,
  focused: Schema.Boolean,
  minimized: Schema.Boolean,
  maximized: Schema.Boolean,
  fullScreen: Schema.Boolean,
});
export type State = typeof State.Type;

export const protocol = RpcGroup.make(
  Rpc.make("show", { error: SewedError }),
  Rpc.make("showInactive", { error: SewedError }),
  Rpc.make("hide", { error: SewedError }),
  Rpc.make("focus", { error: SewedError }),
  Rpc.make("setBounds", { payload: BoundsUpdate, error: SewedError }),
  Rpc.make("setFullScreen", { payload: { fullScreen: Schema.Boolean }, error: SewedError }),
  Rpc.make("minimize", { error: SewedError }),
  Rpc.make("maximize", { error: SewedError }),
  Rpc.make("restore", { error: SewedError }),
  Rpc.make("close", { error: SewedError }),
  Rpc.make("state", { success: State, error: SewedError }),
  Rpc.make("changes", { success: State, stream: true, error: SewedError }),
  // Web contents presentation and navigation; a window without web contents fails with Protocol.
  Rpc.make("zoom", { success: WebContents.Zoom, stream: true, error: SewedError }),
  Rpc.make("setZoom", { payload: { factor: WebContents.ZoomFactor }, error: SewedError }),
  Rpc.make("audio", { success: WebContents.Audio, stream: true, error: SewedError }),
  Rpc.make("setAudioMuted", { payload: { muted: Schema.Boolean }, error: SewedError }),
  Rpc.make("history", { success: WebContents.History, stream: true, error: SewedError }),
  Rpc.make("back", { error: SewedError }),
  Rpc.make("forward", { error: SewedError }),
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
