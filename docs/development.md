# Vite development integration

Keep your usual renderer tooling and add `@sewed/vite` to run Electron alongside it. React Fast Refresh handles renderer changes; Sewed compiles your main and worker code and restarts Electron after a successful build.

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sewed } from "@sewed/vite";

export default defineConfig({
  root: "src/renderer",
  plugins: [react(), sewed({ main: "src/main/app.ts", tsconfig: "tsconfig.electron.json" })],
});
```

Use `"dev": "vite"` in `package.json`. Paths in the Sewed options are relative to the config file's directory, even when the renderer has a different Vite root. The plugin resolves TypeScript and Electron from the consumer project.

Point `tsconfig` at one emitting Node project containing main, workers, and shared contracts. Keep renderer sources out of that project's include patterns so renderer edits remain Fast Refresh updates. The compiler must emit runnable Node modules; the plugin preserves the output tree and relative worker URLs. This integration runs only during development and leaves `vite build` to your existing production build.

Each compilation gets its own `.sewed/dev/<session>/<generation>` directory. Successful compilation stops the previous Electron process before launching the new one. Failed or superseded compilation preserves the working generation. No partial emission replaces files underneath the running app. Add `.sewed/` to your application's ignore file.

The launched application receives `SEWED_RENDERER_URL`, pointing at Vite, and `SEWED_GENERATION`, identifying its development generation. Load the renderer through `window.webContents.load(Renderer.entry(...))` as usual. Worker edits restart the development application, including its workers; production owners retain their existing explicit lifecycle policy.

`electronArgs` supplies native command-line arguments. `env` adds strings to the Electron child environment without changing the host environment; Sewed still owns its renderer URL and generation values. `onEvent` receives `building`, `build-failed`, `started`, and `stopped` records; start/stop records contain the actual process ID. These records are useful for an editor integration or a development harness. `cwd` selects an explicit project directory, `electronPath` selects an executable, and `debounceMs` controls save coalescing.

A launcher or another tool that spawns Electron itself — outside this plugin, such as a packaged application's own start script — takes the binary from `resolveElectron({ cwd?, electronPath? })`, the same resolution this plugin performs for its own development runs: `require("electron")` from `cwd`'s `package.json` (default: the current working directory), or `electronPath` verbatim when given. It throws naming the directory when Electron cannot be resolved there. Importing it from `@sewed/vite` costs a Node tool no Vite dependency, because the package's own entry imports `vite` as types only: `vite` is an optional peer, so a tool that imports only `resolveElectron` installs it and gets no unmet-peer warning; `typescript` is not declared as a peer at all, because a fixed `>=7 <8` range would warn about whatever major version a consumer already has installed for its own reasons, even one this plugin still accepts. The plugin itself still needs both, and checks each at run time when it actually compiles a project — Vite by never loading a plugin it cannot resolve, TypeScript by resolving `typescript/package.json` from the consumer project and reading its `version`, throwing `@sewed/vite could not resolve TypeScript from <dir>. Install TypeScript >=7 <8 in the consumer project.` when it cannot be resolved at all, or `@sewed/vite requires TypeScript >=7 <8 in the consumer project; found <version> at <path>` when the resolved version falls outside that range.

Closing Vite cancels compilation, stops its Electron process tree, and removes its session directory. Closing the application also stops that development server. The repository checks packed consumers in CI and publishes package tarballs through its tag-triggered release workflow; see [releases](../README.md#releases).

The external playground checks the development loop with actual Electron processes and a normal React component. Its native geometry checks require a window manager that implements EWMH; Xvfb alone does not implement maximize or restore. `scripts/with-xvfb.py` starts an authenticated X display and Openbox, checks that the manager is ready, and cleans up both. It accepts `SEWED_XVFB` and `SEWED_WINDOW_MANAGER` executable paths for a local setup.

The separate `@sewed/devtools/vite` entry exports `sewedDevTools(options)`, an opt-in wrapper around this plugin. It sets `SEWED_DEVTOOLS=1` in each Electron generation so a main program can enable headless diagnostics with `DevTools.layer()` or `DevTools.make()`. See the [DevTools package](devtools.md).

## Terminal shutdown

Ctrl+C closes the Vite server and waits for Sewed's owned Electron process group
before exiting. Managed Electron children receive a private parent-process
shutdown message so application and worker scopes can finalize even when normal
quit guards deny a close request. This channel is separate from renderer IPC and
does not grant renderers an application shutdown capability. The existing
bounded termination fallback applies if a child does not cooperate.

The plugin removes its SIGINT listener during disposal. The external playground's
`verify:terminal` check exercises the actual `dev` and `dev:inspect` commands,
including process and debug-port cleanup; the development-loop fixture continues
to cover save/rebuild/restart behavior.
