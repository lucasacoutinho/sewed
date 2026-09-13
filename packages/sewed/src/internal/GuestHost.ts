import { Effect, Schema, Stream } from "effect";
import type { Scope } from "effect";
import { HostPolicy, protocol } from "../GuestView.ts";
import type { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type * as WebContents from "../WebContents.ts";

/** The structural subset of a guest's core the protocol serves. */
export interface HostCore {
  readonly state: Stream.Stream<WebContents.State, SewedError, MainContext>;
  readonly focus: Effect.Effect<void, SewedError, MainContext>;
  readonly capture: (
    options: WebContents.CaptureOptions,
  ) => Effect.Effect<Uint8Array, SewedError, MainContext>;
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

const decodePolicy = Schema.decodeUnknownSync(HostPolicy);
const denied = (what: string) =>
  Effect.fail(
    new SewedError({ code: "Protocol", message: `The host policy does not grant ${what}` }),
  );

/** Handlers over `GuestView.protocol`; state, focus, zoom, find, and history are always served. */
export const handlers = (
  policy: HostPolicy,
  core: HostCore,
  navigate: (url: string) => Effect.Effect<void, SewedError, MainContext>,
) => {
  let granted: HostPolicy;
  try {
    granted = decodePolicy(policy);
  } catch (cause) {
    throw new SewedError({ code: "Protocol", message: "Invalid host policy", cause });
  }
  return protocol.toLayer({
    state: () => core.state,
    focus: () => core.focus,
    navigate: ({ url }) => (granted.navigate ? navigate(url) : denied("navigate")),
    capture: (options) => (granted.capture ? core.capture(options) : denied("capture")),
    zoom: () => core.zoom,
    setZoom: ({ factor }) => core.setZoom(factor),
    history: () => core.history,
    back: () => core.back,
    forward: () => core.forward,
    find: ({ text, options }) =>
      Stream.scoped(
        Stream.unwrap(Effect.map(core.find(text, options ?? {}), (search) => search.results)),
      ),
    findNext: ({ forward }) => core.findNext(forward),
    stopFind: ({ action }) => core.stopFind(action),
  });
};
