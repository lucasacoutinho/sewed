# @sewed/react

React bindings for Sewed. The core `sewed` package owns Electron resources, runtime requirements and RPC. This package owns React mounting and subscriptions.

Import `mount`, `connect`, `RuntimeProvider`, `useRuntimeStatus`, `useClient`, `useAction`, `useStream` and `useResource` from `@sewed/react`. Components remain ordinary React components. The adapter uses `useSyncExternalStore`; it contains no `useEffect` or `useLayoutEffect` calls.

Stores are inert during render. Subscribing starts a stream; unsubscribing releases it. Actions run only when their `run` callback is called. Successful actions retain their invocation scope until replacement, cancellation or unmount; failed actions close it. `mode: "latest"` replaces an existing request and `mode: "exhaust"` ignores another run while one is pending.

`useClient(slot)` keeps one connection per slot for the renderer document, so ordinary calls skip the bridge handshake; the first call fixes the middleware services the shared connection uses, and a lost connection is replaced on the next call. `useClient(slot, { connection: "per-call" })` opens and closes a connection per operation instead, which isolates operations from each other.

A desktop surface's slot is `capability.slot`, an ordinary `Binding.Slot`, so `useClient(WindowControls.capability.slot)` is the same hook call as any other binding. A capability's own operations are a main-side concern; a renderer always reaches the surface through the bound client, and main decides which owner it is bound to.

Mount the React root inside `Renderer.run` using the core package, or connect outside React when the application owns its root. The existing renderer/client requirements remain in action, stream and resource signatures. Native main operations and worker implementations cannot be run directly by these hooks.

## Connecting outside React

An application framework that creates its own React root, or a renderer that must also load as a plain web page, connects the document with `connect(entry)` and provides the runtime with `RuntimeProvider`:

```tsx
const store = connect(Renderer.entry(new URL(location.href), { bindings }));

createRoot(element).render(
  <RuntimeProvider store={store}>
    <App />
  </RuntimeProvider>,
);

function App() {
  const runtime = useRuntimeStatus();
  if (runtime.status === "connecting") return null;
  if (runtime.status === "unavailable") return <BrowserOnlyApp />;
  return <DesktopApp />;
}
```

`connect` starts the handshake immediately and returns an external store whose snapshot is `connecting`, `ready`, or `unavailable` with its `Cause`. A page loaded without the Sewed preload, a rejected handshake, and a closed connection all end `unavailable`; nothing retries. The hooks that need the runtime work only in a subtree rendered while the store is `ready`, and throw otherwise, so gate them on `useRuntimeStatus`. Under `mount` the status is always `ready`. `store.close()` ends the connection, and page hide ends it on its own.

Plain async code that cannot use hooks, such as a module that sends a command, calls `store.run(effect)`. It runs the effect with the connected runtime in its own scope, waits while the store is `connecting`, and rejects with a `Closed` `SewedError` that carries the cause when the runtime is unavailable. It shares the document's one connection with the hooks, because Sewed replaces a document's connection at each handshake.

## Resources

Pass a factory and its reactive dependencies to `useResource`. The factory runs
after React commits the subscription, and its scoped value remains available
until `release`, a dependency replacement, `reload`, or unmount.

```tsx
const resource = useResource(() => Remote.acquire(Reader, Readers, { path }), [path]);

if (resource.status === "ready") {
  return <ReaderView reader={resource.value} />;
}
if (resource.status === "failure") return <ErrorView cause={resource.cause} />;
return <LoadingOrReleasing status={resource.status} />;
```

The state is one of `loading`, `ready`, `releasing`, `released`, or `failure`.
Call `release()` to close the current value and `reload()` to acquire it again.
Changing a dependency closes the previous scope and waits for its finalizers
before starting the replacement. Acquisition, cleanup, and late callbacks from
older dependency stores cannot update the current snapshot. There is no
automatic retry. If cleanup fails, the failure remains latched and blocks
replacement. Calling `reload()` acknowledges that failure and permits a fresh
acquisition after the failed close attempt; the failed finalizer is not rerun.

## Streams

Pass a factory and its reactive dependencies. The adapter manages the subscription; a component does not need to memoize the stream itself.

```tsx
const compute = useClient(Compute);
const state = useStream(() => compute.changes(), [compute]);
```

Include every reactive value captured by the factory. React compares dependencies with `Object.is`; keep the list's length constant. To stop a subscription conditionally, return an empty stream:

```tsx
const state = useStream(() => (enabled ? compute.changes() : Stream.empty), [compute, enabled]);
```

The factory runs when React subscribes, after commit. Ordinary rerenders with unchanged dependencies retain the subscription. Changing a dependency closes the previous subscription, resets the snapshot to `loading`, and starts the new stream. Late results cannot update the new snapshot. Unmount and renderer shutdown release the subscription. React may also unsubscribe and resubscribe during development StrictMode or Fast Refresh; stream resources must support normal scoped acquisition and release.

An empty stream leaves the state at `loading`. A completed stream retains its last value. A failed stream exposes its `Cause`; neither completion nor failure triggers an automatic retry. A factory that throws becomes a stream failure, rather than a render error.

In prototype.16, `useStream(stream)` becomes `useStream(() => stream, [stream])`. A module-level stream uses `useStream(() => heartbeat, [])`. Remove a surrounding `useMemo` when its only purpose was stabilizing a stream, and put its dependencies on `useStream` instead.

For projects using [`eslint-plugin-react-hooks`](https://react.dev/reference/eslint-plugin-react-hooks/lints/exhaustive-deps#options), add `useStream` to the `react-hooks/exhaustive-deps` rule's `additionalHooks` expression so the callback and dependency list are checked together. This is optional consumer tooling; the adapter does not add a lint dependency.
