# @sewed/react

Use Sewed clients, actions, streams, and resources in ordinary React components. The core package owns Electron resources and RPC; `@sewed/react` connects their state to React through `useSyncExternalStore`.

Import `mount`, `connect`, `documentStore`, `RuntimeProvider`, `useRuntimeStatus`, `useClient`, `useAction`, `useStream`, and `useResource` from `@sewed/react`. Hook subscriptions manage Sewed work, so components can use their usual event handlers and local state.

You can render the same component while the runtime connects, becomes ready, or is unavailable. Streams and resources start at `loading`; actions start at `idle`. Once subscribed or invoked, they report a `Closed` failure if the runtime is unavailable. A tree without `RuntimeProvider` or `mount` uses an unavailable store.

Call the hooks unconditionally and render their states, as in this component:

```tsx
function Status() {
  const session = useClient(Session); // stable; calls wait or fail Closed
  const owners = useStream(() => session.changes(), [session]);
  if (owners.status === "loading") return <Spinner />;
  if (owners.status === "failure") return <Offline cause={owners.cause} />;
  return <Owners value={owners.value} />;
}
```

## Work while the runtime connects

`useClient` returns a stable client across connecting, ready, and unavailable states. Calls wait for the connection or fail with `Closed`. That stable identity makes the client a useful dependency for `useStream` and `useResource`.

Subscribed streams and resources stay at `loading` while the runtime connects. `useAction.run()` starts a `running` invocation that also waits for readiness. Waiting work begins when the runtime is ready, without remounting the component.

If an active connection ends, work is interrupted and its scoped finalizers finish before its snapshot reports `Closed`. Hook failure types include `SewedError` alongside the factory's own errors. Retries are an application choice.

## Let subscriptions own the work

Rendering a hook creates an inert store. A committed subscription starts a stream or resource, and unsubscribe releases it. An action starts when you call `run`.

Successful actions keep their invocation scope until replacement, cancellation, unmount, or runtime loss. Failed actions close it. `mode: "latest"` waits for the previous invocation's cleanup before starting its replacement; `mode: "exhaust"` ignores another run while one is pending.

`useClient(slot)` shares one connection per slot for the renderer document. The first call establishes the middleware services used by that connection. If the connection is lost, the next call can acquire a replacement for the same bound owner.

Use `useClient(slot, { connection: "per-call" })` when each operation needs its own connection. Each operation opens and closes that connection independently.

A desktop capability exposes its slot as `capability.slot`. For example, `useClient(WindowControls.capability.slot)` reaches the window main bound to that slot.

For a root managed by Sewed, call `mount` inside `Renderer.run`. If your framework owns the root, connect it as shown below. Hook signatures retain renderer and client requirements; expose native operations and worker computation through bindings.

## Connecting outside React

An application framework that creates its own React root, or a renderer that must also load as a plain web page, connects the document with `connect(entry)` and provides the runtime with `RuntimeProvider`:

```tsx
const store = connect(Renderer.entry(new URL(location.href), { bindings }));

createRoot(element).render(
  <RuntimeProvider store={store}>
    <App />
  </RuntimeProvider>,
);
```

`connect` starts the handshake immediately. Its store reports `connecting`, `ready`, or `unavailable` with a `Cause`. Missing preload, a rejected handshake, or connection closure produces `unavailable`; connecting again is an application decision.

`RuntimeProvider` supplies the store. Hooks below it render their own states while connecting, so you can keep the component tree in place. Use `useRuntimeStatus` when you want a connection indicator or a separate startup screen. Under `mount`, the runtime is already ready.

`store.close()` ends the connection. Page hide closes it too.

Use `store.run(effect, { signal })` for code outside components, such as a route loader or a non-React event handler. It runs the Effect in its own scope over the document's connected runtime, waiting for readiness when needed.

The optional `signal` is an ordinary `AbortSignal`. Aborting it interrupts the work, runs its finalizers, and rejects the promise with the interruption.

If the connection ends while `store.run` is active, it interrupts the work and waits for its scoped finalizers before rejecting with `Closed`. An operation failure or cleanup defect is preserved. Cancellation also works when the effect aborts its own signal or closes the store during synchronous startup. Completed calls remove their runtime subscription.

```ts
const controller = new AbortController();
void store.run(program, { signal: controller.signal });
controller.abort(); // the stream's host finalizers run
```

## The document's store

`connect(entry)` registers the document's runtime store. A route loader or another module can call `documentStore()` to use the same connection as the hooks, without passing the store through every function.

```ts
import { connect, documentStore } from "@sewed/react";

connect(Renderer.entry(new URL(location.href), { bindings }));

// Elsewhere, outside any component:
export const loadProfile = (id: string) => documentStore().run(Profile.load(id));
```

A `RuntimeProvider` without a `store` prop reads `documentStore()` too. Before a connection is registered, the document has a static unavailable store. This lets the module also load on a plain web page.

Calling `connect` again replaces and closes the previous connection. Work using the old store then fails with `Closed`.

The testing adapter's `store(bindings)` temporarily supplies the document store. Hooks and plain module functions can reach the same in-process hosts during a test.

`documentStore()` selects the most recently opened test store that is still open. Closing a store removes that store alone, so nested stores can close in any order. Once all test stores close, the document returns to the connection registered by `connect`.

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

A module-level stream can use `useStream(() => heartbeat, [])`. Put reactive inputs in the hook's dependency list; a separate `useMemo` used only to stabilize a stream is unnecessary.

For projects using [`eslint-plugin-react-hooks`](https://react.dev/reference/eslint-plugin-react-hooks/lints/exhaustive-deps#options), add `useStream` to the `react-hooks/exhaustive-deps` rule's `additionalHooks` expression so the callback and dependency list are checked together. This is optional consumer tooling; the adapter does not add a lint dependency.

## Testing a renderer module

Test a renderer module with in-process hosts using `store` from `@sewed/react/testing`. Supply `Binding.to(slot, host)` entries from `Testing.host`, then render your component under `RuntimeProvider`.

The store is ready immediately. Calls use the real schemas and transport, so the test exercises the contract your Electron application uses.

```tsx
import { Effect, Schema, Scope } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding } from "sewed";
import * as Testing from "sewed/testing";
import { store } from "@sewed/react/testing";
import { RuntimeProvider, useClient } from "@sewed/react";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
);
const Calculator = Binding.slot("calculator", Protocol);
const handlers = Protocol.toLayer({ double: ({ value }) => Effect.succeed(value * 2) });

const scope = await Effect.runPromise(Scope.make());
const host = await Effect.runPromise(
  Testing.host(Protocol, handlers).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
);
const desktop = store([Binding.to(Calculator, host)]);

render(
  <RuntimeProvider store={desktop}>
    <App />
  </RuntimeProvider>,
);
```

Hooks, `store.run`, and functions using `documentStore()` all reach the supplied hosts. This lets a test exercise both component interactions and module-level actions.

Call `desktop.close()` to end its binding connections and publish `unavailable`. Closing it twice is safe. Close the host's own scope separately when the test finishes; in this example, that is `scope`.
