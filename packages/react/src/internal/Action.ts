import { Cause, Effect, Exit } from "effect";
import type { Scope } from "effect";
import type { SewedError } from "sewed";
import type { ClientContext, RendererContext } from "sewed";
import * as Connection from "./Connection.ts";
import * as ScopedRun from "./ScopedRun.ts";
import * as Store from "./Store.ts";

export type Services = ClientContext | RendererContext;
export type ActionServices = Services | Scope.Scope;
export type State<A, E> =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "success"; readonly value: A }
  | { readonly status: "failure"; readonly cause: Cause.Cause<E | SewedError> }
  | { readonly status: "interrupted" };

interface Request<A, E> {
  readonly factory: () => Effect.Effect<A, E, ActionServices>;
}

interface Invocation<A, E> {
  readonly run: ScopedRun.Run<A, E>;
  done: boolean;
}

const combine = <E>(
  left: Cause.Cause<E> | undefined,
  right: Cause.Cause<E> | undefined,
): Cause.Cause<E> | undefined =>
  left === undefined ? right : right === undefined ? left : Cause.combine(left, right);

/**
 * The non-React owner behind one useAction call. One invocation holds the scope at a time: a
 * replacement, a cancel, an unmount or a lost runtime closes it — fiber first, then scope — and
 * only then does the latest request start.
 */
export const make = <A, E>(source: Connection.Source<Services>) => {
  let active = false;
  let invocation: Invocation<A, E> | undefined;
  let closing = false;
  let desired: Request<A, E> | undefined;
  let lost: Cause.Cause<unknown> | undefined;

  const lostFailure = (): Cause.Cause<E | SewedError> | undefined =>
    lost === undefined ? undefined : Connection.unavailableCause(lost);

  const start = (): void => {
    if (!active || invocation !== undefined || desired === undefined) return;
    const request = desired;
    desired = undefined;
    const closed = lostFailure();
    if (closed !== undefined) {
      store.publish({ status: "failure", cause: closed });
      return;
    }
    const current: Invocation<A, E> = {
      run: ScopedRun.start(source.runtime, request.factory),
      done: false,
    };
    invocation = current;
    current.run.fiber.addObserver((exit) => {
      current.done = true;
      if (invocation !== current || closing) return;
      if (lost !== undefined || desired !== undefined || Exit.isFailure(exit)) close();
      else if (active) store.publish({ status: "success", value: exit.value });
    });
  };

  const finish = (closed: ScopedRun.Closed<A, E>): void => {
    closing = false;
    invocation = undefined;
    const cause = combine(ScopedRun.failureOf(closed), lostFailure());
    // A failed finalizer or a lost runtime ends the action; anything else yields to a replacement.
    if (cause !== undefined && (Exit.isFailure(closed.scope) || lost !== undefined)) {
      desired = undefined;
      if (active) store.publish({ status: "failure", cause });
    } else if (desired !== undefined) start();
    else if (cause !== undefined && active) store.publish({ status: "failure", cause });
  };

  const close = (): void => {
    if (invocation === undefined || closing) return;
    closing = true;
    Effect.runFork(
      Effect.tap(ScopedRun.close(invocation.run), (closed) => Effect.sync(() => finish(closed))),
    );
  };

  const store = Store.make<State<A, E>>({ status: "idle" }, () => {
    active = true;
    const stopWatching = Connection.watchUnavailable(source, (cause) => {
      lost = cause;
      desired = undefined;
      if (invocation === undefined) return;
      store.publish({ status: "interrupted" });
      close();
    });
    return () => {
      active = false;
      stopWatching();
      desired = undefined;
      close();
    };
  });

  return {
    ...store,
    run: (factory: () => Effect.Effect<A, E, ActionServices>, mode: "latest" | "exhaust") => {
      if (!active) return;
      const busy = desired !== undefined || closing || invocation?.done === false;
      if (mode === "exhaust" && busy) return;
      const closed = lostFailure();
      if (closed !== undefined) {
        if (invocation === undefined) store.publish({ status: "failure", cause: closed });
        return;
      }
      const request = { factory };
      desired = request;
      store.publish({ status: "running" });
      // A listener may have cancelled or replaced this request while it was published.
      if (desired !== request) return;
      if (invocation !== undefined) close();
      else start();
    },
    cancel: () => {
      if (!active) return;
      const current = invocation;
      desired = undefined;
      store.publish({ status: "interrupted" });
      // A listener may have started another invocation; that one is not this cancel's.
      if (invocation === current) close();
    },
  };
};
