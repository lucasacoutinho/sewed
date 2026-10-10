import { Cause, Deferred, Effect, Exit, Fiber } from "effect";
import type { Scope } from "effect";
import type { SewedError } from "sewed";
import * as Connection from "./Connection.ts";
import * as ScopedRun from "./ScopedRun.ts";
import { subscribers } from "./Store.ts";

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
  readonly scoped: ScopedRun.Run<A, E>;
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
export const make = <A, E, R>(source: Connection.Source<R>): Owner<A, E, R> => {
  let current: Entry<A, E, R> | undefined;
  let desired: Desired<A, E, R> | undefined;
  let active: Run<A, E, R> | undefined;
  let blocked: Blocked<A, E, R> | undefined;
  let pumpRunning = false;
  let committedSubscriptions = 0;
  let stopWatching: (() => void) | undefined;
  let unavailableFailure: Cause.Cause<E | SewedError> | undefined;
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
    const failure =
      unavailableFailure === undefined ? cause : Cause.combine(unavailableFailure, cause);
    blocked = { entry: run.entry, cause: failure };
    run.entry.terminal = true;
    run.entry.publish({ status: "failure", cause: failure });
    if (current !== undefined && current !== run.entry && current.subscribed) {
      current.terminal = true;
      current.publish({ status: "failure", cause: failure });
    }
  };

  const connectionLost = (cause: Cause.Cause<unknown>): void => {
    if (unavailableFailure !== undefined) return;
    unavailableFailure = Connection.unavailableCause(cause);
    const entry = current;
    if (entry !== undefined && entry.subscribed) {
      entry.generation += 1;
      entry.terminal = true;
      if (desired?.entry === entry) desired = undefined;
      if (active?.entry === entry) publishReleasing(entry);
      else if (active === undefined && blocked === undefined)
        entry.publish({ status: "failure", cause: unavailableFailure });
    }
    if (blocked !== undefined) {
      const failure = Cause.combine(blocked.cause, unavailableFailure);
      blocked = { entry: blocked.entry, cause: failure };
      blocked.entry.publish({ status: "failure", cause: failure });
      if (current !== undefined && current !== blocked.entry && current.subscribed) {
        current.terminal = true;
        current.publish({ status: "failure", cause: failure });
      }
    }
    schedule();
  };

  const closeRun = (run: Run<A, E, R>): Effect.Effect<ScopedRun.Closed<A, E>> =>
    Effect.map(ScopedRun.close(run.scoped), (closed) => {
      if (active === run) active = undefined;
      return closed;
    });

  const closeActive = (run: Run<A, E, R>): Effect.Effect<boolean> =>
    Effect.map(closeRun(run), (closed) => {
      const failure = ScopedRun.failureOf(closed);
      if (failure !== undefined) {
        publishCleanupFailure(run, failure);
        return false;
      }
      if (unavailableFailure === undefined || current !== run.entry) publishReleased(run.entry);
      return true;
    });

  const waitForAcquisition = (run: Run<A, E, R>): Effect.Effect<Completion<A, E>, never, never> =>
    Effect.gen(function* () {
      const observedWake = wake;
      if (Deferred.isDoneUnsafe(observedWake)) {
        wake = Deferred.makeUnsafe<"changed">();
        return "changed";
      }
      const completion = yield* Effect.race(
        Fiber.await(run.scoped.fiber),
        Deferred.await(observedWake),
      );
      if (completion === "changed") wake = Deferred.makeUnsafe<"changed">();
      return completion;
    });

  const start = (target: Desired<A, E, R>): void => {
    target.entry.publish({ status: "loading" });
    active = {
      entry: target.entry,
      generation: target.generation,
      scoped: ScopedRun.start(source.runtime, target.entry.factory),
      phase: "acquiring",
    };
  };

  const reconcile: Effect.Effect<void, never, never> = Effect.gen(function* () {
    while (true) {
      const run = active;
      if (run !== undefined) {
        if (run.phase === "acquiring") {
          if (!isDesired(run)) {
            if (!(yield* closeActive(run))) return;
            continue;
          }
          const completion = yield* waitForAcquisition(run);
          if (completion === "changed") continue;
          if (Exit.isFailure(completion)) {
            const failedAttemptIsCurrent = isDesired(run);
            const closed = yield* closeRun(run);
            if (Exit.isFailure(closed.scope)) {
              publishCleanupFailure(run, Cause.combine(completion.cause, closed.scope.cause));
              return;
            }
            if (failedAttemptIsCurrent && isDesired(run)) {
              desired = undefined;
              run.entry.terminal = true;
              run.entry.publish({ status: "failure", cause: completion.cause });
            } else if (unavailableFailure === undefined || current !== run.entry) {
              publishReleased(run.entry);
            }
            continue;
          }
          if (!isDesired(run)) {
            if (!(yield* closeActive(run))) return;
            continue;
          }
          run.phase = "ready";
          run.entry.publish({ status: "ready", value: completion.value });
          continue;
        }

        if (isDesired(run)) return;
        if (!(yield* closeActive(run))) return;
        continue;
      }

      if (blocked !== undefined) return;

      if (unavailableFailure !== undefined) {
        if (current !== undefined && current.subscribed) {
          current.terminal = true;
          current.publish({ status: "failure", cause: unavailableFailure });
        }
        return;
      }

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
    committedSubscriptions += 1;
    if (current !== undefined && current !== entry) {
      const previous = current;
      current = entry;
      invalidate(previous);
    } else {
      current = entry;
    }
    entry.generation += 1;
    if (unavailableFailure !== undefined) {
      desired = undefined;
      entry.terminal = true;
      entry.publish({ status: "failure", cause: blocked?.cause ?? unavailableFailure });
    } else if (blocked !== undefined) {
      desired = { entry, generation: entry.generation };
      entry.terminal = true;
      entry.publish({ status: "failure", cause: blocked.cause });
    } else {
      desired = { entry, generation: entry.generation };
      if (entry.terminal) publishReleased(entry);
      else entry.publish({ status: "loading" });
    }
    if (committedSubscriptions === 1)
      stopWatching = Connection.watchUnavailable(source, connectionLost);
    schedule();
  };

  const detach = (entry: Entry<A, E, R>): void => {
    if (entry.subscribed) {
      entry.subscribed = false;
      committedSubscriptions -= 1;
    }
    if (committedSubscriptions === 0) {
      stopWatching?.();
      stopWatching = undefined;
    }
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
    if (unavailableFailure !== undefined) {
      entry.terminal = true;
      desired = undefined;
      if (active?.entry === entry) publishReleasing(entry);
      else entry.publish({ status: "failure", cause: blocked?.cause ?? unavailableFailure });
      schedule();
      return;
    }
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
    const listeners = subscribers({ first: () => attach(entry), last: () => detach(entry) });
    const publish = (state: State<A, E>): void => {
      snapshot = state;
      listeners.notify();
    };
    let entry: Entry<A, E, R>;
    const store: Store<A, E> = {
      getSnapshot: () => snapshot,
      subscribe: listeners.subscribe,
      release: () => releaseEntry(entry),
      reload: () => reloadEntry(entry),
    };
    entry = { factory, store, publish, subscribed: false, generation: 0, terminal: false };
    return store;
  };

  return { createStore };
};
