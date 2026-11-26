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
import { Binding, Capability, ClientContext, SewedError } from "sewed";
import type { RendererContext } from "sewed";
import type { Rpc } from "effect/rpc";
import * as Action from "./internal/Action.ts";
import * as Connection from "./internal/Connection.ts";
import * as Resource from "./internal/Resource.ts";
import * as StreamOwner from "./internal/Stream.ts";

export type { ActionServices, State as ActionState } from "./internal/Action.ts";
export type { State as StreamState } from "./internal/Stream.ts";
export type { State as ResourceState } from "./internal/Resource.ts";
export type ResourceServices = ClientContext | RendererContext;
export type { RuntimeState, RuntimeStore } from "./internal/Connection.ts";
export { connect, documentStore } from "./internal/Connection.ts";

const detachedStore = Connection.staticStore({
  status: "unavailable",
  cause: Cause.fail(new Error("No Sewed runtime is provided to this React tree")),
});
const StatusStore = createContext<Connection.RuntimeStore>(detachedStore);

/** Mounts a root for the caller's scope. Selectors resolve when the Effect executes. */
export const mount = (
  container: Element | string,
  children: ReactNode,
): Effect.Effect<void, SewedError, Action.ActionServices> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<Action.Services>();
    const store = Connection.staticStore({ status: "ready" }, context);
    const root = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const element =
            typeof container === "string" ? document.querySelector(container) : container;
          if (element === null)
            throw new SewedError({
              code: "Startup",
              message: `React mount container was not found: ${container}`,
            });
          return createRoot(element);
        },
        catch: (cause) =>
          cause instanceof SewedError
            ? cause
            : new SewedError({ code: "Startup", message: "Could not mount the React root", cause }),
      }),
      (root) => Effect.sync(() => root.unmount()),
    );
    yield* Effect.sync(() => {
      root.render(createElement(StatusStore.Provider, { value: store }, children));
    });
  });

/**
 * Provides a connected runtime to a React tree the application already owns. `store` is
 * optional: omitted, this reads `documentStore()` — the store `connect` last registered for this
 * document, or the static `unavailable` store when nothing has. Every hook memoizes on the store
 * itself, which is stable across connecting, ready and unavailable, so no hook below this
 * provider ever remounts as the runtime arrives or goes away.
 */
export const RuntimeProvider = ({
  store,
  children,
}: {
  readonly store?: Connection.RuntimeStore;
  readonly children?: ReactNode;
}) => createElement(StatusStore.Provider, { value: store ?? Connection.documentStore() }, children);

/** The state of the runtime this tree was given: always ready under `mount`. */
export const useRuntimeStatus = (): Connection.RuntimeState => {
  const store = useContext(StatusStore);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
};

export const useClient = <Rpcs extends Rpc.Any>(
  slot: Binding.Slot<Rpcs>,
  options: { readonly connection?: Binding.Connection } = {},
): Binding.Client<Rpcs> => {
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

/**
 * Acquires a stable handle to a capability's operations over the connected runtime. Unlike
 * {@link useClient}, operations carry no `ClientContext` or `Scope` requirements.
 */
export const useCapability = <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability.Capability<Rpcs, Key>,
  options: { readonly connection?: Binding.Connection } = {},
): Capability.Operations<Rpcs> => {
  const store = useContext(StatusStore);
  const connection = options.connection ?? "shared";
  return useMemo(
    () =>
      Capability.pending(capability, {
        context: Effect.map(store.runtime, (context) => Context.get(context, ClientContext)),
        connection,
      }),
    [store, capability, connection],
  );
};

export const useAction = <Args extends readonly unknown[], A, E>(
  factory: (...args: Args) => Effect.Effect<A, E, Action.ActionServices>,
  options: {
    readonly mode?: "latest" | "exhaust";
    /**
     * Retains the invocation's scope after success until the next run, cancel, or unmount.
     * Defaults to `false`, closing the invocation's scope as soon as it settles.
     */
    readonly retainScope?: boolean;
  } = {},
): Action.State<A, E> & {
  readonly run: (...args: Args) => void;
  readonly cancel: () => void;
} => {
  const runtimeStore = useContext(StatusStore);
  const store = useMemo(() => Action.make<A, E>(runtimeStore), [runtimeStore]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const mode = options.mode ?? "latest";
  const retainScope = options.retainScope ?? false;
  const run = useCallback(
    (...args: Args) => store.run(() => Action.invocation(factory(...args), retainScope), mode),
    [store, factory, mode, retainScope],
  );
  return { ...state, run, cancel: store.cancel };
};

export const useStream = <A, E>(
  factory: () => Stream.Stream<A, E, Action.ActionServices>,
  dependencies: DependencyList,
): StreamOwner.State<A, E> => {
  const runtimeStore = useContext(StatusStore);
  const store = useMemo(
    () => StreamOwner.make<A, E>(runtimeStore, factory),
    [runtimeStore, ...dependencies],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
};

export const useResource = <A, E>(
  factory: () => Effect.Effect<A, E, ResourceServices | Scope.Scope>,
  dependencies: DependencyList,
): Resource.State<A, E> & { readonly release: () => void; readonly reload: () => void } => {
  const runtimeStore = useContext(StatusStore);
  const owner = useMemo(() => Resource.make<A, E, Action.Services>(runtimeStore), [runtimeStore]);
  const store = useMemo(() => owner.createStore(factory), [owner, ...dependencies]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...state, release: store.release, reload: store.reload };
};
