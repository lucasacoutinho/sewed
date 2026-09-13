import { Effect, Schema } from "effect";
import * as DesktopCapturer from "../DesktopCapturer.ts";
import { MainContext } from "../RuntimeContext.ts";
import type { SewedError } from "../SewedError.ts";
import type { Handle } from "./Session.ts";
import { resolved } from "./SessionSettings.ts";

const decodeDecision = Schema.decodeUnknownSync(DesktopCapturer.Decision);

/**
 * Installs the decider that answers screen sharing requests for the session, or removes it with
 * null. The decider picks one of `DesktopCapturer.sources` or denies; without it, and when a
 * decider fails, the request is denied.
 */
export const setDisplayMedia = <R>(
  handle: Handle,
  decider:
    | ((request: DesktopCapturer.Request) => Effect.Effect<DesktopCapturer.Decision, unknown, R>)
    | null,
): Effect.Effect<void, SewedError, MainContext | R> =>
  Effect.gen(function* () {
    const native = yield* resolved(handle);
    if (decider === null) {
      native.setDisplayMediaRequestHandler(null);
      return;
    }
    const context = yield* Effect.context<R>();
    const run = Effect.runPromiseWith(context);
    native.setDisplayMediaRequestHandler((request, callback) => {
      void run(
        Effect.suspend(() =>
          decider({
            // Electron reports the origin with a trailing slash; rules elsewhere use URL origins.
            origin: URL.parse(request.securityOrigin)?.origin ?? request.securityOrigin,
            videoRequested: request.videoRequested,
            audioRequested: request.audioRequested,
            userGesture: request.userGesture,
          }),
        ).pipe(
          Effect.map((decision) => decodeDecision(decision)),
          Effect.catchCause((cause) =>
            Effect.as(Effect.logError("Display media decider failed; request denied", cause), {
              kind: "deny",
            } as DesktopCapturer.Decision),
          ),
        ),
      ).then((decision) => {
        if (decision.kind === "deny") callback({});
        else
          callback({
            video: { id: decision.id, name: "" },
            ...(decision.audio === undefined ? {} : { audio: decision.audio }),
          });
      });
    });
  });
