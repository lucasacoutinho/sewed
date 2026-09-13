import { Effect, Fiber } from "effect";
import type { Scope } from "effect";
import { SewedError } from "../SewedError.ts";

interface Guard {
  readonly request: () => void;
  readonly close: () => Effect.Effect<void>;
}

export const make = (approve: () => void) => {
  let guard: Guard | undefined;
  let closed = false;
  return {
    isGuarded: () => guard !== undefined,
    request() {
      if (closed) return;
      if (guard === undefined) approve();
      else guard.request();
    },
    close() {
      closed = true;
      const previous = guard;
      guard = undefined;
      return previous?.close() ?? Effect.void;
    },
    guard: <R>(
      decision: Effect.Effect<boolean, never, R>,
    ): Effect.Effect<void, SewedError, R | Scope.Scope> =>
      Effect.gen(function* () {
        const context = yield* Effect.context<R>();
        const run = Effect.runForkWith(context);
        yield* Effect.acquireRelease(
          Effect.suspend(() => {
            if (closed)
              return Effect.fail(
                new SewedError({ code: "Closed", message: "Close owner is closed" }),
              );
            if (guard !== undefined)
              return Effect.fail(
                new SewedError({ code: "Limit", message: "A close guard is already installed" }),
              );
            let active = true;
            let pending = false;
            let fiber: Fiber.Fiber<void> | undefined;
            const registration: Guard = {
              request() {
                if (!active || pending) return;
                pending = true;
                fiber = run(
                  Effect.yieldNow.pipe(
                    Effect.andThen(Effect.scoped(decision)),
                    Effect.flatMap((allowed) =>
                      Effect.sync(() => {
                        if (active && allowed && !closed) approve();
                      }),
                    ),
                    Effect.catchCause((cause) =>
                      Effect.logError("Close guard failed; request denied", cause),
                    ),
                    Effect.ensuring(
                      Effect.sync(() => {
                        pending = false;
                      }),
                    ),
                  ),
                );
              },
              close() {
                active = false;
                return fiber === undefined
                  ? Effect.void
                  : Fiber.interrupt(fiber).pipe(Effect.asVoid);
              },
            };
            guard = registration;
            return Effect.succeed(registration);
          }),
          (registration) =>
            Effect.suspend(() => {
              if (guard === registration) guard = undefined;
              return registration.close();
            }),
        );
      }),
  };
};
