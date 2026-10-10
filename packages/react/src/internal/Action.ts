import type { Cause, Effect, Scope } from "effect";
import type { SewedError } from "sewed";
import type { ClientContext, RendererContext } from "sewed";
import type * as Connection from "./Connection.ts";
import * as Resource from "./Resource.ts";
import * as Store from "./Store.ts";

export type Services = ClientContext | RendererContext;
export type ActionServices = Services | Scope.Scope;
export type State<A, E> =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "success"; readonly value: A }
  | { readonly status: "failure"; readonly cause: Cause.Cause<E | SewedError> }
  | { readonly status: "interrupted" };

interface Run<A, E> {
  readonly resource: Resource.Store<A, E>;
  unsubscribe: () => void;
}

/**
 * The non-React owner behind one useAction call. An action is a resource acquired on demand: each
 * run is one store of a single resource owner, which already closes the run before it — fiber
 * first, then scope — on a replacement, a cancel, an unmount or a lost runtime. This module only
 * starts runs and names their states.
 */
export const make = <A, E>(source: Connection.Source<Services>) => {
  const owner = Resource.make<A, E, Services>(source);
  let active = false;
  let run: Run<A, E> | undefined;

  const publish = (state: State<A, E>): void => {
    const { status } = store.getSnapshot();
    // `running` and `interrupted` carry nothing, so repeating one would only wake listeners.
    if (status === state.status && (status === "running" || status === "interrupted")) return;
    store.publish(state);
  };

  const reflect = (current: Run<A, E>): void => {
    if (!active || run !== current) return;
    const state = current.resource.getSnapshot();
    switch (state.status) {
      case "loading":
        return publish({ status: "running" });
      case "ready":
        return publish({ status: "success", value: state.value });
      case "failure":
        return publish({ status: "failure", cause: state.cause });
      case "releasing":
      case "released":
        return publish({ status: "interrupted" });
    }
  };

  const busy = (): boolean => {
    const status = run?.resource.getSnapshot().status;
    return status === "loading" || status === "releasing";
  };

  const store = Store.make<State<A, E>>({ status: "idle" }, () => {
    active = true;
    return () => {
      active = false;
      run?.unsubscribe();
      run = undefined;
    };
  });

  return {
    ...store,
    run: (factory: () => Effect.Effect<A, E, ActionServices>, mode: "latest" | "exhaust") => {
      if (!active || (mode === "exhaust" && busy())) return;
      const previous = run;
      const failedBefore = previous?.resource.getSnapshot().status === "failure";
      const current: Run<A, E> = { resource: owner.createStore(factory), unsubscribe: () => {} };
      run = current;
      // Subscribed before the previous run is let go, so the owner sees a replacement, not a gap.
      current.unsubscribe = current.resource.subscribe(() => reflect(current));
      previous?.unsubscribe();
      // A finalizer that failed on an earlier run leaves the owner refusing new work, and a new
      // run clears that. A failure that arrives while closing the run this one replaces stands.
      if (failedBefore && current.resource.getSnapshot().status === "failure")
        current.resource.reload();
      reflect(current);
    },
    cancel: () => {
      if (!active) return;
      if (run === undefined) publish({ status: "interrupted" });
      else run.resource.release();
    },
  };
};
