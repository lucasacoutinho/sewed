# Sewed

An Electron library built on [Effect](https://effect.website) v4.

Electron gives you `ipcMain`, `ipcRenderer`, manual preload scripts, and global event listeners whose cleanup you track yourself. Sewed replaces those with Effect scopes, typed RPC bindings over private `MessagePort` channels, and data-driven native policies you can test in Node without starting Electron.

Sewed is a prototype targeting Electron 45 (`>=41 <46`) and Effect 4.1.x. Unit tests, packed consumer checks, and Electron Forge packaging run in CI on Linux, macOS, and Windows. Deep native-surface verification runs on Linux.

## Example

Main owns every native resource and decides which running owners each window, worker, or utility process can reach:

```ts
import { Effect } from "effect";
import { Binding, Renderer } from "sewed";
import { App, BrowserWindow, Capability, NativeTheme, WindowControls, Worker } from "sewed/main";
import { Clock, Controls, Theme, bindings } from "../shared/bindings.js";
import { ClockProtocol } from "../shared/contracts.js";

App.run(
  [],
  Effect.gen(function* () {
    const clock = yield* Worker.spawn(
      Worker.entry(new URL("../worker/clock.js", import.meta.url), ClockProtocol),
    );
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

In the renderer, `Renderer.run(entry, mount("#root", <App />))` ties the React root to the renderer's Effect scope. Components read streams and invoke bound operations through external-store hooks without `useEffect`:

```tsx
const clock = useClient(Clock);
const ticks = useStream(() => clock.ticks(), [clock]);
const theme = useClient(Theme);
const setTheme = useAction((source: "light" | "dark") => theme.setSource({ source }));
```

Operations carry their runtime requirement in the type system (`MainContext`, `WorkerContext`, `RendererContext`), so calling main APIs from a renderer or omitting a declared binding in `window.webContents.load` fails at compile time. Closing a scope tears down its windows, workers, sessions, capabilities, and ports. Renderers run sandboxed with context isolation enabled and Node integration disabled, talking to owners over private `MessagePort` channels instead of raw IPC.

Transport and native failures use `SewedError` codes `Startup`, `Protocol`, `Native`, `Closed`, `Limit`, and `Unknown`, with the original cause preserved. `Unknown` means the request left the client without a usable reply, so do not automatically retry side-effecting calls on `Unknown`. Native rules for permissions, navigation, cookies, certificates, and clipboard access are plain data and Effect deciders that run in Node tests via `sewed/testing` and `memory` capability layers.

## Quick start

Packages ship as packed tarballs on [GitHub Releases](../../releases), or you can pack and scaffold straight from a local checkout. Requires Node 24+ and pnpm 11.

```sh
pnpm install
pnpm release:pack
node packages/create/bin/create-sewed.mjs ../my-app --local-packages .artifacts
pnpm --dir ../my-app install
pnpm --dir ../my-app dev
```

`--local-packages` wires the scaffold to the `.tgz` files in `.artifacts` using absolute `file:` paths, so keep `.artifacts` in place for later installs. See [the application walkthrough](docs/getting-started.md) for a file-by-file tour of the generated app.

## Packages

| Package           | Role                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `sewed`           | Core contracts, bindings, transport, and `sewed/main`, `sewed/worker`, `sewed/utility`, `sewed/testing` |
| `@sewed/react`    | `mount`, `useClient`, `useCapability`, `useAction`, `useStream`, and `useResource`                      |
| `@sewed/vite`     | Vite dev server integration with Electron restarts and React Fast Refresh                               |
| `@sewed/devtools` | Headless scoped diagnostic snapshots and Effect tracing                                                 |
| `@sewed/forge`    | Electron Forge config helper (`makeConfig`), auto-updater, and crash reporting                          |
| `create-sewed`    | Project scaffold with a worker, window, theme capability, and Vite setup                                |

## Documentation

- Getting started: [application walkthrough](docs/getting-started.md), [API guide](docs/api.md)
- Runtime model: [native decisions and policies](docs/native-policy.md), [binding composition](docs/binding-composition.md), [worker dependencies](docs/worker-bindings.md), [stream transport](docs/transport.md), [binary streams](docs/binary-streams.md)
- Surfaces and tooling: [Electron coverage plan](docs/electron-coverage.md), [testing](docs/testing.md), [Vite integration](docs/development.md), [Electron Forge](docs/forge.md), [headless DevTools](docs/devtools.md)
- Reference: [generated API reference](docs/reference.md), [changelog](CHANGELOG.md)

## Developing

```sh
pnpm install          # installs dependencies and patches tsc with @effect/tsgo
pnpm build            # builds all packages and bundles the preload
pnpm test             # builds, runs release and API reference checks, typechecks, and runs tests
pnpm format:check     # checks formatting with oxfmt
pnpm website:build    # builds the Astro and Starlight docs site
pnpm check:consumer   # packs all 6 tarballs and tests fresh and frozen scaffolded consumers
pnpm check:packaging  # packages a scaffolded app with Electron Forge and boots it
```

`pnpm install` patches TypeScript with `@effect/tsgo` so Effect diagnostics run alongside type errors. To see the same diagnostics in your editor, point your TypeScript server at `pnpm exec effect-tsgo get-exe-path`.

To bump versions or move the Effect pin across every workspace manifest and the scaffold template:

```sh
node scripts/release.mjs version <semver>
node scripts/release.mjs effect <semver>
pnpm release:pack
```

Pushing a `v<version>` tag runs CI and attaches the packed tarballs to a GitHub release. See [AGENTS.md](AGENTS.md) for architecture rules.

## Limits

- Type requirements keep main APIs out of renderers, but they cannot stop heavy JavaScript in a renderer. Put CPU-bound work in a `Worker` or `Utility` entry.
- Raw IPC and arbitrary script injection into Sewed renderers are excluded by design. Guest views expose declared, fenced automation, and `webview` tags require opt-in.
- Platform-specific macOS and Windows surfaces (updater, crash reporting, Touch Bar, dock, taskbar) have typed APIs and CI packaging checks, but still need dedicated native hardware verification.

## License

Apache-2.0. Sewed's binding and runtime foundations derive from [Alchemy](https://github.com/alchemy-run/alchemy), Copyright 2026 Functionless Corp., under the same license. See [NOTICE](NOTICE), [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md), and [docs/upstream.md](docs/upstream.md).
