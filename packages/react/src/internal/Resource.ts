import { Cause, Context, Deferred, Effect, Exit, Fiber, Scope } from "effect";
import type { SewedError } from "sewed";

export type State<A, E> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: A }
  | { readonly status: "releasing" }
  | { readonly status: "released" }
  | { readonly status: "failure"; readonly cause: Cause.Cause<E | SewedError> };

export type Factory<A, E, R> = () => Effect.Effect<A, E, R | Scope.Scope>;

export interface Store<A, E> {
  readonly getSnapshot: () => State<A, E>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly release: () => void;
  readonly reload: () => void;
}

export interface Owner<A, E, R> {
  readonly createStore: (factory: Factory<A, E, R>) => Store<A, E>;
}

interface Entry<A, E, R> {
  readonly factory: Factory<A, E, R>;
  readonly store: Store<A, E>;
  readonly publish: (state: State<A, E>) => void;
  subscribed: boolean;
  generation: number;
  terminal: boolean;
}

interface Desired<A, E, R> {
  readonly entry: Entry<A, E, R>;
  readonly generation: number;
}

interface Run<A, E, R> {
  readonly entry: Entry<A, E, R>;
  readonly generation: number;
  readonly scope: Scope.Closeable;
  fiber: Fiber.Fiber<A, E | SewedError> | undefined;
  exit: Exit.Exit<A, E | SewedError> | undefined;
  phase: "acquiring" | "ready";
}

interface Blocked<A, E, R> {
  readonly entry: Entry<A, E, R>;
  readonly cause: Cause.Cause<E | SewedError>;
}

type Completion<A, E> = Exit.Exit<A, E | SewedError> | "changed";

/**
 * Creates the non-React owner behind one useResource call.
 *
 * Store creation has no runtime effects. Acquisition begins only when the
 * store receives its first committed subscription. One reconciliation fiber
 * owns the active scope and coalesces all later lifecycle requests.
 */
export const make = <A, E, R>(
  runtime: Effect.Effect<Context.Context<R>, SewedError>,
): Owner<A, E, R> => {
  let current: Entry<A, E, R> | undefined;
  let desired: Desired<A, E, R> | undefined;
  let active: Run<A, E, R> | undefined;
  let blocked: Blocked<A, E, R> | undefined;
  let pumpRunning = false;
  let wake = Deferred.makeUnsafe<"changed">();

  const isDesired = (run: Run<A, E, R>): boolean =>
    desired !== undefined &&
    desired.entry === run.entry &&
    desired.generation === run.generation &&
    run.entry.subscribed;

  const publishReleased = (entry: Entry<A, E, R>): void => {
    const status = entry.store.getSnapshot().status;
    if (status !== "released" && status !== "failure") entry.publish({ status: "released" });
  };

  const publishReleasing = (entry: Entry<A, E, R>): void => {
    if (entry.store.getSnapshot().status !== "releasing") entry.publish({ status: "releasing" });
  };

  const publishCleanupFailure = (run: Run<A, E, R>, cause: Cause.Cause<E | SewedError>): void => {
    blocked = { entry: run.entry, cause };
    run.entry.terminal = true;
    run.entry.publish({ status: "failure", cause });
    if (current !== undefined && current !== run.entry && current.subscribed) {
      current.terminal = true;
      current.publish({ status: "failure", cause });
    }
  };

  const closeScope = (run: Run<A, E, R>): Effect.Effect<Exit.Exit<void, never>, never, never> =>
    Effect.gen(function* () {
      const exit = run.exit;
      const closed = yield* Effect.exit(
        exit === undefined ? Scope.close(run.scope, Exit.void) : Scope.close(run.scope, exit),
      );
      if (active === run) active = undefined;
      return closed;
    });

  const closeActive = (
    run: Run<A, E, R>,
    interrupt: boolean,
  ): Effect.Effect<boolean, never, never> =>
    Effect.gen(function* () {
      let failure: Cause.Cause<E | SewedError> | undefined;
      const fiber = run.fiber;
      if (interrupt && fiber !== undefined) {
        yield* Fiber.interrupt(fiber);
        run.exit = yield* Fiber.await(fiber);
        run.fiber = undefined;
        if (Exit.isFailure(run.exit) && !Cause.hasInterruptsOnly(run.exit.cause))
          failure = run.exit.cause;
      }
      const closed = yield* closeScope(run);
      if (Exit.isFailure(closed))
        failure = failure === undefined ? closed.cause : Cause.combine(failure, closed.cause);
      if (failure !== undefined) {
        publishCleanupFailure(run, failure);
        return false;
      }
      publishReleased(run.entry);
      return true;
    });

  const waitForAcquisition = (run: Run<A, E, R>): Effect.Effect<Completion<A, E>, never, never> =>
    Effect.gen(function* () {
      const observedWake = wake;
      if (Deferred.isDoneUnsafe(observedWake)) {
        wake = Deferred.makeUnsafe<"changed">();
        return "changed";
      }
      const fiber = run.fiber;
      if (fiber === undefined) return "changed";
      const completion = yield* Effect.race(Fiber.await(fiber), Deferred.await(observedWake));
      if (completion === "changed") wake = Deferred.makeUnsafe<"changed">();
      return completion;
    });

  const start = (target: Desired<A, E, R>): void => {
    target.entry.publish({ status: "loading" });
    const scope = Scope.makeUnsafe("sequential");
    const fiber = Effect.runFork(
      Effect.flatMap(runtime, (context) =>
        Effect.provideContext(Scope.provide(scope)(Effect.suspend(target.entry.factory)), context),
      ),
    );
    active = {
      entry: target.entry,
      generation: target.generation,
      scope,
      fiber,
      exit: undefined,
      phase: "acquiring",
    };
  };

  const reconcile: Effect.Effect<void, never, never> = Effect.gen(function* () {
    while (true) {
      const run = active;
      if (run !== undefined) {
        if (run.phase === "acquiring") {
          if (!isDesired(run)) {
            if (!(yield* closeActive(run, true))) return;
            continue;
          }
          const completion = yield* waitForAcquisition(run);
          if (completion === "changed") continue;
          run.fiber = undefined;
          run.exit = completion;
          if (Exit.isFailure(completion)) {
            const failedAttemptIsCurrent = isDesired(run);
            const closed = yield* closeScope(run);
            if (Exit.isFailure(closed)) {
              publishCleanupFailure(run, Cause.combine(completion.cause, closed.cause));
              return;
            }
            if (failedAttemptIsCurrent && isDesired(run)) {
              desired = undefined;
              run.entry.terminal = true;
              run.entry.publish({ status: "failure", cause: completion.cause });
            } else publishReleased(run.entry);
            continue;
          }
          if (!isDesired(run)) {
            if (!(yield* closeActive(run, false))) return;
            continue;
          }
          run.phase = "ready";
          run.entry.publish({ status: "ready", value: completion.value });
          continue;
        }

        if (isDesired(run)) return;
        if (!(yield* closeActive(run, false))) return;
        continue;
      }

      if (blocked !== undefined) return;

      const target = desired;
      if (target === undefined || target.entry.terminal) return;
      start(target);
    }
  });

  const hasWork = (): boolean => {
    const run = active;
    if (run !== undefined) {
      if (run.phase === "acquiring") return true;
      return !isDesired(run);
    }
    if (blocked !== undefined) return false;
    return desired !== undefined && !desired.entry.terminal;
  };

  const schedule = (): void => {
    Deferred.doneUnsafe(wake, Effect.succeed("changed"));
    if (pumpRunning) return;
    pumpRunning = true;
    const fiber = Effect.runFork(reconcile);
    fiber.addObserver(() => {
      pumpRunning = false;
      if (hasWork()) schedule();
    });
  };

  const invalidate = (entry: Entry<A, E, R>): void => {
    entry.generation += 1;
    if (blocked?.entry === entry) return;
    if (active?.entry === entry) publishReleasing(entry);
    else if (entry.store.getSnapshot().status !== "failure") publishReleased(entry);
  };

  const attach = (entry: Entry<A, E, R>): void => {
    entry.subscribed = true;
    if (current !== undefined && current !== entry) {
      const previous = current;
      current = entry;
      invalidate(previous);
    } else {
      current = entry;
    }
    entry.generation += 1;
    desired = { entry, generation: entry.generation };
    if (blocked !== undefined) {
      entry.terminal = true;
      entry.publish({ status: "failure", cause: blocked.cause });
    } else if (entry.terminal) publishReleased(entry);
    else entry.publish({ status: "loading" });
    schedule();
  };

  const detach = (entry: Entry<A, E, R>): void => {
    entry.subscribed = false;
    entry.generation += 1;
    if (current === entry) {
      current = undefined;
      if (desired?.entry === entry) desired = undefined;
    }
    if (blocked?.entry !== entry) {
      if (active?.entry === entry) publishReleasing(entry);
      else if (entry.store.getSnapshot().status !== "failure") publishReleased(entry);
    }
    schedule();
  };

  const releaseEntry = (entry: Entry<A, E, R>): void => {
    if (!entry.subscribed || current !== entry) return;
    entry.generation += 1;
    desired = undefined;
    entry.terminal = true;
    if (blocked?.entry !== entry) {
      if (active?.entry === entry) publishReleasing(entry);
      else if (entry.store.getSnapshot().status !== "failure") publishReleased(entry);
    }
    schedule();
  };

  const reloadEntry = (entry: Entry<A, E, R>): void => {
    if (!entry.subscribed || current !== entry) return;
    entry.generation += 1;
    entry.terminal = false;
    desired = { entry, generation: entry.generation };
    if (blocked !== undefined || active?.entry === entry) publishReleasing(entry);
    else entry.publish({ status: "loading" });
    blocked = undefined;
    schedule();
  };

  const createStore = (factory: Factory<A, E, R>): Store<A, E> => {
    let snapshot: State<A, E> = { status: "loading" };
    const listeners = new Set<() => void>();
    const publish = (state: State<A, E>): void => {
      snapshot = state;
      for (const listener of listeners) listener();
    };
    let entry: Entry<A, E, R>;
    const store: Store<A, E> = {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        if (listeners.has(listener)) return () => undefined;
        listeners.add(listener);
        if (listeners.size === 1) attach(entry);
        return () => {
          if (!listeners.delete(listener)) return;
          if (listeners.size === 0) detach(entry);
        };
      },
      release: () => releaseEntry(entry),
      reload: () => reloadEntry(entry),
    };
    entry = { factory, store, publish, subscribed: false, generation: 0, terminal: false };
    return store;
  };

  return { createStore };
};
