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
If that project includes `.tsx` files, including imported dependencies outside
`files` or `include`, use a transforming `jsx` mode such as
`react-jsx` or `react`. `jsx: "preserve"` leaves `.jsx` output that Electron's
main runtime cannot load, including when a `.tsx` file is a dependency of the
main entry.
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

The plugin watches inherited TypeScript configs, the consumer's `package.json`,
and local imported sources even when they are outside `files` or `include`.
It infers an omitted `rootDir` from the full source graph. Staging writes under
`.sewed/dev` do not request another build. An initially invalid inherited config
remains watched so fixing it can start Electron without restarting Vite.

`env` supplies additional strings to the managed Electron child without changing the host process environment. Sewed's renderer URL and generation remain controlled by the plugin. The optional `@sewed/devtools/vite` wrapper uses this seam to enable scoped headless diagnostics in development.
