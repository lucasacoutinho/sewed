import { Cause, Deferred, Effect, Exit, type Fiber } from "effect";
import type { Context, Scope } from "effect";
import { Renderer, SewedError } from "sewed";
import type { ClientContext, RendererContext } from "sewed";
import * as Store from "./Store.ts";

/** Where a renderer runtime is: still binding, ready for hooks, or unavailable with its cause. */
export type RuntimeState =
  | { readonly status: "connecting" }
  | { readonly status: "ready" }
  | { readonly status: "unavailable"; readonly cause: Cause.Cause<unknown> };

type Services = ClientContext | RendererContext;

/** An external store over one renderer connection, for `useSyncExternalStore` and plain code. */
export interface RuntimeStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => RuntimeState;
  readonly close: () => void;
  /**
   * The connected runtime: succeeds at once while the store is ready, waits while the handshake
   * is in progress, and fails `Closed` carrying the cause once the store is unavailable. Every
   * hook `flatMap`s this to run its own work, so that work starts for real the moment the store
   * becomes ready, with no remount.
   */
  readonly runtime: Effect.Effect<Context.Context<Services>, SewedError>;
  /**
   * Runs an effect with the connected runtime in its own scope, for code that cannot use hooks.
   * It waits while the handshake is in progress and rejects with a `Closed` SewedError, carrying
   * the cause, when the runtime is unavailable. Runtime loss also interrupts running work and
   * waits for its finalizers before rejecting; an operation or cleanup failure is preserved.
   * An aborted `signal` interrupts the fiber, runs its finalizers, and rejects the promise with
   * the interruption, including when the effect itself aborts the signal during startup.
   */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, Services | Scope.Scope>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<A>;
}

/** What a hook's owner needs of a runtime store: the runtime, and when it stops being one. */
export interface Source<R> {
  readonly runtime: Effect.Effect<Context.Context<R>, SewedError>;
  readonly subscribe: RuntimeStore["subscribe"];
  readonly getSnapshot: RuntimeStore["getSnapshot"];
}

/** Watches a runtime's terminal state without missing an already-unavailable snapshot. */
export const watchUnavailable = (
  store: Pick<RuntimeStore, "subscribe" | "getSnapshot">,
  onUnavailable: (cause: Cause.Cause<unknown>) => void,
): (() => void) => {
  let active = true;
  let notified = false;
  const check = (): void => {
    if (!active || notified) return;
    const state = store.getSnapshot();
    if (state.status !== "unavailable") return;
    notified = true;
    onUnavailable(state.cause);
  };
  const unsubscribe = store.subscribe(check);
  check();
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
  };
};

/** The `Closed` `SewedError` every unavailable runtime state fails `runtime`/`run` with. */
export const unavailable = (cause: Cause.Cause<unknown>) =>
  new SewedError({
    code: "Closed",
    message: "The Sewed runtime is unavailable",
    cause: Cause.squash(cause),
  });

/** The failure every owner reports once its runtime is gone. */
export const unavailableCause = (cause: Cause.Cause<unknown>): Cause.Cause<SewedError> =>
  Cause.fail(unavailable(cause));

/**
 * Forks `work` against `source`'s runtime. Losing the runtime interrupts the fiber and tells
 * `onLost` why, so the caller reports `Closed` in place of the interruption. `stop` ends the
 * watch; until then `onLost` hears a loss even after the fiber has finished.
 */
export const forkWith = <A, E, R>(
  source: Source<R>,
  work: (context: Context.Context<R>) => Effect.Effect<A, E>,
  onLost: (cause: Cause.Cause<unknown>) => void,
) => {
  let lost = false;
  let fiber: Fiber.Fiber<A, E | SewedError> | undefined;
  const stop = watchUnavailable(source, (cause) => {
    lost = true;
    // Told first: interrupting can settle the fiber, and its observer reads what `onLost` records.
    onLost(cause);
    fiber?.interruptUnsafe();
  });
  const forked = Effect.runFork(
    Effect.suspend(() => (lost ? Effect.interrupt : Effect.flatMap(source.runtime, work))),
  );
  fiber = forked;
  // `work` runs synchronously up to its first suspension and may have lost the runtime already.
  if (lost) forked.interruptUnsafe();
  return { fiber: forked, stop };
};

/** `RuntimeStore.run`'s own mechanism, shared by every store this module and `testing.ts` build. */
export const runWith = <A, E, R>(
  source: Source<R>,
  effect: Effect.Effect<A, E, R | Scope.Scope>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<A> =>
  new Promise((resolve, reject) => {
    const { signal } = options;
    // Checked before forking, with the same rejection value a mid-run abort produces
    // (`Cause.squash` of an interrupt-only cause), so the effect never starts.
    if (signal?.aborted === true) {
      reject(Cause.squash(Cause.interrupt()));
      return;
    }
    let lost: Cause.Cause<unknown> | undefined;
    const running = forkWith(
      source,
      (context) => Effect.provideContext(Effect.scoped(effect), context),
      (cause) => {
        lost = cause;
      },
    );
    const onAbort = () => running.fiber.interruptUnsafe();
    signal?.addEventListener("abort", onAbort, { once: true });
    // Startup may have aborted before the listener was installed.
    if (signal?.aborted) onAbort();
    running.fiber.addObserver((exit) => {
      running.stop();
      signal?.removeEventListener("abort", onAbort);
      if (lost !== undefined && (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)))
        reject(unavailable(lost));
      else if (Exit.isSuccess(exit)) resolve(exit.value);
      else reject(Cause.squash(exit.cause));
    });
  });

/**
 * A store that never changes: `ready` with `context` runs work against it at once; any other
 * state fails every `run` and every read of `runtime` `Closed`, with `state`'s own cause when it
 * carries one.
 */
export const staticStore = (
  state: RuntimeState,
  context?: Context.Context<Services>,
): RuntimeStore => {
  const runtime: Effect.Effect<Context.Context<Services>, SewedError> = state.status === "ready" &&
  context !== undefined
    ? Effect.succeed(context)
    : Effect.fail(unavailable(state.status === "unavailable" ? state.cause : Cause.empty));
  const store: RuntimeStore = {
    subscribe: () => () => {},
    getSnapshot: () => state,
    close: () => {},
    runtime,
    run: (effect, options) => runWith(store, effect, options),
  };
  return store;
};

/** The store `documentStore()` answers before anything ever registers one: a plain web page's own. */
const documentUnavailable = staticStore({
  status: "unavailable",
  cause: Cause.fail(new Error("No Sewed runtime is connected to this document")),
});

/** The store `connect` last registered — never a testing stand-in, which lives in its own slot. */
let connectedStore: RuntimeStore | undefined;

/**
 * Every testing store currently standing in for the document, oldest first. `documentStore()`
 * answers the last entry — the most recently opened stand-in that has not yet closed — so opening
 * two and closing them out of order still leaves the right one in front: closing one removes
 * exactly that entry, wherever it sits, rather than unwinding a fixed slot that assumes its caller
 * closes in reverse order.
 */
const standIns: RuntimeStore[] = [];

/**
 * The document's one runtime store: the last stand-in still open, or whatever `connect` last
 * registered, or the static `unavailable` store a plain web page — nothing ever connected —
 * answers. `RuntimeProvider` reads this when it is given no `store` prop.
 */
export const documentStore = (): RuntimeStore =>
  standIns[standIns.length - 1] ?? connectedStore ?? documentUnavailable;

/**
 * Registers `store` as the document's own connection, closing whatever `connect` had registered
 * before it. A document has one connection, so `connect` calls this at the end of every
 * connection it opens: a second `connect` replaces and closes the first. This never touches
 * {@link standIns}: a testing store standing in when a new connection lands keeps standing in,
 * and `documentStore()` reaches the new connection only once every stand-in over it has closed.
 */
const registerDocumentStore = (store: RuntimeStore): void => {
  const previous = connectedStore;
  connectedStore = store;
  previous?.close();
};

/**
 * Stands `store` in for the document's store until the function this returns removes it — without
 * closing it. `@sewed/react/testing`'s `store(bindings)` calls this while it is open and removes
 * itself on `close()`. Stand-ins may close in any order: the returned closure removes exactly the
 * entry `standIn` pushed, wherever it now sits in {@link standIns}, and is a no-op if that entry is
 * already gone (a second `close()`, or one already removed by this same closure). `documentStore()`
 * keeps answering whichever stand-in remains that opened most recently, and once none are left it
 * falls through to the connected store — never a now-closed stand-in.
 */
export const standIn = (store: RuntimeStore): (() => void) => {
  standIns.push(store);
  return () => {
    const index = standIns.indexOf(store);
    if (index !== -1) standIns.splice(index, 1);
  };
};

/**
 * Connects this document to main outside React. The store is `connecting` until the handshake
 * completes, `ready` while the document's scope lives, and `unavailable` when the page has no
 * Sewed preload, the handshake fails, or the connection ends. Registers as `documentStore()`'s
 * store, closing whatever `connect` had registered before it.
 */
export const connect = (entry: Renderer.Entry): RuntimeStore => {
  let state: RuntimeState = { status: "connecting" };
  let context: Context.Context<Services> | undefined;
  const listeners = Store.subscribers();
  const settled = Deferred.makeUnsafe<void>();
  const publish = (next: RuntimeState) => {
    state = next;
    if (next.status !== "connecting") Deferred.doneUnsafe(settled, Effect.void);
    listeners.notify();
  };
  const runtime: Effect.Effect<Context.Context<Services>, SewedError> = Effect.suspend(
    (): Effect.Effect<Context.Context<Services>, SewedError> => {
      if (state.status === "unavailable") return Effect.fail(unavailable(state.cause));
      if (state.status === "ready" && context !== undefined) return Effect.succeed(context);
      return Effect.andThen(Deferred.await(settled), runtime);
    },
  );
  const fiber = Renderer.run(
    entry,
    Effect.gen(function* () {
      const current = yield* Effect.context<Services>();
      yield* Effect.sync(() => {
        context = current;
        publish({ status: "ready" });
      });
    }),
  );
  fiber.addObserver((exit) => {
    context = undefined;
    publish({ status: "unavailable", cause: Exit.isFailure(exit) ? exit.cause : Cause.empty });
  });
  const store: RuntimeStore = {
    subscribe: listeners.subscribe,
    getSnapshot: () => state,
    close: () => {
      fiber.interruptUnsafe();
    },
    runtime,
    run: (effect, options) => runWith(store, effect, options),
  };
  registerDocumentStore(store);
  return store;
};
