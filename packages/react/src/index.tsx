import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { DependencyList, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Cause, Context, Effect, Scope, Stream } from "effect";
import type { ClientContext, RendererContext } from "sewed";
import type { Rpc } from "effect/unstable/rpc";
import { Binding } from "sewed";
import * as Action from "./internal/Action.ts";
import * as Connection from "./internal/Connection.ts";
import * as Resource from "./internal/Resource.ts";
import * as Store from "./internal/Store.ts";

export type ActionState<A, E> = Action.State<A, E>;
export type StreamState<A, E> =
  | { readonly status: "loading" }
  | { readonly status: "value"; readonly value: A }
  | { readonly status: "failure"; readonly cause: Cause.Cause<E> };
export type ResourceState<A, E> = Resource.State<A, E>;
export type ResourceServices = ClientContext | RendererContext;
export type RuntimeState = Connection.RuntimeState;
export type RuntimeStore = Connection.RuntimeStore;
export const connect = Connection.connect;

const Runtime = createContext<Context.Context<Action.Services> | null>(null);
const mountedStore = Connection.staticStore({ status: "ready" });
const detachedStore = Connection.staticStore({
  status: "unavailable",
  cause: Cause.fail(new Error("No Sewed runtime is provided to this React tree")),
});
const StatusStore = createContext<RuntimeStore>(detachedStore);
const useRuntime = () => {
  const runtime = useContext(Runtime);
  if (!runtime)
    throw new Error("Sewed hooks require a ready runtime from mount or RuntimeProvider");
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
      root.render(
        <StatusStore.Provider value={mountedStore}>
          <Runtime.Provider value={context}>{children}</Runtime.Provider>
        </StatusStore.Provider>,
      );
    });
  });

/**
 * Provides a connected runtime to a React tree the application already owns. Hooks that need the
 * runtime work while the store is ready; read `useRuntimeStatus` to render before that.
 */
export const RuntimeProvider = ({
  store,
  children,
}: {
  readonly store: RuntimeStore;
  readonly children?: ReactNode;
}) => {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const runtime = state.status === "ready" ? (Connection.runtimeOf(store) ?? null) : null;
  return (
    <StatusStore.Provider value={store}>
      <Runtime.Provider value={runtime}>{children}</Runtime.Provider>
    </StatusStore.Provider>
  );
};

/** The state of the runtime this tree was given: always ready under `mount`. */
export const useRuntimeStatus = (): RuntimeState => {
  const store = useContext(StatusStore);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
};

export const useClient = <Rpcs extends Rpc.Any>(
  slot: Binding.Slot<Rpcs>,
  options: { readonly connection?: Binding.Connection } = {},
) => {
  const runtime = useRuntime();
  const connection = options.connection ?? "shared";
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
