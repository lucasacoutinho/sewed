import type { Session } from "electron";
import { Effect } from "effect";
import * as Decidables from "../Decidables.ts";
import type * as Registry from "./DecisionRegistry.ts";

/**
 * Installs the display media handler that resolves `Decidables.Session.DisplayMedia` against
 * `registry` for every screen-share request the session receives, for the session's lifetime — there
 * is no separate `null`-removal path here, the way there was for the old single-slot decider:
 * closing a decider's own scope is what removes it, the same as any other decidable in this catalog.
 * A request with no decider installed, and one whose decider fails or answers off-schema, both reach
 * the decidable's own `deny` fallback inside `resolveAsync` itself, so the answer this handler's
 * callback receives is already a valid `DesktopCapturer.Decision` with no decoding left to do here.
 */
export const install = (native: Session, registry: ReturnType<typeof Registry.make>): void => {
  native.setDisplayMediaRequestHandler((request, callback) => {
    void Effect.runPromise(
      registry.resolveAsync(Decidables.Session.DisplayMedia, {
        // Electron reports the origin with a trailing slash; rules elsewhere use URL origins.
        origin: URL.parse(request.securityOrigin)?.origin ?? request.securityOrigin,
        videoRequested: request.videoRequested,
        audioRequested: request.audioRequested,
        userGesture: request.userGesture,
      }),
    ).then((decision) => {
      if (decision.kind === "deny") callback({});
      else
        callback({
          video: { id: decision.id, name: "" },
          ...(decision.audio === undefined ? {} : { audio: decision.audio }),
        });
    });
  });
};
