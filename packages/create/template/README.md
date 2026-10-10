# {{name}}

A Sewed Electron application: main owns the window and a worker, the worker owns the clock, and the renderer is an ordinary React app that calls explicitly bound owners.

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts Vite with `@sewed/vite`, which compiles `src/main` and `src/worker`, launches Electron, keeps React Fast Refresh for the renderer, and restarts the application after a successful main or worker compilation.

| Directory      | Owns                                                     |
| -------------- | -------------------------------------------------------- |
| `src/shared`   | RPC contracts and binding slots; no runtime resources    |
| `src/worker`   | Worker definitions, run on Node worker threads by main   |
| `src/main`     | Windows, workers, and which owner each renderer receives |
| `src/renderer` | The React application and its Sewed bootstrap adapter    |

`pnpm install` patches TypeScript with the Effect language service, so `pnpm typecheck` and `pnpm build` report Effect mistakes, such as an Effect that is built and never run, beside type errors. The plugin options are in the two `tsconfig` files.

`pnpm build` emits `dist/main`, `dist/worker`, and `dist/renderer`; `pnpm start` builds and runs the packaged layout with Electron.
