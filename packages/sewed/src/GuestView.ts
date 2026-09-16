import { Schema } from "effect";
import type { Effect, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import type * as Automation from "./Automation.ts";
import { Declaration as AutomationDeclaration } from "./Automation.ts";
import * as Binary from "./Binary.ts";
import * as Capability from "./Capability.ts";
import type * as Download from "./Download.ts";
import type { Handle as SessionHandle } from "./internal/Session.ts";
import type { Attachable } from "./internal/View.ts";
import type { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import * as WebContents from "./WebContents.ts";
import * as WebRequest from "./WebRequest.ts";

/** Chromium match patterns a guest may navigate to; an empty policy loads nothing. */
export const NavigationPolicy = Schema.Array(WebRequest.Pattern);
export type NavigationPolicy = typeof NavigationPolicy.Type;

export const WebRtcPolicy = Schema.Literals([
  "default",
  "publicInterfaceOnly",
  "disableNonProxiedUdp",
]);
export type WebRtcPolicy = typeof WebRtcPolicy.Type;

/** Whether keyboard and mouse input reaches the guest page. */
export const InputPolicy = Schema.Literals(["allow", "block"]);
export type InputPolicy = typeof InputPolicy.Type;

export const Settings = Schema.Struct({
  navigation: NavigationPolicy,
  webRtc: Schema.optionalKey(WebRtcPolicy),
  input: Schema.optionalKey(InputPolicy),
  backgroundThrottling: Schema.optionalKey(Schema.Boolean),
  automation: Schema.optionalKey(AutomationDeclaration),
});
export type Settings = typeof Settings.Type;

export interface Options<A extends Automation.Declaration> extends Omit<Settings, "automation"> {
  readonly session?: SessionHandle;
  readonly automation?: A;
}

/** What a hosted owner serves beyond state, focus, zoom, find, and history. */
export const HostPolicy = Schema.Struct({ navigate: Schema.Boolean, capture: Schema.Boolean });
export type HostPolicy = typeof HostPolicy.Type;

export const protocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("state", { success: WebContents.State, stream: true, error: SewedError }),
    Rpc.make("focus", { error: SewedError }),
    Rpc.make("navigate", { payload: { url: Schema.String }, error: SewedError }),
    Rpc.make("capture", {
      payload: WebContents.CaptureOptions,
      success: Binary.Bytes,
      error: SewedError,
    }),
    Rpc.make("zoom", { success: WebContents.Zoom, stream: true, error: SewedError }),
    Rpc.make("setZoom", { payload: { factor: WebContents.ZoomFactor }, error: SewedError }),
    Rpc.make("history", { success: WebContents.History, stream: true, error: SewedError }),
    Rpc.make("back", { error: SewedError }),
    Rpc.make("forward", { error: SewedError }),
    /** One request is one search: its results end when the search stops, and interrupting it stops the search. */
    Rpc.make("find", {
      payload: {
        text: WebContents.FindText,
        options: Schema.optionalKey(WebContents.FindOptions),
      },
      success: WebContents.FindResult,
      stream: true,
      error: SewedError,
    }),
    Rpc.make("findNext", { payload: { forward: Schema.Boolean }, error: SewedError }),
    Rpc.make("stopFind", { payload: { action: WebContents.FindStop }, error: SewedError }),
  ),
);

/**
 * A guest's hosted tab as one capability. Like a window's controls, it belongs to an owner:
 * `GuestView.native(guest, policy)` in `sewed/main` carries the host policy for one acquired view,
 * and `Capability.client` reaches it from a document. The policy still decides `navigate` and
 * `capture`; everything else on the protocol is always served.
 */
export const tab = Capability.define("guest-tab", protocol);

/** A view that hosts a page the application does not own: no preload, no bridge, no bindings. */
export interface Handle<A extends Automation.Declaration = {}, Core = unknown> extends Attachable {
  readonly id: string;
  readonly webContents: Core;
  readonly navigate: (url: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly setNavigationPolicy: (
    policy: NavigationPolicy,
  ) => Effect.Effect<void, SewedError, MainContext>;
  /** Blocks or allows keyboard and mouse input to the page; automation is declared separately. */
  readonly setInputPolicy: (policy: InputPolicy) => Effect.Effect<void, SewedError, MainContext>;
  readonly blocked: Stream.Stream<WebContents.Blocked, SewedError, MainContext>;
  readonly downloads: <R>(
    decide: (offer: Download.Offer) => Effect.Effect<Download.Decision, SewedError, R>,
  ) => Stream.Stream<Download.Handle, SewedError, MainContext | R>;
  readonly automation: Automation.Of<A>;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}
