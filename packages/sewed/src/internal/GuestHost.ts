import { Effect, Layer, Schema, Stream } from "effect";
import type { Scope } from "effect";
import * as Capability from "../Capability.ts";
import { HostPolicy, tab } from "../GuestView.ts";
import type { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type * as WebContents from "../WebContents.ts";

export { HostPolicy, protocol, tab } from "../GuestView.ts";

/** The structural subset of a guest's core the protocol serves. */
export interface HostCore {
  readonly state: Stream.Stream<WebContents.State, SewedError, MainContext>;
  readonly focus: Effect.Effect<void, SewedError, MainContext>;
  readonly capture: (
    options: WebContents.CaptureOptions,
  ) => Effect.Effect<WebContents.Capture, SewedError, MainContext>;
  readonly zoom: Stream.Stream<WebContents.Zoom, SewedError, MainContext>;
  readonly setZoom: (factor: number) => Effect.Effect<void, SewedError, MainContext>;
  readonly history: Stream.Stream<WebContents.History, SewedError, MainContext>;
  readonly back: Effect.Effect<void, SewedError, MainContext>;
  readonly forward: Effect.Effect<void, SewedError, MainContext>;
  readonly find: (
    text: string,
    options?: WebContents.FindOptions,
  ) => Effect.Effect<WebContents.Search, SewedError, MainContext | Scope.Scope>;
  readonly findNext: (forward?: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly stopFind: (
    action?: WebContents.FindStop,
  ) => Effect.Effect<void, SewedError, MainContext>;
}

/**
 * The guest a tab capability is served for: its page, and the navigate its own navigation policy
 * already checks. An acquired `GuestView` handle is one of these; a test supplies its own.
 */
export interface Guest {
  readonly webContents: HostCore;
  readonly navigate: (url: string) => Effect.Effect<void, SewedError, MainContext>;
}

/**
 * The tab operations a capability serves, each one already behind the host policy. The policy
 * only decides whether a call runs, so this is the guest's own shape exactly. One declaration, so
 * the two cannot drift.
 */
export type Operations = HostCore & Pick<Guest, "navigate">;

const decodePolicy = Schema.decodeUnknownSync(HostPolicy);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

// `navigate` and `capture` are the only gated operations and neither streams, so a denial is an
// Effect failure. A streaming operation would have to deny on its own stream instead.
const denied = (what: string) =>
  Effect.fail(protocolError(`The host policy does not grant ${what}`));

/**
 * Checks the host policy once and returns operations that apply it before the guest runs. This is
 * the only place those rules live, so the native Layer and a served renderer call cannot drift
 * apart. State, focus, zoom, find, and history are always served; `navigate` and `capture` only
 * when the policy grants them. An invalid policy fails here, while the Layer is building.
 */
export const operations = (
  policy: HostPolicy,
  guest: Guest,
): Effect.Effect<Operations, SewedError> =>
  Effect.map(
    Effect.try({
      try: () => decodePolicy(policy),
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid host policy", cause),
    }),
    (granted) => ({
      ...guest.webContents,
      navigate: (url: string) => (granted.navigate ? guest.navigate(url) : denied("navigate")),
      capture: (options: WebContents.CaptureOptions) =>
        granted.capture ? guest.webContents.capture(options) : denied("capture"),
    }),
  );

/**
 * A guest's hosted tab for main. Like a window's controls, this capability belongs to an owner, so
 * the Layer threads an acquired guest rather than a plain options bag, and compiles the host
 * policy once over that guest. The policy lives in this Layer, not in a separate host, so
 * `Capability.serve(GuestView.tab)` gives a document exactly the rules a main-side call obeys.
 */
export const native = (
  guest: Guest,
  policy: HostPolicy,
): Layer.Layer<typeof tab, SewedError, MainContext> =>
  Capability.fromHandlers(tab, (implement) =>
    implement(
      Effect.map(operations(policy, guest), (page) => ({
        state: () => page.state,
        focus: () => page.focus,
        navigate: ({ url }) => page.navigate(url),
        capture: (options) => page.capture(options),
        zoom: () => page.zoom,
        setZoom: ({ factor }) => page.setZoom(factor),
        history: () => page.history,
        back: () => page.back,
        forward: () => page.forward,
        find: ({ text, options }) =>
          Stream.scoped(
            Stream.unwrap(Effect.map(page.find(text, options ?? {}), (search) => search.results)),
          ),
        findNext: ({ forward }) => page.findNext(forward),
        stopFind: ({ action }) => page.stopFind(action),
      })),
    ),
  );
