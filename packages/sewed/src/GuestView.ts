import { Schema } from "effect";
import type { Effect, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Binary from "./Binary.ts";
import type { Owner } from "./Binding.ts";
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

const methodSyntax = /^[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/;
/** A DevTools protocol method such as `Runtime.evaluate`. */
export const DevToolsMethod = Schema.String.check(
  Schema.makeFilter((value) => methodSyntax.test(value) || "Expected a Domain.method name"),
);
export type DevToolsMethod = typeof DevToolsMethod.Type;

/** The automation a guest is created with; an undeclared operation does not exist on its handle. */
export const Automation = Schema.Struct({
  evaluate: Schema.optionalKey(Schema.Literal(true)),
  devtools: Schema.optionalKey(Schema.NonEmptyArray(DevToolsMethod)),
  input: Schema.optionalKey(Schema.Literal(true)),
});
export type Automation = typeof Automation.Type;

export const Settings = Schema.Struct({
  navigation: NavigationPolicy,
  webRtc: Schema.optionalKey(WebRtcPolicy),
  backgroundThrottling: Schema.optionalKey(Schema.Boolean),
  automation: Schema.optionalKey(Automation),
});
export type Settings = typeof Settings.Type;

export interface Options<A extends Automation> extends Omit<Settings, "automation"> {
  readonly session?: SessionHandle;
  readonly automation?: A;
}

/** A navigation, redirect, popup, webview, or download the guard prevented. */
export const Blocked = Schema.Struct({
  kind: Schema.Literals(["navigation", "redirect", "popup", "webview", "download"]),
  url: Schema.String,
});
export type Blocked = typeof Blocked.Type;

export const DownloadOffer = Schema.Struct({
  url: Schema.String,
  filename: Schema.String,
  mimeType: Schema.String,
  totalBytes: Schema.Number,
  sourceId: Schema.String,
});
export type DownloadOffer = typeof DownloadOffer.Type;

export const DownloadDecision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({ kind: Schema.Literal("save"), path: Schema.String }),
]);
export type DownloadDecision = typeof DownloadDecision.Type;

export const EvaluateOptions = Schema.Struct({ userGesture: Schema.optionalKey(Schema.Boolean) });
export type EvaluateOptions = typeof EvaluateOptions.Type;

const Modifier = Schema.Literals([
  "shift",
  "control",
  "ctrl",
  "alt",
  "meta",
  "command",
  "cmd",
  "iskeypad",
  "isautorepeat",
  "leftbuttondown",
  "middlebuttondown",
  "rightbuttondown",
  "capslock",
  "numlock",
  "left",
  "right",
]);
const inputFields = { modifiers: Schema.optionalKey(Schema.Array(Modifier)) } as const;
const mouseFields = {
  ...inputFields,
  x: Schema.Number,
  y: Schema.Number,
  globalX: Schema.optionalKey(Schema.Number),
  globalY: Schema.optionalKey(Schema.Number),
  movementX: Schema.optionalKey(Schema.Number),
  movementY: Schema.optionalKey(Schema.Number),
} as const;

/** Data mirrors of Electron's input structures; the library copies them before sending. */
export const MouseInput = Schema.Struct({
  ...mouseFields,
  type: Schema.Literals([
    "mouseDown",
    "mouseUp",
    "mouseEnter",
    "mouseLeave",
    "contextMenu",
    "mouseMove",
  ]),
  button: Schema.optionalKey(Schema.Literals(["left", "middle", "right"])),
  clickCount: Schema.optionalKey(Schema.Int),
});
export type MouseInput = typeof MouseInput.Type;
export const MouseWheelInput = Schema.Struct({
  ...mouseFields,
  type: Schema.Literal("mouseWheel"),
  deltaX: Schema.optionalKey(Schema.Number),
  deltaY: Schema.optionalKey(Schema.Number),
  wheelTicksX: Schema.optionalKey(Schema.Number),
  wheelTicksY: Schema.optionalKey(Schema.Number),
  accelerationRatioX: Schema.optionalKey(Schema.Number),
  accelerationRatioY: Schema.optionalKey(Schema.Number),
  hasPreciseScrollingDeltas: Schema.optionalKey(Schema.Boolean),
  canScroll: Schema.optionalKey(Schema.Boolean),
});
export type MouseWheelInput = typeof MouseWheelInput.Type;
export const KeyboardInput = Schema.Struct({
  ...inputFields,
  type: Schema.Literals(["rawKeyDown", "keyDown", "keyUp", "char"]),
  keyCode: Schema.String.check(Schema.isMinLength(1)),
});
export type KeyboardInput = typeof KeyboardInput.Type;
export const InputEvent = Schema.Union([MouseInput, MouseWheelInput, KeyboardInput]);
export type InputEvent = typeof InputEvent.Type;

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

/** The DevTools methods a declaration allows; none when the declaration has no allowlist. */
export type DevToolsOf<A extends Automation> = A extends { readonly devtools: readonly string[] }
  ? A["devtools"][number]
  : never;

/** Every automation member, typed against one declaration. */
export interface AutomationMembers<A extends Automation> {
  readonly evaluate: <T, I>(
    script: string,
    result: Schema.Codec<T, I>,
    options?: EvaluateOptions,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly devtools: <T, I>(
    method: DevToolsOf<A>,
    params: Schema.Json | undefined,
    result: Schema.Codec<T, I>,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly input: (event: InputEvent) => Effect.Effect<void, SewedError, MainContext>;
}

/** The automation members a declaration grants; undeclared members do not exist on the type. */
export type AutomationOf<A extends Automation> = Pick<
  AutomationMembers<A>,
  Extract<keyof A, keyof AutomationMembers<A>>
>;

/** A view that hosts a page the application does not own: no preload, no bridge, no bindings. */
export interface Handle<A extends Automation = {}, Core = unknown> extends Attachable {
  readonly id: string;
  readonly webContents: Core;
  readonly navigate: (url: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly setNavigationPolicy: (
    policy: NavigationPolicy,
  ) => Effect.Effect<void, SewedError, MainContext>;
  readonly blocked: Stream.Stream<Blocked, SewedError, MainContext>;
  readonly downloads: <R>(
    decide: (offer: DownloadOffer) => Effect.Effect<DownloadDecision, SewedError, R>,
  ) => Stream.Stream<Download.Handle, SewedError, MainContext | R>;
  readonly automation: AutomationOf<A>;
  readonly host: (
    policy: HostPolicy,
  ) => Effect.Effect<Owner<RpcGroup.Rpcs<typeof protocol>>, SewedError, MainContext | Scope.Scope>;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}
