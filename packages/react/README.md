# @sewed/react

React bindings for Sewed. The core `sewed` package owns Electron resources, runtime requirements and RPC. This package owns React mounting and subscriptions.

Import `mount`, `connect`, `documentStore`, `RuntimeProvider`, `useRuntimeStatus`, `useClient`, `useAction`, `useStream` and `useResource` from `@sewed/react`. Components remain ordinary React components. The adapter uses `useSyncExternalStore`; it contains no `useEffect` or `useLayoutEffect` calls.

Every hook works unconditionally, connecting or not: there is no gate to render, and no seam between a desktop build and a plain web page. A tree rendered with no `RuntimeProvider` and not under `mount` sees a static `unavailable` store: every hook answers `failure` with a `Closed` cause silently, rather than throwing.

```tsx
function Status() {
  const session = useClient(Session); // stable; calls wait or fail Closed
  const owners = useStream(() => session.changes(), [session]);
  if (owners.status === "loading") return <Spinner />;
  if (owners.status === "failure") return <Offline cause={owners.cause} />;
  return <Owners value={owners.value} />;
}
```

`useStream` and `useResource` answer `loading` while the runtime is connecting and `failure` with a `Closed` `SewedError` cause once it is unavailable — except a stream or action already live at the moment the store turns unavailable, which instead ends with a bare interruption (the connection's own failure), not a `Closed` cause; this is a known gap. `useAction` answers `idle`, and its `run` starts a `running` invocation that proceeds once the runtime is ready or fails `Closed`. `useClient` returns one client whose every call waits or fails `Closed` the same way; the returned object's identity does not change across connecting, ready or unavailable, so it stays a stable dependency for the other hooks. Every hook's failure type widens to include `SewedError`, because the hook itself can fail for want of a runtime, independent of whatever its own factory declares. When the runtime becomes ready, the waiting work starts for real: no hook remounts and the hook count never changes.

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
```

`connect` starts the handshake immediately and returns an external store whose snapshot is `connecting`, `ready`, or `unavailable` with its `Cause`. A page loaded without the Sewed preload, a rejected handshake, and a closed connection all end `unavailable`; nothing retries. `RuntimeProvider` provides the store alone. No hook below it needs to be gated on `useRuntimeStatus` first — every hook memoizes on the store itself, which is stable across all three states, and answers its own `loading`/`idle`/`failure` state while the store is not yet ready. `useRuntimeStatus` remains for a tree that wants to render nothing at all until the runtime is ready. Under `mount` the status is always `ready`. `store.close()` ends the connection, and page hide ends it on its own.

Plain code outside a component — a module that sends a command, or code invoked from a non-React event — calls `store.run(effect, { signal })`. It runs the effect with the connected runtime in its own scope, waits while the store is `connecting`, and rejects with a `Closed` `SewedError` that carries the cause when the runtime is unavailable. It shares the document's one connection with the hooks, because Sewed replaces a document's connection at each handshake. `signal` is the web's own `AbortSignal`, the same handle a consumer would otherwise bridge by hand: aborting it interrupts the fiber `run` started, the effect's own finalizers run, and the returned promise rejects with the interruption.

```ts
const controller = new AbortController();
void store.run(program, { signal: controller.signal });
controller.abort(); // the stream's host finalizers run
```

## The document's store

A document has one runtime connection, and `connect` registers it: calling `connect(entry)` makes the returned store `documentStore()`'s answer from then on, so plain code that has no store to pass — a route loader, an `async` function no component calls — reaches the same connection the hooks do by calling `documentStore()` directly instead of threading a store through by hand. The name is deliberate: a renderer module also has the DOM's own global `document`, and `documentStore` never shadows it.

```ts
import { connect, documentStore } from "@sewed/react";

connect(Renderer.entry(new URL(location.href), { bindings }));

// Elsewhere, outside any component:
export const loadProfile = (id: string) => documentStore().run(Profile.load(id));
```

`RuntimeProvider` reads `documentStore()` when it is given no `store` prop, so a tree mounted under it sees the same connection this module-level code does, with no prop drilled down to reach it. A page with no Sewed preload still gets a store — the static `unavailable` one `documentStore()` answers before anything ever connects, which is what a plain web page is. A second `connect` call in one document replaces the first and closes it, because a document has one connection; the first store's `run` then rejects `Closed`.

`@sewed/react/testing`'s `store(bindings)` stands itself in for the document's store for as long as it stays open: a renderer module's own test can render a tree with `store(bindings)` under `RuntimeProvider` and also call the module's plain, no-store functions, and both reach the same in-process store. `documentStore()` always answers the most recently opened stand-in that has not yet closed, so nested `store` calls may close in any order: `close()` removes exactly the store it belongs to, wherever it sits, and never disturbs one that opened before or after it. Once every stand-in has closed, `documentStore()` reaches whatever `connect` registered — even a connection that arrived while a stand-in was still open.

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

## Testing a renderer module

`@sewed/react/testing`'s `store(bindings)` builds a `RuntimeStore` over in-process hosts, so a renderer module's own test drives the same hooks this package exports with no separate seam: a component under `RuntimeProvider` sees the same store shape `connect` builds from a live document. `bindings` is `Binding.to(slot, host)` over a `Testing.host` (from `sewed/testing`), dispatched through the real schema and transport — the same proof `Testing.layer` gives a plain Node test. There is no handshake to wait for, so the store answers `ready` at once.

```tsx
import { Effect, Schema, Scope } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
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

`store.run` and every hook run over the store's context exactly as `connect`'s does; a call an action, a resource or a direct `store.run` makes reaches the host for real, over the real schema and transport. `store(bindings)` also stands itself in for `documentStore()` while it stays open, so a renderer module's plain, no-store functions reach it too — see [The document's store](#the-documents-store). `close()` closes the scope the bindings' own connections live in, publishes `unavailable`, and removes this store from the stand-ins over `documentStore()`, wherever it sits among them, so a test can prove a component observes disconnection too — closing stand-ins out of order, or closing one twice, leaves the rest exactly as they were. The host's own services live in whatever scope `Testing.host` was built in — here, `scope` — and are released the same way any other `Testing.host` use releases them, by closing that scope.
