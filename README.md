# Sewed

Electron applications as Effects. Main owns windows and native resources, workers and utility processes own computation, and renderers call the owners they were explicitly given through typed, schema-validated bindings. Every Electron surface is an Effect resource with a scope, a schema at the boundary, and a `SewedError` with a code.

Sewed is an experimental prototype. It targets Electron 44 and Effect `4.0.0-rc.112`, and it is verified on Linux; macOS and Windows behavior is typed and gated but not yet exercised.

## What you get

- **Explicit ownership.** `App.run` holds the application scope; windows, views, workers, sessions, trays, shortcuts, updaters, and every other native resource are acquired in a scope and released with it.
- **Typed bindings.** A renderer, worker, or utility process only reaches the owners main bound to it. Slots are declared in shared code, entries carry their declared slots in their types, and mismatches fail at compile time or at startup with `Protocol`.
- **Policies as data.** Permissions, navigation, cookies, request interception, certificates, and clipboard access are schemas main installs; renderers never see a native object or a callback.
- **A fixed security posture.** Sandbox, context isolation, no Node integration, a private preload bridge, deny-by-default permissions and navigation.
- **React without a framework.** `@sewed/react` exposes clients, actions, streams, and scoped resources through `useSyncExternalStore`; components stay ordinary components.

## Packages

| Package           | Purpose                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sewed`           | Core: contracts, bindings, and the `sewed/main`, `sewed/worker`, `sewed/utility`, and `sewed/testing` entry points |
| `@sewed/react`    | `mount`, `useClient`, `useAction`, `useStream`, and `useResource`                                                  |
| `@sewed/vite`     | Vite development integration with Electron restarts and React Fast Refresh                                         |
| `@sewed/devtools` | Scoped diagnostic snapshots and Effect tracing, no UI                                                              |
| `@sewed/forge`    | Electron Forge configuration, the updater, and crash reporting                                                     |
| `create-sewed`    | Scaffold with one worker, one window, a hosted theme owner, and the Vite integration                               |

## Quick start

The packages are not published yet. Scaffold from this repository and point the generated dependencies at packed tarballs:

```sh
pnpm install
pnpm build
node packages/create/bin/create-sewed.mjs ../my-app
```

The generated main entry is the whole wiring:

```ts
App.run(
  Effect.gen(function* () {
    const clock = yield* Worker.spawn(Worker.entry(workerUrl, ClockProtocol, { bindings: [] }));
    const theme = yield* NativeTheme.host({ allowSetSource: true });
    const window = yield* BrowserWindow.make({ title: "Sewed", width: 960, height: 640 });
    yield* window.webContents.load(Renderer.entry(url, { bindings }), {
      bindings: [
        Binding.to(Clock, clock),
        Binding.to(Controls, window.controls),
        Binding.to(Theme, theme),
      ],
    });
  }),
);
```

And the renderer consumes exactly those owners:

```tsx
const clock = useClient(Clock);
const ticks = useStream(() => clock.ticks(), [clock]);
const theme = useClient(Theme);
const setTheme = useAction((source: "light" | "dark") => theme.setSource({ source }));
```

Read the [application walkthrough](docs/getting-started.md) for the reasoning behind each file.

## How it fits together

- **Runtimes.** `MainContext`, `RendererContext`, `WorkerContext`, and `UtilityContext` are capability requirements. A main-only operation cannot compile inside a renderer, and a renderer client cannot compile inside main. See [the API and lifecycle contract](docs/api.md).
- **Owners and bindings.** Anything that serves a protocol is an owner: a worker, a utility process, a window's controls, a hosted desktop surface, or a `host` you write. `Binding.to(slot, owner)` hands it to an entry; `Binding.layer` provides clients to main-side code. See [binding composition](docs/binding-composition.md) and [worker dependencies](docs/worker-bindings.md).
- **Transport.** Effect RPC over private MessagePorts with bounded fragments, acknowledgments, and per-owner connection limits; binary protocols carry bytes. See [stream transport](docs/transport.md) and [binary streams](docs/binary-streams.md).
- **Errors.** One `SewedError` with codes `Startup`, `Protocol`, `Native`, `Closed`, and `Limit`, with the native cause retained.

## Coverage

The [Electron coverage plan](docs/electron-coverage.md) records how every Electron module maps onto these shapes and the status of each wave. The guides, by area:

- Windows and documents: [window controls](docs/window-controls.md), [window geometry](docs/window-geometry.md), [web contents lifecycle](docs/webcontents-lifecycle.md), [native view composition](docs/native-views.md), [dialogs](docs/dialogs.md), [file pickers](docs/file-dialogs.md), [context menus](docs/context-menus.md), [application menus](docs/application-menus.md).
- Sessions: [session isolation](docs/sessions.md), [permissions and navigation](docs/native-policy.md), [session storage](docs/session-storage.md), [protocols and downloads](docs/session-resources.md), [cookies, interception, and settings](docs/session-extras.md).
- Application and desktop: [application lifecycle](docs/app-lifecycle.md), [desktop resources](docs/desktop-resources.md), [desktop surfaces](docs/desktop-surfaces.md), [platform-specific surfaces](docs/platform-surfaces.md), [displays](docs/screen.md), [operations](docs/operations.md).
- Processes and data: [utility processes](docs/utility-processes.md), [remote resources](docs/remote-resources.md), [diagnostics](docs/diagnostics.md), [DevTools](docs/devtools.md), [testing](docs/testing.md), [development integration](docs/development.md), [Electron Forge bindings](docs/forge.md).
- The generated [API reference](docs/reference.md) lists every export.

## Development

```sh
pnpm install
pnpm build
pnpm test
```

`pnpm test` builds, checks the generated reference, type-checks every package's contract tests, and runs the unit tests. Native behavior is verified by a separate consumer, the playground application, whose fixtures run in one isolated X display session:

```sh
cd ../sewed-playground
pnpm ui-tools
SEWED_XVFB_TIMEOUT=3600 SEWED_XVFB=$PWD/.artifacts/ui-tools/xvfb.sh SEWED_WINDOW_MANAGER=$PWD/.artifacts/ui-tools/openbox.sh \
  python3 scripts/with-xvfb.py dbus-run-session -- pnpm verify:all
```

Requires Node 24 or later and pnpm 11. The guidelines for changing the library are in [AGENTS.md](AGENTS.md).

## Status and limits

Capability requirements catch wiring mistakes; they cannot detect expensive JavaScript in a renderer, so CPU work belongs in a worker definition. Script injection into renderers, request bodies in interception, a display media picker of the library's own, the `webview` tag, and raw IPC are excluded by design. The updater, crash reporting, and the platform-specific surfaces need runs on macOS and Windows before they can be trusted there.

## License

Apache-2.0. Sewed's binding and runtime foundations derive from [Alchemy](https://github.com/alchemy-run/alchemy), Copyright 2026 Functionless Corp., under the same license; see [NOTICE](NOTICE), [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md), and [origin](docs/upstream.md).
