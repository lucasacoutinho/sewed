# Sewed

Sewed helps you build Electron applications with Effect. Create windows and workers in main, give each renderer the clients it needs, and let scopes handle cleanup.

Your application uses typed contracts to connect those parts. Calls run in the owner you selected, and schemas check the data that crosses runtime boundaries.

Sewed is an experimental prototype for Electron and Effect. Native behavior is verified on Linux. macOS and Windows have typed APIs and platform checks; native verification on those systems is still pending.

## What you get

- **Scoped resources.** `App.run` owns application work. Windows, sessions, workers, trays, and other resources are acquired in scopes and released when their scopes end.
- **Typed clients.** Declare a slot in shared code, then bind it to a running owner. The client keeps its payloads, results, errors, and streams in the type system.
- **Composable native decisions.** Features can contribute rules for closing a window, navigating a page, or using the camera. [The decision model](docs/native-policy.md) explains how their answers combine.
- **Policies you can test.** Describe permissions, navigation, certificates, cookies, and clipboard access as data, then exercise them through the same contracts in Node tests.
- **Renderer isolation.** Renderers use a private preload bridge with sandboxing, context isolation, and Node integration disabled. Main grants permission and navigation access explicitly.
- **Ordinary React components.** `@sewed/react` provides clients, actions, streams, and scoped resources through external-store subscriptions.

## Packages

| Package           | Purpose                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sewed`           | Core: contracts, bindings, and the `sewed/main`, `sewed/worker`, `sewed/utility`, and `sewed/testing` entry points |
| `@sewed/react`    | `mount`, `useClient`, `useAction`, `useStream`, and `useResource`                                                  |
| `@sewed/vite`     | Vite development integration with Electron restarts and React Fast Refresh                                         |
| `@sewed/devtools` | Scoped diagnostic snapshots and Effect tracing, no UI                                                              |
| `@sewed/forge`    | Electron Forge configuration, the updater, and crash reporting                                                     |
| `create-sewed`    | Scaffold with one worker, one window, a served theme capability, and the Vite integration                          |

## Quick start

The packages are not published yet. Pack the workspace, then scaffold an app that uses those local artifacts:

```sh
pnpm install
pnpm release:pack
node packages/create/bin/create-sewed.mjs ../my-app --local-packages .artifacts
pnpm --dir ../my-app install
pnpm --dir ../my-app dev
```

`--local-packages` selects the matching-version Sewed tarballs before creating the project. No dependency edits are needed. Keep that directory available for later installs; the generated dependencies use absolute `file:` paths.

The generated main entry connects the worker, native capabilities, and window:

```ts
App.run(
  [],
  Effect.gen(function* () {
    const clock = yield* Worker.spawn(Worker.entry(workerUrl, ClockProtocol, { bindings: [] }));
    const theme = yield* Capability.serve(NativeTheme.capability).pipe(
      Effect.provide(NativeTheme.native({ allowSetSource: true })),
    );
    const window = yield* BrowserWindow.make({ title: "Sewed", width: 960, height: 640 });
    const controls = yield* Capability.serve(WindowControls.capability).pipe(
      Effect.provide(WindowControls.native(window)),
    );
    yield* window.webContents.load(Renderer.entry(url, { bindings }), {
      bindings: [
        Binding.to(Clock, clock),
        Binding.to(Controls, controls),
        Binding.to(Theme, theme),
      ],
    });
  }),
);
```

In the renderer, hooks turn those clients into actions and live values:

```tsx
const clock = useClient(Clock);
const ticks = useStream(() => clock.ticks(), [clock]);
const theme = useClient(Theme);
const setTheme = useAction((source: "light" | "dark") => theme.setSource({ source }));
```

Follow the [application walkthrough](docs/getting-started.md) to see how the files work together.

## How it fits together

Main creates native resources and chooses which running owners a renderer, worker, or utility process can call. `Binding.to(slot, owner)` supplies that choice. Use `Binding.layer` for clients in main, or declare dependencies on the entry for another runtime. See [binding composition](docs/binding-composition.md) and [worker dependencies](docs/worker-bindings.md).

A desktop capability has a `native` layer for main, a `client` layer for bound calls, and, for ambient surfaces, a `memory` layer for tests. `Capability.serve` makes the provided implementation available as an owner. The [API guide](docs/api.md) describes those shapes and their lifetimes.

Runtime requirements such as `MainContext` and `WorkerContext` keep operations in the code that owns them. A renderer calls a worker through its client; the worker performs the computation. The transport uses Effect RPC over private MessagePorts, with bounded messages and backpressure. See [stream transport](docs/transport.md) and [binary streams](docs/binary-streams.md).

Failures use `SewedError` codes `Startup`, `Protocol`, `Native`, `Closed`, `Limit`, and `Unknown`, retaining their original causes. `Unknown` means the request may have executed without a usable reply; do not automatically retry a side-effecting operation. Handle recovery where your application can decide whether repeating that operation is safe.

## Coverage

The [Electron coverage plan](docs/electron-coverage.md) records how every Electron module maps onto these shapes and how the work was ordered; [CHANGELOG.md](CHANGELOG.md) records what each wave added. The guides, by area:

- Concepts: [the decision model](docs/native-policy.md), [binding composition](docs/binding-composition.md), [worker dependencies](docs/worker-bindings.md).
- Windows and documents: [window controls](docs/window-controls.md), [window geometry](docs/window-geometry.md), [web contents lifecycle](docs/webcontents-lifecycle.md), [native view composition](docs/native-views.md), [guest views](docs/guest-views.md), [dialogs](docs/dialogs.md), [file pickers](docs/file-dialogs.md), [context menus](docs/context-menus.md), [application menus](docs/application-menus.md).
- Sessions: [session isolation](docs/sessions.md), [session storage](docs/session-storage.md), [protocols and downloads](docs/session-resources.md), [cookies, interception, and settings](docs/session-extras.md).
- Application and desktop: [application lifecycle](docs/app-lifecycle.md), [desktop resources](docs/desktop-resources.md), [desktop surfaces](docs/desktop-surfaces.md), [platform-specific surfaces](docs/platform-surfaces.md), [displays](docs/screen.md), [operations](docs/operations.md).
- Processes and data: [utility processes](docs/utility-processes.md), [remote resources](docs/remote-resources.md), [diagnostics](docs/diagnostics.md), [DevTools](docs/devtools.md), [testing](docs/testing.md), [development integration](docs/development.md), [Electron Forge bindings](docs/forge.md).
- The generated [API reference](docs/reference.md) lists every export.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm format:check
pnpm website:build
pnpm check:consumer
```

`pnpm test` builds, checks the generated reference, type-checks the package contracts and workspace commands, and runs the unit tests.
`pnpm check:consumer` packs the workspace, checks every public export and executable in all six tarballs, and compares their notices and packaged guides with the repository sources.

It uses the packed `create-sewed` CLI to scaffold a fresh app in an OS temporary directory and installs every Sewed library from those tarballs. The app must also pass a clean reinstall from its frozen lockfile without changing that file.

The command resolves all public entries, imports the entries compatible with Node, and type-checks every typed entry before building the app. It removes the temporary directory on success and retains it on failure. Native entry behavior is covered by the external Electron consumer.

Separate consumers exercise a real Node worker, the standalone Vite helper, and headless DevTools using only the dependencies each needs.

Native behavior is verified by a separate consumer, the playground application, whose fixtures run in one isolated X display session:

```sh
cd ../sewed-playground
pnpm ui-tools
SEWED_XVFB_TIMEOUT=3600 SEWED_XVFB=$PWD/.artifacts/ui-tools/xvfb.sh SEWED_WINDOW_MANAGER=$PWD/.artifacts/ui-tools/openbox.sh \
  python3 scripts/with-xvfb.py dbus-run-session -- pnpm verify:all
```

`pnpm install` patches the workspace's TypeScript with the [Effect language service](https://github.com/Effect-TS/tsgo) (`@effect/tsgo`), so `tsc` reports Effect diagnostics next to type errors: a floating Effect in `src` is an error, and warnings fail the build. The plugin is configured in `tsconfig.base.json`. Sewed is built on Effect's RPC, HTTP and DevTools modules, which Effect still marks unstable, so those three are allowed there; the type-contract files under `test` write unrun and mistyped Effects on purpose and are exempt from the rules that would flag them. Point your editor's TypeScript server at `pnpm exec effect-tsgo get-exe-path` to see the same diagnostics and quick fixes while editing.

Requires Node 24 or later and pnpm 11. `pnpm build` rebuilds every package so declaration output and the API reference agree between fresh and previously built checkouts. `pnpm docs:reference` rebuilds, then prepares and formats the new reference before replacing the current guide. The guidelines for changing the library are in [AGENTS.md](AGENTS.md).

### Releases

Every package shares one version, and the sibling pins inside the manifests follow it. `node scripts/release.mjs version <version>` sets all of them. To move every Effect dependency and peer pin, including the scaffold, run `node scripts/release.mjs effect <version>`.

Both commands validate the input and every manifest before changing files, then write the manifests in place. If a write fails partway, `git checkout` restores the manifests.

`node scripts/release.mjs check` (part of `pnpm test`, after the build) checks version pins, public artifacts, compiler output, and attribution copies. `pnpm release:pack` checks pins, builds, checks artifacts, and produces tarballs locally under `.artifacts/`. Pushing a tag named `v` plus the shared version runs tests, formatting, the website build, and the packed consumer check before attaching those tarballs to a GitHub release. Manual reruns use the selected tag's concurrency group.

### Website

The `website` workspace builds the landing page and the documentation site from this repository's `docs/` directory. `pnpm website:dev` starts it locally, and `pnpm website:build` writes a static site to `website/dist`; see [its README](website/README.md).

## Status and limits

Capability requirements catch wiring mistakes; they cannot detect expensive JavaScript in a renderer, so CPU work belongs in a worker definition. Sewed renderers never receive script injection; guest views expose fenced automation declared at creation. Request bodies reach interception only through an opt-in, byte-capped filter. A display media picker of the library's own and raw IPC are excluded by design. The `webview` tag is off unless the application opts in, and an allowed webview is an owned handle with a guest view's gates. The updater, crash reporting, and the platform-specific surfaces need runs on macOS and Windows before they can be trusted there.

## License

Apache-2.0. Sewed's binding and runtime foundations derive from [Alchemy](https://github.com/alchemy-run/alchemy), Copyright 2026 Functionless Corp., under the same license; see [NOTICE](NOTICE), [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md), and [origin](docs/upstream.md).
