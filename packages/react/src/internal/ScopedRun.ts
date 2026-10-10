import { Cause, Effect, Exit, Fiber, Scope } from "effect";
import type { Context } from "effect";
import type { SewedError } from "sewed";

/** One factory run in a scope of its own. The scope outlives the fiber until {@link close}. */
export interface Run<A, E> {
  readonly scope: Scope.Closeable;
  readonly fiber: Fiber.Fiber<A, E | SewedError>;
}

export interface Closed<A, E> {
  readonly exit: Exit.Exit<A, E | SewedError>;
  readonly scope: Exit.Exit<void>;
}

export const start = <A, E, R>(
  runtime: Effect.Effect<Context.Context<R>, SewedError>,
  factory: () => Effect.Effect<A, E, R | Scope.Scope>,
): Run<A, E> => {
  const scope = Scope.makeUnsafe("sequential");
  // The yield lets the caller record the run before its factory can cancel or replace it.
  const fiber = Effect.runFork(
    Effect.andThen(
      Effect.yieldNow,
      Effect.flatMap(runtime, (context) =>
        Effect.provideContext(Scope.provide(scope)(Effect.suspend(factory)), context),
      ),
    ),
  );
  return { scope, fiber };
};

/** Interrupts the run if it is still going, waits for it, then closes its scope with its exit. */
export const close = <A, E>(run: Run<A, E>): Effect.Effect<Closed<A, E>> =>
  Effect.gen(function* () {
    yield* Fiber.interrupt(run.fiber);
    const exit = yield* Fiber.await(run.fiber);
    return { exit, scope: yield* Effect.exit(Scope.close(run.scope, exit)) };
  });

/** What a closed run failed with, an interruption aside: its own failure, its finalizers', or both. */
export const failureOf = <A, E>(closed: Closed<A, E>): Cause.Cause<E | SewedError> | undefined => {
  const own =
    Exit.isFailure(closed.exit) && !Cause.hasInterruptsOnly(closed.exit.cause)
      ? closed.exit.cause
      : undefined;
  if (Exit.isSuccess(closed.scope)) return own;
  return own === undefined ? closed.scope.cause : Cause.combine(own, closed.scope.cause);
};
