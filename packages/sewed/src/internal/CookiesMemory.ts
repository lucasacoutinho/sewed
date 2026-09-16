import { Effect, Layer, Stream } from "effect";
import * as Cookie from "../Cookie.ts";
import type { SewedError } from "../SewedError.ts";
import * as CapabilityMemory from "./CapabilityMemory.ts";
import * as CookiePolicy from "./CookiePolicy.ts";

const stored: Cookie.Cookie = {
  name: "session",
  value: "1",
  domain: "app.example",
  sameSite: "lax",
};
const foreign: Cookie.Cookie = {
  name: "other",
  value: "2",
  domain: "other.example",
  sameSite: "lax",
};
const changes: readonly Cookie.Change[] = [
  { cookie: stored, cause: "explicit", removed: false },
  { cookie: foreign, cause: "explicit", removed: true },
];

// A core that stands in for a session's cookie store, including a change it must filter out. The
// policy above it is the very code the native Layer runs, so a test meets the rules a renderer
// would, without acquiring a session.
const core: CookiePolicy.Core<never> = {
  get: () => Effect.succeed([stored]),
  set: () => Effect.void,
  remove: () => Effect.void,
  flush: Effect.void,
  changes: Stream.fromIterable(changes),
};

/**
 * The cookie capability for tests: the same policy `Cookies.native` carries, no session and no
 * Electron, and a recorder listing the calls. An invalid policy still fails as the Layer builds.
 */
export const memory = (
  policy: Cookie.Policy,
): Layer.Layer<typeof Cookie.capability | CapabilityMemory.Recorder, SewedError> =>
  CapabilityMemory.memory(Cookie.capability, (implement) =>
    implement(
      Effect.map(CookiePolicy.operations(policy, core), (operations) => ({
        get: ({ filter }) => operations.get(filter),
        set: ({ details }) => operations.set(details),
        remove: ({ url, name }) => operations.remove(url, name),
        flush: () => operations.flush,
        changes: () => operations.changes,
      })),
    ),
  );
