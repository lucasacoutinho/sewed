import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { DependencyList, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Cause, Context, Effect, Scope, Stream } from "effect";
import type { SewedError } from "sewed";
import { Binding, ClientContext } from "sewed";
import type { RendererContext } from "sewed";
import type { Rpc } from "effect/unstable/rpc";
import * as Action from "./internal/Action.ts";
import * as Connection from "./internal/Connection.ts";
import * as Resource from "./internal/Resource.ts";
import * as Store from "./internal/Store.ts";

export type ActionState<A, E> = Action.State<A, E>;
export type StreamState<A, E> =
  | { readonly status: "loading" }
  | { readonly status: "value"; readonly value: A }
  | { readonly status: "failure"; readonly cause: Cause.Cause<E | SewedError> };
export type ResourceState<A, E> = Resource.State<A, E>;
export type ResourceServices = ClientContext | RendererContext;
export type RuntimeState = Connection.RuntimeState;
export type RuntimeStore = Connection.RuntimeStore;
export const connect = Connection.connect;
export const document = Connection.document;

const detachedStore = Connection.staticStore({
  status: "unavailable",
  cause: Cause.fail(new Error("No Sewed runtime is provided to this React tree")),
});
const StatusStore = createContext<RuntimeStore>(detachedStore);

export const mount = (
  container: Element,
  children: ReactNode,
): Effect.Effect<void, never, Action.ActionServices> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<Action.Services>();
    const store = Connection.staticStore({ status: "ready" }, context);
    const root = yield* Effect.acquireRelease(
      Effect.sync(() => createRoot(container)),
      (root) => Effect.sync(() => root.unmount()),
    );
    yield* Effect.sync(() => {
      root.render(createElement(StatusStore.Provider, { value: store }, children));
    });
  });

/**
 * Provides a connected runtime to a React tree the application already owns. `store` is
 * optional: omitted, this reads `document()` — the store `connect` last registered for this
 * document, or the static `unavailable` store when nothing has. Every hook memoizes on the store
 * itself, which is stable across connecting, ready and unavailable, so no hook below this
 * provider ever remounts as the runtime arrives or goes away.
 */
export const RuntimeProvider = ({
  store,
  children,
}: {
  readonly store?: RuntimeStore;
  readonly children?: ReactNode;
}) => createElement(StatusStore.Provider, { value: store ?? Connection.document() }, children);

/** The state of the runtime this tree was given: always ready under `mount`. */
export const useRuntimeStatus = (): RuntimeState => {
  const store = useContext(StatusStore);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
};

export const useClient = <Rpcs extends Rpc.Any>(
  slot: Binding.Slot<Rpcs>,
  options: { readonly connection?: Binding.Connection } = {},
) => {
  const store = useContext(StatusStore);
  const connection = options.connection ?? "shared";
  return useMemo(
    () =>
      Binding.pending(slot, {
        context: Effect.map(store.runtime, (context) => Context.get(context, ClientContext)),
        connection,
      }),
    [store, slot, connection],
  );
};

export const useAction = <Args extends readonly unknown[], A, E>(
  factory: (...args: Args) => Effect.Effect<A, E, Action.ActionServices>,
  options: { readonly mode?: "latest" | "exhaust" } = {},
) => {
  const runtimeStore = useContext(StatusStore);
  const store = useMemo(() => Action.make<A, E>(runtimeStore.runtime), [runtimeStore]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
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
  const runtimeStore = useContext(StatusStore);
  const store = useMemo(
    () =>
      Store.make<StreamState<A, E>>({ status: "loading" }, (publish) => {
        let active = true;
        const fiber = Effect.runFork(
          Effect.flatMap(runtimeStore.runtime, (context) =>
            Effect.provideContext(
              Effect.scoped(
                Stream.runForEach(Stream.suspend(factory), (value) =>
                  Effect.sync(() => {
                    if (active) publish({ status: "value", value });
                  }),
                ),
              ),
              context,
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
    [runtimeStore, ...dependencies],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
};

export const useResource = <A, E>(
  factory: () => Effect.Effect<A, E, ResourceServices | Scope.Scope>,
  dependencies: DependencyList,
): ResourceState<A, E> & { readonly release: () => void; readonly reload: () => void } => {
  const runtimeStore = useContext(StatusStore);
  const owner = useMemo(
    () => Resource.make<A, E, Action.Services>(runtimeStore.runtime),
    [runtimeStore],
  );
  const store = useMemo(() => owner.createStore(factory), [owner, ...dependencies]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...state, release: store.release, reload: store.reload };
};
