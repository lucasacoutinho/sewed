import { Cause, Deferred, Effect, Exit } from "effect";
import type { Context, Scope } from "effect";
import { Renderer, SewedError } from "sewed";
import type { ClientContext, RendererContext } from "sewed";

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
   * the cause, when the runtime is unavailable. An aborted `signal` interrupts the fiber it
   * started — the host's own finalizers run — and the returned promise rejects with the
   * interruption.
   */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, Services | Scope.Scope>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<A>;
}

/** The `Closed` `SewedError` every unavailable runtime state fails `runtime`/`run` with. */
export const unavailable = (cause: Cause.Cause<unknown>) =>
  new SewedError({
    code: "Closed",
    message: "The Sewed runtime is unavailable",
    cause: Cause.squash(cause),
  });

/** `RuntimeStore.run`'s own mechanism, shared by every store this module and `testing.ts` build. */
export const runWith = <A, E>(
  runtime: Effect.Effect<Context.Context<Services>, SewedError>,
  effect: Effect.Effect<A, E, Services | Scope.Scope>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<A> =>
  new Promise((resolve, reject) => {
    const { signal } = options;
    // `Effect.runFork` evaluates synchronous work to completion before this function returns, so
    // checking `signal.aborted` only after forking would run the effect's body on an
    // already-aborted signal. Checked first, with the same rejection value a mid-run abort
    // produces (`Cause.squash` of an interrupt-only cause), the effect never starts.
    if (signal?.aborted === true) {
      reject(Cause.squash(Cause.interrupt()));
      return;
    }
    const fiber = Effect.runFork(
      Effect.flatMap(runtime, (context) => Effect.provideContext(Effect.scoped(effect), context)),
    );
    const onAbort = () => fiber.interruptUnsafe();
    if (signal !== undefined) signal.addEventListener("abort", onAbort, { once: true });
    fiber.addObserver((exit) => {
      signal?.removeEventListener("abort", onAbort);
      if (Exit.isSuccess(exit)) resolve(exit.value);
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
  return {
    subscribe: () => () => {},
    getSnapshot: () => state,
    close: () => {},
    runtime,
    run: (effect, options) => runWith(runtime, effect, options),
  };
};

/** The store `document()` answers before anything ever registers one: a plain web page's own. */
const documentUnavailable = staticStore({
  status: "unavailable",
  cause: Cause.fail(new Error("No Sewed runtime is connected to this document")),
});

/** The store `connect` last registered, or a testing `store` currently standing in for it. */
let documentStore: RuntimeStore | undefined;

/**
 * The document's one runtime store: whatever `connect` last registered, or whatever
 * `@sewed/react/testing`'s `store` currently stands in for it, or the static `unavailable` store
 * a plain web page — nothing ever connected — answers. `RuntimeProvider` reads this when it is
 * given no `store` prop.
 */
export const document = (): RuntimeStore => documentStore ?? documentUnavailable;

/**
 * Registers `store` as the document's own, closing whatever was registered before it. A document
 * has one connection, so `connect` calls this at the end of every connection it opens: a second
 * `connect` replaces and closes the first.
 */
const registerDocumentStore = (store: RuntimeStore): void => {
  const previous = documentStore;
  documentStore = store;
  previous?.close();
};

/**
 * Stands `store` in for the document's store until the function this returns restores whatever
 * was there — without closing it. `@sewed/react/testing`'s `store(bindings)` calls this while it
 * is open and restores on `close()`, so nested test stores in one file unwind in order, like a
 * stack.
 */
export const standIn = (store: RuntimeStore): (() => void) => {
  const previous = documentStore;
  documentStore = store;
  return () => {
    documentStore = previous;
  };
};

/**
 * Connects this document to main outside React. The store is `connecting` until the handshake
 * completes, `ready` while the document's scope lives, and `unavailable` when the page has no
 * Sewed preload, the handshake fails, or the connection ends. Registers as `document()`'s store,
 * closing whatever `connect` had registered before it.
 */
export const connect = (entry: Renderer.Entry): RuntimeStore => {
  let state: RuntimeState = { status: "connecting" };
  let context: Context.Context<Services> | undefined;
  const listeners = new Set<() => void>();
  const settled = Deferred.makeUnsafe<void>();
  const publish = (next: RuntimeState) => {
    state = next;
    if (next.status !== "connecting") Deferred.doneUnsafe(settled, Effect.void);
    for (const listener of listeners) listener();
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
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    close: () => {
      fiber.interruptUnsafe();
    },
    runtime,
    run: (effect, options) => runWith(runtime, effect, options),
  };
  registerDocumentStore(store);
  return store;
};
