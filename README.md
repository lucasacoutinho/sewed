# Sewed

Electron apps as Effects. An experimental library forked from [Alchemy](https://github.com/alchemy-run/alchemy).

Sewed combines Alchemy's callable service bindings and scoped runtime composition with Electron's process model. Main owns windows and desktop resources, workers and utility processes own computation, and renderer clients call explicitly bound owners through Effect RPC. React components stay ordinary React components.

React integration lives in the separate `@sewed/react` package. It exports `mount`, `useClient`, `useAction`, `useStream`, and `useResource`, with subscription lifetimes connected through `useSyncExternalStore`. `useResource` acquires after commit and awaits cleanup before replacement. Core has no React dependency.

`@sewed/vite` adds staged Electron compilation and serial restarts to a normal Vite development server. Renderer edits keep React Fast Refresh; a failed main or worker compilation leaves the running application available. See [development integration](docs/development.md).

`Diagnostics.make` records binding targets, runtime placement, active requests and closure reasons, with bounded metadata history and Effect tracing attributes. `sewed/testing` exposes scoped in-process hosts and actual Node workers through public imports. See [diagnostics](docs/diagnostics.md) and [testing](docs/testing.md).

`@sewed/devtools` adds scoped diagnostic snapshots for owners, request outcomes, resource lifetimes, sampled stream wire counters, and Effect spans. It has no UI and preserves the current Effect tracer. See the [DevTools package](docs/devtools.md).

`Remote.make` defines a resource that a client acquires through an explicit binding. Its handle exposes typed methods and an acknowledged release Effect. Caller scope closure, connection loss, and owner exit end the lease. See [remote resources](docs/remote-resources.md).

`Binary.protocol` and `Binary.Bytes` carry native byte arrays through the same binding model. `Binary.chunks` splits byte sources for bounded, acknowledged streaming over private MessagePorts. See [binary streams](docs/binary-streams.md).

`Tray.make` and `GlobalShortcut.register` own native registrations in main scopes, with typed failures and bounded event streams. See [desktop resources](docs/desktop-resources.md). `Utility.define` and `Utility.spawn` use a distinct Electron utility process with explicit bindings and `UtilityContext`; see [utility processes](docs/utility-processes.md).

Start with the [application walkthrough](docs/getting-started.md) for the minimum wiring, React stream usage, and startup diagnostics. The playground's session readouts and background instrumentation are optional application code.

```ts
const setup = Effect.gen(function* () {
  const compute = yield* Worker.spawn(Worker.entry(workerUrl, ComputeProtocol));
  const window = yield* BrowserWindow.make({ title: "Sewed" });
  yield* window.webContents.load(View, {
    bindings: [Binding.to(Controls, window.controls), Binding.to(Compute, compute)],
  });
});

App.run(setup);
```

Main-owned Effects can consume bindings through `Effect.provide(Binding.layer(bindings))`. Their work can start before windows open and survive renderer reloads. The layer owns client connections; worker and window lifetimes remain with the scopes that acquired them.

Workers declare dependencies with `Worker.define(protocol, handlers, { bindings: [Slot] })`. Main supplies explicit owners through `Worker.spawn(entry, { bindings: [Binding.to(Slot, owner)] })`, and a typed entry makes that list a compile-time check. Clients are installed before handler startup; cancellation and worker exit release downstream requests. See [worker dependencies](docs/worker-bindings.md).

Stream batches are split into messages that fit the transport's byte limit, with acknowledgments between fragments. Forwarding handlers use ordinary streams. Oversized individual values and handler defects fail their request while other calls and the selected owner remain usable. See [stream transport](docs/transport.md).

`window.webContents.state` observes document loading, failures, and process loss; `responsiveness` separately observes native renderer stalls. Main can explicitly `recover` a stalled renderer, awaiting its termination before reloading. Recovery preserves the native window and may affect other documents sharing that renderer process. See [web contents lifecycle](docs/webcontents-lifecycle.md).

`BaseWindow.make`, `WebContentsView.make`, and `window.attach` compose multiple renderer documents inside one native window. Each view has its own bindings and secure WebContents adapter. Attachments are scoped; detach before moving a view to another window. See [native view composition](docs/native-views.md).

`App.launches` retains startup files, URLs, and second-instance requests. `App.guardQuit` and `window.guardClose` support scoped asynchronous admission, while `App.activations` and `App.quit` handle activation and normal shutdown. Applications decide when to open a new window after an old one closes. See [application lifecycle](docs/app-lifecycle.md).

Window handles and bound controls support `show`, `showInactive`, `hide`, and `focus`. Their state stream reports native visibility and focus; hiding a window preserves its owner and bindings. See [window controls](docs/window-controls.md).

`setBounds` and `setFullScreen` request native geometry changes. Window state includes the actual `bounds` and the `normalBounds` used when restoring from maximized or fullscreen mode. See [window geometry](docs/window-geometry.md).

`Session.fromPartition({ kind, name })` acquires a memory or persistent browser session in main. Pass the handle to `BrowserWindow.make({ session })` to choose which windows share cookies and origin storage. Session state survives window closure; memory profiles end with the application. See [browser session isolation](docs/sessions.md).

`Session.setPermissions` assigns explicit permission rules; ungranted browser permissions are denied. `window.webContents.setNavigationPolicy` selects allowed navigation destinations without granting RPC bindings. Renderer-created native popups are denied. See [native browser policy](docs/native-policy.md).

`Session.clearStorage` clears selected browser stores in one session or origin. Clearing is explicit and does not follow window or scope closure. See [session storage](docs/session-storage.md).

`Protocol.scheme` declares a custom scheme before application readiness. Main installs scoped Effect HTTP handlers in a chosen session, and `Download.start` owns a session download with progress and pause/resume/cancel operations. See [session protocols and downloads](docs/session-resources.md).

`Screen.displays`, `Screen.primary`, `Screen.cursor`, `Screen.nearest`, and `Screen.matching` query native display information in main. `Screen.changes` observes display addition, removal, and metric changes with scoped listeners. Applications expose selected queries through ordinary hosts and bindings. See [displays and screen coordinates](docs/screen.md).

`window.dialog.message` displays a native message box on its selected parent. Request interruption forwards an abort signal; closing the parent ends pending requests. Applications expose chosen prompts through ordinary hosts and bindings. See [native message dialogs](docs/dialogs.md).

`window.dialog.open` selects files or directories, and `window.dialog.save` selects a destination path. Results distinguish selection from user cancellation. File pickers have no native abort operation: interruption ends the request while the picker may remain open, and competing dialogs fail with `Limit` until it settles. See [native file pickers](docs/file-dialogs.md).

`window.menu.popup` displays a native context menu and returns the selected command, checkbox, radio item, or dismissal. Menu definitions are data; the parent and native callbacks remain in main. Cancellation dismisses the request's popup. See [native context menus](docs/context-menus.md).

`App.run(setup, { menu })` installs an application-owned native menu with custom commands, accelerators, checkboxes, radio items, and native roles. `App.menuSelections` observes future custom selections in main; stopping an observer preserves the menu. See [application menus](docs/application-menus.md).

The library lives in `packages/sewed`. The separate consumer at `../sewed-playground` exercises the public package in Electron. See [the API and lifecycle contract](docs/api.md), the generated [API reference](docs/reference.md), [binding composition](docs/binding-composition.md), and [upstream provenance](docs/upstream.md).

```sh
pnpm install
pnpm build
pnpm test
```

Requires Node 24, the pinned Effect `4.0.0-rc.112`, and Electron. This prototype targets the installed Electron 44 release. Its API is experimental.

Capability requirements catch main/renderer/worker wiring mistakes. They cannot detect arbitrary expensive JavaScript in a renderer. Move CPU work into a worker definition to obtain an actual execution boundary.

The upstream Git snapshot, Apache-2.0 license, and attribution notices are retained. Cloud providers, deployment reconciliation, state stores, cloud CLI, website, and cloud examples were removed. No cloud lifecycle operations are performed by this fork.
