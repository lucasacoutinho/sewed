import { Cause, Effect, Exit } from "effect";
import type { Context } from "effect";
import { Renderer } from "sewed";
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
}

type Services = ClientContext | RendererContext;

const runtimes = new WeakMap<RuntimeStore, () => Context.Context<Services> | undefined>();

/** The runtime a ready store holds; the provider reads it without exposing it in the state. */
export const runtimeOf = (store: RuntimeStore): Context.Context<Services> | undefined =>
  runtimes.get(store)?.();

export const staticStore = (state: RuntimeState): RuntimeStore => ({
  subscribe: () => () => {},
  getSnapshot: () => state,
  close: () => {},
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
  const publish = (next: RuntimeState) => {
    state = next;
    for (const listener of listeners) listener();
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
  };
  runtimes.set(store, () => runtime);
  return store;
};
