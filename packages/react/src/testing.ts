import { Cause, Context, Effect, Exit, Scope } from "effect";
import { Binding, ClientContext, SewedError } from "sewed";
import type { RendererContext } from "sewed";
import { renderer } from "sewed/testing";
import * as Connection from "./internal/Connection.ts";

type Services = ClientContext | RendererContext;

/**
 * A `RuntimeStore` over in-process hosts, for a renderer module's own tests: `bindings` is what
 * `Binding.to(slot, host)` builds from an owner `Testing.host` (from `sewed/testing`) returns —
 * the same shape a real `Binding.layer` list takes, over hosts that dispatch in process instead
 * of across Electron's IPC bridge. There is no handshake to wait for, so the store answers
 * `ready` at once; `run` and every hook this package exports run over that context exactly as
 * `connect`'s does. It stands itself in for `document()` while it stays open, so a renderer
 * module's plain actions — code outside React that reads `document()` directly, the way
 * `connect`'s own consumer does — reach this store during the test too. `close()` closes the
 * scope the bindings' own connections live in, publishes `unavailable`, and restores whatever
 * `document()` answered before this store stood in for it — a stack, so nested `store` calls in
 * one test file unwind in order — so a test can prove a component observes disconnection too. The
 * host's own services (whatever scope `Testing.host` itself was built in) are the caller's, and
 * are released the same way any other `Testing.host` use releases them: when that surrounding
 * scope closes.
 */
export const store = (bindings: readonly Binding.Bound[]): Connection.RuntimeStore => {
  const scope = Scope.makeUnsafe();
  const listeners = new Set<() => void>();
  let state: Connection.RuntimeState;
  let context: Context.Context<Services> | undefined;

  const program = Effect.gen(function* () {
    const clientContextService = yield* Binding.clientContext(bindings).pipe(Scope.provide(scope));
    const rendererContext = yield* Effect.context<RendererContext>();
    return Context.add(rendererContext, ClientContext, clientContextService);
  }).pipe(Effect.provide(renderer));

  const exit = Effect.runSyncExit(program);
  if (Exit.isSuccess(exit)) {
    context = exit.value;
    state = { status: "ready" };
  } else {
    context = undefined;
    state = { status: "unavailable", cause: exit.cause };
  }

  const runtime: Effect.Effect<Context.Context<Services>, SewedError> = Effect.suspend(
    (): Effect.Effect<Context.Context<Services>, SewedError> =>
      state.status === "ready" && context !== undefined
        ? Effect.succeed(context)
        : Effect.fail(
            Connection.unavailable(state.status === "unavailable" ? state.cause : Cause.empty),
          ),
  );

  const result: Connection.RuntimeStore = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    close: () => {
      context = undefined;
      Effect.runFork(Scope.close(scope, Exit.void));
      state = { status: "unavailable", cause: Cause.empty };
      for (const listener of listeners) listener();
      restore();
    },
    runtime,
    run: (effect, runOptions) => Connection.runWith(runtime, effect, runOptions),
  };
  const restore = Connection.standIn(result);
  return result;
};
