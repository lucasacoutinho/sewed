import { Context, Effect, Exit, Scope } from "effect";
import type { Cause, Fiber } from "effect";
import type { ClientContext, RendererContext } from "sewed";
import * as Store from "./Store.ts";

export type Services = ClientContext | RendererContext;
export type ActionServices = Services | Scope.Scope;
export type State<A, E> =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "success"; readonly value: A }
  | { readonly status: "failure"; readonly cause: Cause.Cause<E> }
  | { readonly status: "interrupted" };

interface Invocation {
  readonly scope: Scope.Closeable;
  fiber?: Fiber.Fiber<unknown, unknown>;
  pending: boolean;
}

const release = (invocation: Invocation | undefined) => {
  if (!invocation) return;
  invocation.fiber?.interruptUnsafe();
  Effect.runFork(Scope.close(invocation.scope, Exit.void));
};

export const make = <A, E>(runtime: Context.Context<Services>) => {
  let active = false;
  let invocation: Invocation | undefined;
  const close = () => {
    const previous = invocation;
    invocation = undefined;
    release(previous);
  };
  const store = Store.make<State<A, E>>({ status: "idle" }, () => {
    active = true;
    return () => {
      active = false;
      close();
    };
  });
  return {
    ...store,
    run: (factory: () => Effect.Effect<A, E, ActionServices>, mode: "latest" | "exhaust") => {
      if (!active || (mode === "exhaust" && invocation?.pending)) return;
      close();
      const current: Invocation = { scope: Scope.makeUnsafe(), pending: true };
      invocation = current;
      store.publish({ status: "running" });
      const fiber = Effect.runForkWith(runtime)(
        Effect.suspend(factory).pipe(Scope.provide(current.scope)),
      );
      current.fiber = fiber;
      fiber.addObserver((exit) => {
        current.pending = false;
        Effect.runFork(
          Effect.gen(function* () {
            if (exit._tag === "Failure") yield* Scope.close(current.scope, exit);
            if (!active || invocation !== current) return;
            store.publish(
              exit._tag === "Success"
                ? { status: "success", value: exit.value }
                : { status: "failure", cause: exit.cause },
            );
          }),
        );
      });
    },
    cancel: () => {
      close();
      if (active) store.publish({ status: "interrupted" });
    },
  };
};
