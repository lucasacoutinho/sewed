import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { DependencyList, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Context, Effect, Scope, Stream } from "effect";
import type { Cause } from "effect";
import type { ClientContext, RendererContext } from "sewed";
import type { Rpc } from "effect/unstable/rpc";
import { Binding } from "sewed";
import * as Action from "./internal/Action.ts";
import * as Resource from "./internal/Resource.ts";
import * as Store from "./internal/Store.ts";

export type ActionState<A, E> = Action.State<A, E>;
export type StreamState<A, E> =
  | { readonly status: "loading" }
  | { readonly status: "value"; readonly value: A }
  | { readonly status: "failure"; readonly cause: Cause.Cause<E> };
export type ResourceState<A, E> = Resource.State<A, E>;
export type ResourceServices = ClientContext | RendererContext;

const Runtime = createContext<Context.Context<Action.Services> | null>(null);
const useRuntime = () => {
  const runtime = useContext(Runtime);
  if (!runtime) throw new Error("Sewed hooks require a root mounted by @sewed/react");
  return runtime;
};

export const mount = (
  container: Element,
  children: ReactNode,
): Effect.Effect<void, never, Action.ActionServices> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<Action.Services>();
    const root = yield* Effect.acquireRelease(
      Effect.sync(() => createRoot(container)),
      (root) => Effect.sync(() => root.unmount()),
    );
    yield* Effect.sync(() => {
      root.render(<Runtime.Provider value={context}>{children}</Runtime.Provider>);
    });
  });

export const useClient = <Rpcs extends Rpc.Any>(
  slot: Binding.Slot<Rpcs>,
  options: { readonly connection?: Binding.Connection } = {},
) => {
  const runtime = useRuntime();
  const connection = options.connection ?? "per-call";
  return useMemo(
    () => Effect.runSyncWith(runtime)(Binding.deferred(slot, { connection })),
    [runtime, slot, connection],
  );
};

export const useAction = <Args extends readonly unknown[], A, E>(
  factory: (...args: Args) => Effect.Effect<A, E, Action.ActionServices>,
  options: { readonly mode?: "latest" | "exhaust" } = {},
) => {
  const runtime = useRuntime();
  const store = useMemo(() => Action.make<A, E>(runtime), [runtime]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const mode = options.mode ?? "latest";
  const run = useCallback(
    (...args: Args) => store.run(() => factory(...args), mode),
    [store, factory, mode],
  );
  return { ...state, run, cancel: store.cancel };
};

export const useStream = <A, E>(
  factory: () => Stream.Stream<A, E, Action.ActionServices>,
  dependencies: DependencyList,
): StreamState<A, E> => {
  const runtime = useRuntime();
  const store = useMemo(
    () =>
      Store.make<StreamState<A, E>>({ status: "loading" }, (publish) => {
        let active = true;
        const fiber = Effect.runForkWith(runtime)(
          Effect.scoped(
            Stream.runForEach(Stream.suspend(factory), (value) =>
              Effect.sync(() => {
                if (active) publish({ status: "value", value });
              }),
            ),
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                if (active) publish({ status: "failure", cause });
              }),
            ),
          ),
        );
        return () => {
          active = false;
          fiber.interruptUnsafe();
        };
      }),
    [runtime, ...dependencies],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
};

export const useResource = <A, E>(
  factory: () => Effect.Effect<A, E, ResourceServices | Scope.Scope>,
  dependencies: DependencyList,
): ResourceState<A, E> & { readonly release: () => void; readonly reload: () => void } => {
  const runtime = useRuntime();
  const owner = useMemo(() => Resource.make<A, E, Action.Services>(runtime), [runtime]);
  const store = useMemo(() => owner.createStore(factory), [owner, ...dependencies]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { ...state, release: store.release, reload: store.reload };
};
