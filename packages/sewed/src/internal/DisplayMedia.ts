import type { Session } from "electron";
import * as Decidables from "../Decidables.ts";
import * as UrlRule from "../UrlRule.ts";
import * as NativeAnswer from "./NativeAnswer.ts";
import type * as Registry from "./DecisionRegistry.ts";

/**
 * `UrlRule.originOf` reports the literal string `"null"` for an opaque origin (`file:`, `data:`, an
 * unregistered scheme) — Chromium's own `URL.origin` spelling for "this document has no origin", not
 * a real identity. `Decidables.Session.DisplayMedia`'s event must not hand a decider a value that
 * looks like an identity and is not, the same treatment `internal/Session.ts`'s own `originOrNull`
 * gives `Decidables.Session.Permission`'s `origin`.
 */
const originOrNull = (url: URL): string | null => {
  const value = UrlRule.originOf(url);
  return value === "null" ? null : value;
};

/** Electron reports the origin with a trailing slash; an unparseable value names no origin either. */
const securityOriginOf = (raw: string): string | null => {
  const url = URL.parse(raw);
  return url === null ? null : originOrNull(url);
};

/**
 * Installs the display media handler that resolves `Decidables.Session.DisplayMedia` against
 * `registry` for every screen-share request the session receives, while it is installed —
 * `internal/Session.ts` calls this only from its `Session.DisplayMedia` hook's own `attach`, the
 * moment the decidable's entry count goes from zero to one, and clears the handler with `null` from
 * that same hook's `detach`, the moment it goes back to zero. There is no separate `null`-removal
 * path *here* the way there was for the old single-slot decider: closing a decider's own scope is
 * what removes it from the registry, and the hook is what turns "no deciders left" into the native
 * `null`.
 *
 * `NativeAnswer.run` is what makes the native callback total for every exit that settles: a decider
 * that dies, or a `reply` Electron itself rejects, both still leave the request answered exactly
 * once, denied. A decider that never completes is the one case `NativeAnswer.run` does not answer —
 * deliberately, by that module's own doc, since it declines to impose a timeout on a human-paced
 * decision — so a screen-share decider is responsible for its own liveness the same way any other
 * async decider is. A request with no decider installed, and one whose decider fails or answers
 * off-schema, both reach the decidable's own `deny` fallback inside `resolveAsync` itself, so the
 * answer `reply` receives is already a valid `DesktopCapturer.Decision` with no decoding left to do
 * here.
 */
export const install = (native: Session, registry: Registry.Resolver): void => {
  native.setDisplayMediaRequestHandler((request, callback) => {
    NativeAnswer.run({
      label: Decidables.Session.DisplayMedia.key,
      resolution: registry.resolveAsync(Decidables.Session.DisplayMedia, {
        origin: securityOriginOf(request.securityOrigin),
        videoRequested: request.videoRequested,
        audioRequested: request.audioRequested,
        userGesture: request.userGesture,
      }),
      reply: (decision) => {
        if (decision.kind === "deny") callback({});
        else
          callback({
            video: { id: decision.id, name: "" },
            ...(decision.audio === undefined ? {} : { audio: decision.audio }),
          });
      },
      failed: () => callback({}),
    });
  });
};
