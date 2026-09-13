# Prototype API

Sewed owns Electron resources with Effect scopes and connects process runtimes with Effect RPC. Definitions are inert; `Worker.spawn`, `BrowserWindow.make`, `BaseWindow.make`, and `WebContentsView.make` acquire resources in the main runtime. Native windows attach views through scoped handles; see [native composition](native-views.md).

| Entry point    | Public surface                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sewed`        | `Binding.slot`, `Binding.to`, `Binding.client`, `Binding.deferred`, `Binding.layer`, `Remote`, `Binary`, `Protocol` and `Download` contracts, `Renderer.entry`, `Renderer.run`, `WindowControls.protocol`, `WebContents`, `Permission`, `SessionStorage`, `Screen`, `Dialog`, and `Menu` data schemas, runtime requirement types, `SewedError` |
| `sewed/main`   | `App.run`, `App.activations`, `App.quit`, `App.menuSelections`, `BrowserWindow.make`, `BaseWindow.make`, `WebContentsView.make`, `Session.fromPartition`, `Session.defaultSession`, `Session.setPermissions`, `Session.clearStorage`, `Protocol.handle`, `Download.start`, `Screen` queries and events, `Worker.entry`, `Worker.spawn`, `host` |
| `sewed/worker` | `Worker.define`, `Worker.entry`, `Worker.threadId`                                                                                                                                                                                                                                                                                             |
| `@sewed/react` | `mount`, `useClient`, `useAction`, `useStream`                                                                                                                                                                                                                                                                                                 |

`sewed` also exports `Diagnostics.make`, its event schema, and snapshot types. `sewed/testing` exports `main`, `host`, `layer`, and the native-free `Worker` host API. The separate `@sewed/vite` package exports the development-only `sewed` plugin. See [diagnostics](diagnostics.md), [testing](testing.md), and [development integration](development.md).

`Binding.slot(name, protocol)` is a callable Context service, adapted from Alchemy's binding pattern. `yield* Slot()` and `yield* Binding.client(Slot)` acquire the same typed client. `Binding.to(Slot, owner)` selects the exact running owner. Two windows can bind the same worker and different native window controls.

`Binding.deferred(Slot)` returns an inert client through an Effect requiring `ClientContext`. It opens no connection until a returned operation runs, and each operation retains its scope, schema, middleware and runtime requirements. Framework adapters can construct clients without accessing core transport internals.

`Remote.make({ payload, protocol, error? })` defines a resource acquisition contract. Bind its generated `protocol` to an owner running `Remote.layer(definition, payload => handlerLayer)`. `Remote.acquire(definition, slot, payload)` returns a scoped handle with the original typed `client` and an acknowledged `release` Effect. Each acquisition has its own connection and resource layer. Calls require the original runtime and live lease; closing the caller, document, connection, or owner ends ownership without recreation. See [remote resources](remote-resources.md).

Native operations require `MainContext`. Worker programs may require `WorkerContext`; utility-process programs may require `UtilityContext`. RPC calls require `ClientContext` and `Scope`, plus their protocol's schema and middleware services. `Renderer.run` and React actions accept renderer/client requirements; the compiler rejects main, worker, and utility requirements there. Binding clients also check runtime identity and scope lifetime when called.

`Binding.layer(bindings)` returns a `Layer<ClientContext, SewedError, MainContext>` for main-owned Effects. Provide it with ordinary `Effect.provide`; it supplies client access while preserving the caller's scope and other service requirements. It does not grant main or worker capabilities. A main-owned Effect can call a worker before any renderer exists, and a scoped fork can keep that work alive across renderer reloads.

```ts
const background = Effect.gen(function* () {
  const compute = yield* Compute();
  yield* Stream.runDrain(compute.background());
});

yield *
  background.pipe(Effect.provide(Binding.layer([Binding.to(Compute, worker)])), Effect.forkScoped);
```

Here `Compute` is the playground's binding with a `background` stream, and `worker` is its running owner. Each client connection belongs to both its acquisition scope and the binding environment. Closing either scope closes the connection and fails pending calls. Closing the binding layer invalidates its clients; it does not close the bound workers or main hosts. Other binding layers can keep using those owners.

`Worker.define` and `host` also accept `(implement) => implement(handlers)`, where `implement` is the selected protocol's `toLayer` function. This form names the protocol once and preserves payload inference, streams, middleware, schema services, startup errors, and runtime requirements. Supply additional services with ordinary `Layer.provide` / `Layer.provideMerge` on the returned Layer. The builder runs when its owner is acquired.

```ts
Worker.define(Protocol, (implement) =>
  implement({
    count: ({ n }) => Effect.map(Worker.threadId, (thread) => n + thread),
  }),
);
```

`Worker.define(protocol, handlers)` accepts an ordinary Effect RPC handler Layer and returns an opaque definition. The consumer default-exports it from a separate module. `Worker.spawn(Worker.entry(url, protocol))` loads that module in a real Node worker thread inside the main process. A worker definition is not a Layer that can accidentally be provided to a renderer. When bundling main or worker entries, leave `sewed` external so its worker bootstrap and preload resolve relative to the installed package.

`Worker.define(protocol, handlers, { bindings: [Slot] })` declares worker dependencies and allows the handler Layer to require `ClientContext`. Main selects the instances with `Worker.spawn(entry, { bindings: [Binding.to(Slot, owner)] })`. The worker's clients are available during handler construction. Startup rejects missing, extra, and duplicate dependency keys. Calls can target another worker or a main host; the target keeps its original scope. Cancellation and consumer exit close downstream requests without terminating the dependency. See [worker binding dependencies](worker-bindings.md) for the channel and lifetime contract.

`App.run(setup)` waits for Electron readiness and holds the root scope after setup returns. Quit closes that scope. Window scopes close when their native windows close; closed windows are never recreated. Workers shut down cooperatively when their owning scope closes, with a two-second termination fallback.

`App.activations` is a main-required stream of future Electron activation events, containing `hasVisibleWindows`. Each observer owns its listener and bounded queue; overflow fails that observer with `SewedError` code `Limit`. Events do not replay. `App.quit` is a main-required Effect that requests shutdown through `App.run`, which waits for scoped cleanup before exiting. Applications choose their own window reopening policy. See [application lifecycle](app-lifecycle.md) for subscription, platform, and shutdown semantics.

Window handles expose main-required `show`, `showInactive`, `hide`, and `focus` Effects, plus `setBounds` and `setFullScreen` operations. The same operations are available through each window's explicitly bound controls client. `WindowControls.State` includes native `bounds`, `normalBounds`, and `visible` state alongside focus, minimization, maximization, and fullscreen flags. Its stream replays the current snapshot and retains two pending updates; slow observers can skip superseded states. Hiding preserves the window owner, document, and bindings; closed handles remain closed. See [window visibility and focus](window-controls.md) and [window geometry](window-geometry.md).

`Session.fromPartition({ kind: "memory" | "persistent", name })` acquires an application-lived native session handle in main. Assign it with `BrowserWindow.make({ session })` to select the window's browser state store. Reuse the handle or partition identity to share state; different names or kinds select separate stores. `Session.defaultSession` selects Electron's default, which is also used when the window option is omitted. Closing a scope or window does not erase its session. See [browser session isolation](sessions.md).

`Session.setPermissions(session, policy)` replaces the session's permission rules. Sewed installs both native check and request handlers, initially denying all permissions, including on the default session. Rules grant named permissions to a canonical origin or an exact document URL. Subframes, unknown permissions and mismatched requesting documents remain denied. Rules are copied and replaced atomically after validation; changes affect future requests. See [permission and navigation policy](native-policy.md).

`Session.clearStorage(session, options)` clears explicitly selected storage categories. `{ kind: "origin", origin, storages }` supports origin-scoped browser stores; `{ kind: "session", storages }` also supports cookies and native caches. Origin-scoped cookie clearing is excluded because cookies do not share origin boundaries. No scope finalizer deletes browser data. See [session storage](session-storage.md).

`Protocol.scheme(name, privileges)` is an inert root definition. Pass all schemes to `App.run(program, { schemes })` for registration before readiness. Main's `Protocol.handle(session, scheme, handler)` installs a scoped Effect HTTP handler in that exact session. Main's `Download.start(session, { url, savePath, headers? })` acquires a pending download with `snapshot`, `progress`, `awaitDone`, `pause`, `resume`, and `cancel`. Native download interruptions and terminal outcomes have distinct states. See [session protocols and downloads](session-resources.md).

`Screen.displays`, `Screen.primary`, `Screen.cursor`, `Screen.nearest(point)`, and `Screen.matching(bounds)` are main-required native queries. `Screen.changes` is a scoped stream of display additions, removals, and metric changes. Each observer owns its listeners and a bounded event queue; overflow fails with `SewedError` code `Limit`. Queries and subscriptions do not grant ownership over system displays. Applications expose selected operations through ordinary `host` protocols using the inert screen schemas. See [displays and screen coordinates](screen.md).

Each renderer document's IPC connection is tied to its window and exact loaded URL. Reload, navigation, process loss, and window closure disconnect its clients. Messages use a narrow sandboxed preload, checked envelopes, and Effect's RPC payload and result schemas. Exited worker instances are never silently replaced or replayed.

`window.dialog.message(options)` is a main-required Effect for native message boxes. It validates options, supplies the request's abort signal, and ends pending requests when the parent closes. Competing native dialogs fail with `Limit` until the active native promise settles. The root `Dialog.MessageOptions` and `Dialog.MessageResult` schemas support application-defined protocols; window controls do not implicitly grant dialog access. See [native message dialogs](dialogs.md).

`window.dialog.open(options)` selects files or directories in an explicit mode. `window.dialog.save(options)` selects a destination without writing a file. Both retain `MainContext` and return selected-or-canceled results through the root `Dialog` schemas. File pickers have no native abort operation: interruption ends the request while the picker may remain open. Message, open, and save dialogs share one presentation slot until the native promise settles. See [native file pickers](file-dialogs.md).

`window.menu.popup(options)` is a main-required Effect that returns a native command, checkbox, or radio selection, or dismissal. Menu trees are validated data; callbacks and the parent stay in main. Competing popups fail with `Limit` until the active native popup completes or its parent closes. Request interruption dismisses its popup, and parent closure ends pending requests. Applications expose selected menus through ordinary hosts and explicit bindings using `Menu.PopupResult`. See [native context menus](context-menus.md).

`App.run(setup, { menu })` installs an application menu after readiness and before setup, using the inert `Menu.ApplicationOptions` schema. `App.menuSelections` is a main-required stream of future custom selections. Each observer owns its bounded queue; completion or interruption leaves the application-owned menu intact. Native roles use Electron's built-in behavior and emit no custom selection. See [application menus](application-menus.md).

`window.webContents.state` is a main-required stream of `WebContents.State` snapshots: `idle`, `loading`, `ready`, `failed`, or `gone`. It replays the current state to each observer and completes when its owner closes. Ready reports Electron's document load completion and OS renderer process ID. It does not imply React or RPC client readiness. The separate `responsiveness` stream reports native `unknown`, `responsive`, or `unresponsive` observations. Main can explicitly `recover` a stalled process or `reload` a document without replacing its native window or worker bindings. See [web contents lifecycle](webcontents-lifecycle.md).

`window.webContents.setNavigationPolicy(policy)` sets allowed top-level destinations and redirects. The explicitly loaded entry document and fragment navigation remain allowed. Unsolicited renderer-created windows are denied. Allowing a destination does not grant it the old document's IPC bindings; main must explicitly load and bind its renderer entry. See [permission and navigation policy](native-policy.md).

React components stay ordinary components. The separate `@sewed/react` package owns mounting and hooks; the core has no React dependency or `sewed/react` export. `useClient` constructs inert calls. `useAction(factory, { mode: "latest" | "exhaust" })` starts an invocation on `run(...)`. Success retains the invocation scope until the next accepted run, cancellation, or unmount. Failure closes it. `useStream(factory, dependencies)` starts work on subscription, preserves it across ordinary rerenders, and releases it on dependency replacement or unmount. `useResource(factory, dependencies)` acquires a scoped value after commit and waits for its cleanup before replacement; `release()` ends its lifetime and `reload()` explicitly replaces or retries it. Cleanup failures are surfaced rather than automatically retried. Include every captured reactive value in the dependency list; callers do not memoize stream values themselves. The adapter uses neither `useEffect` nor `useLayoutEffect`. See the `@sewed/react` README for hook usage and migration examples.

Window loading and renderer startup report missing, unexpected and duplicate binding keys in their `Protocol` errors. Handshake rejection retains `Startup`; rejection while opening a binding retains `Closed`. Invalid responses at either boundary remain `Protocol` failures. See [getting started and troubleshooting](getting-started.md).

Ordinary RPC messages are limited to 256 KiB per serialized envelope. Sewed splits stream batches into ordered messages, counting UTF-8 bytes and JSON overhead, and waits for acknowledgments between fragments. Handlers and forwarding streams need no manual rechunking. Each individual value must still fit. Oversized response values and handler defects fail their request while other requests, the client and its owner remain usable. See [stream transport and request failures](transport.md).

`Binary.protocol(group)` opts a binding into byte transport. Use `Binary.Bytes` for byte fields and `Binary.chunks(source)` to produce at most 64 KiB per value. Renderer traffic crosses a private MessagePort retained in preload. The client has bounded response queues per request, so a stalled stream does not block another call's response or resource release. See [binary streams](binary-streams.md). The external playground's `pnpm benchmark:transport` measures ordinary RPC paths; `pnpm verify:binary` checks bulk bytes, backpressure, and cancellation across main, workers, utilities, and relays.

Effect requirements track capabilities, not computational cost. Arbitrary synchronous code in a React callback or `Effect.map` still runs locally. Fibers do not move that code to a worker. Cancelling a CPU-bound request cannot interrupt its JavaScript loop; stale React results are suppressed while the worker becomes interruptible again.

`Utility.define`, `entry`, and `processId` live in `sewed/utility`. Main's `Utility.spawn` starts an Electron utility process and returns an explicit binding owner with `processId`, `shutdown`, `terminate`, and `awaitExit`. It uses the same schema/RPC contracts and cancellation rules as workers, with a distinct capability and Electron port transport. Dependencies retain their own owners. See [utility processes](utility-processes.md).

`App.run(program, { singleInstance: {} })` opts into single-instance launch routing. `App.launches` has one ordered, bounded consumer and retains events captured before readiness. `App.guardQuit(decision)` and `window.guardClose(decision)` preserve decision requirements, coalesce pending requests, and wait for decision cleanup. See [application lifecycle](app-lifecycle.md).

`Tray.make(options)` and `GlobalShortcut.register(accelerator)` acquire scoped native resources in main. Their streams have independent bounded observers, finish on owner closure, and report late access as `Closed`. Tray menus reuse `Menu.Selection`; applications can bind selected operations through ordinary hosts. See [desktop resources](desktop-resources.md).

`window.webContents.openDevTools(options)` and `closeDevTools` require main and control Electron's ordinary Chromium DevTools. The separate optional `@sewed/devtools` package provides headless diagnostic snapshots and Effect tracing. It creates no UI and has no React dependency.
