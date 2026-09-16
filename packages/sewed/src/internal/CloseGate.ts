import { Effect, Fiber } from "effect";
import type { Scope } from "effect";
import { SewedError } from "../SewedError.ts";
import type * as Decision from "../Decision.ts";
import type * as Registry from "./DecisionRegistry.ts";

/**
 * Gates a native close/quit event behind a decidable, resolved against the owner's own registry.
 * `approve` performs the real close/quit once the resolved answer allows it; `event` and
 * `approvingAnswer` are fixed at construction, since both quit and window-close events carry nothing
 * that changes across requests for the same owner. Generic over `Event`/`Answer` so `Task 4` can
 * install the same gate for `Window.Close` by passing a different registry, decidable, event, and
 * approving answer — nothing here names "quit" or "allow" itself.
 *
 * Composition replaces what this module used to enforce alone: any number of deciders may be
 * installed on `decidable` through the owner's own `decide`, and the registry's own composition rule
 * (declared on the decidable, not here) decides among them. There is no longer a single "guard" slot
 * and no `Limit` failure for a second one.
 *
 * The approving answer is compared with `===`, not structurally: every decidable this wave gates a
 * close/quit event with answers in a plain string literal union (`"allow" | "deny"`), for which `===`
 * and structural equality agree. A future `Answer` that is a tagged object would not be `===`-equal to
 * `approvingAnswer` even when structurally identical, since `resolveCore` decodes every candidate
 * afresh — this gate is narrower than its `Answer` type parameter alone suggests.
 */
export const make = <Event, Answer>(
  approve: () => void,
  registry: ReturnType<typeof Registry.make>,
  decidable: Decision.Decidable<Event, Answer, "sync" | "async">,
  event: Event,
  approvingAnswer: Answer,
) => {
  let closed = false;
  let pending = false;
  let fiber: Fiber.Fiber<void> | undefined;
  return {
    request() {
      if (closed || pending) return;
      pending = true;
      fiber = Effect.runFork(
        Effect.yieldNow.pipe(
          Effect.andThen(registry.resolveAsync(decidable, event)),
          Effect.andThen((answer) =>
            Effect.sync(() => {
              if (!closed && answer === approvingAnswer) approve();
            }),
          ),
          // registry.resolveAsync is Effect<Answer, never>, so the only failure source left in this
          // pipeline is approve() itself throwing. Task 4's approve is native.close()-driven, so this
          // is no longer a theoretical case the way it was for App.Quit's Deferred-completing one.
          Effect.catchCause((cause) => Effect.logError("Close gate failed; request denied", cause)),
          Effect.ensuring(
            Effect.sync(() => {
              pending = false;
            }),
          ),
        ),
      );
    },
    close(): Effect.Effect<void> {
      closed = true;
      const toInterrupt = fiber;
      fiber = undefined;
      return toInterrupt === undefined
        ? Effect.void
        : Fiber.interrupt(toInterrupt).pipe(Effect.asVoid);
    },
  };
};

interface Guard {
  readonly request: () => void;
  readonly close: () => Effect.Effect<void>;
}

/**
 * The single pre-built-decision gate `make` above replaced for `App.Quit`. It survives here, under
 * this name, for exactly one remaining caller: `internal/Window.ts`'s `guardClose`. Internal
 * scaffolding, not a public surface — delete this together with `guardClose` when Task 4 migrates
 * `Window.Close` onto `make` the same way `App.Quit` already has. Nothing enforces that deletion; it
 * is a debt this comment records rather than a guarantee.
 */
export const makeSingleGuard = (approve: () => void) => {
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
