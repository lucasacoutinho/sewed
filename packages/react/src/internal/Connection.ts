import { Cause, Effect, Exit } from "effect";
import type { Context, Scope } from "effect";
import { Renderer, SewedError } from "sewed";
import type { ClientContext, RendererContext } from "sewed";

/** Where a renderer runtime is: still binding, ready for hooks, or unavailable with its cause. */
export type RuntimeState =
  | { readonly status: "connecting" }
  | { readonly status: "ready" }
  | { readonly status: "unavailable"; readonly cause: Cause.Cause<unknown> };

/** An external store over one renderer connection, for `useSyncExternalStore` and plain code. */
export interface RuntimeStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => RuntimeState;
  readonly close: () => void;
  /**
   * Runs an effect with the connected runtime in its own scope, for code that cannot use hooks.
   * It waits while the handshake is in progress and rejects with a `Closed` SewedError, carrying
   * the cause, when the runtime is unavailable.
   */
  readonly run: <A, E>(effect: Effect.Effect<A, E, Services | Scope.Scope>) => Promise<A>;
}

type Services = ClientContext | RendererContext;

const unavailable = (cause: Cause.Cause<unknown>) =>
  new SewedError({
    code: "Closed",
    message: "The Sewed runtime is unavailable",
    cause: Cause.squash(cause),
  });

const runtimes = new WeakMap<RuntimeStore, () => Context.Context<Services> | undefined>();

/** The runtime a ready store holds; the provider reads it without exposing it in the state. */
export const runtimeOf = (store: RuntimeStore): Context.Context<Services> | undefined =>
  runtimes.get(store)?.();

export const staticStore = (state: RuntimeState): RuntimeStore => ({
  subscribe: () => () => {},
  getSnapshot: () => state,
  close: () => {},
  run: () =>
    Promise.reject(unavailable(state.status === "unavailable" ? state.cause : Cause.empty)),
});

/**
 * Connects this document to main outside React. The store is `connecting` until the handshake
 * completes, `ready` while the document's scope lives, and `unavailable` when the page has no
 * Sewed preload, the handshake fails, or the connection ends.
 */
export const connect = (entry: Renderer.Entry): RuntimeStore => {
  let state: RuntimeState = { status: "connecting" };
  let runtime: Context.Context<Services> | undefined;
  const listeners = new Set<() => void>();
  let settle: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const publish = (next: RuntimeState) => {
    state = next;
    if (next.status !== "connecting") settle();
    for (const listener of listeners) listener();
  };
  const run = <A, E>(effect: Effect.Effect<A, E, Services | Scope.Scope>): Promise<A> => {
    const current = state;
    if (current.status === "connecting") return settled.then(() => run(effect));
    if (current.status === "unavailable") return Promise.reject(unavailable(current.cause));
    if (runtime === undefined) return Promise.reject(unavailable(Cause.empty));
    return Effect.runPromiseWith(runtime)(Effect.scoped(effect));
  };
  const fiber = Renderer.run(
    entry,
    Effect.gen(function* () {
      const context = yield* Effect.context<Services>();
      yield* Effect.sync(() => {
        runtime = context;
        publish({ status: "ready" });
      });
    }),
  );
  fiber.addObserver((exit) => {
    runtime = undefined;
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
    run,
  };
  runtimes.set(store, () => runtime);
  return store;
};
