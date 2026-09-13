# @sewed/vite

Development integration for a Sewed Electron application using Vite for its
renderer. The plugin runs only for `vite serve`, compiles the Electron main,
worker and shared TypeScript sources with the consumer's TypeScript compiler,
and restarts Electron when those sources change.

Add it to an ordinary Vite config. Paths are relative to the directory that
contains the Vite config file, even when Vite's `root` points at a renderer
directory:

```ts
import { sewed } from "@sewed/vite";

export default {
  root: "src/renderer",
  plugins: [
    sewed({
      main: "src/main/app.ts",
      tsconfig: "tsconfig.electron.json",
      electronArgs: ["--ozone-platform=x11"],
    }),
  ],
};
```

`main` must be included by an emitting, single-project TypeScript config.
`typescript` and `electron` are resolved from the consumer project. The
plugin stages each successful compilation in a fresh
`.sewed/dev/<session>/<generation>` directory and starts Electron with that
directory as its application root. The generated app remains below the
consumer project, so its imports continue to resolve the consumer's
`node_modules`.

The optional `cwd` changes the project directory used for TypeScript,
Electron and staging resolution. `electronPath` selects an explicit Electron
executable. `debounceMs` controls source-change coalescing.

Use `onEvent` for structured development telemetry:

```ts
sewed({
  main: "src/main/app.ts",
  onEvent(event) {
    if (event.type === "started") console.info(event.generation, event.pid);
  },
});
```

Events are `building`, `build-failed`, `started` and `stopped`. A failed or
superseded compilation is discarded without replacing the currently running
Electron generation. Renderer-only changes remain under Vite HMR.

`env` supplies additional strings to the managed Electron child without changing the host process environment. Sewed's renderer URL and generation remain controlled by the plugin. The optional `@sewed/devtools/vite` wrapper uses this seam to enable scoped headless diagnostics in development.
