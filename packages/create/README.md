# create-sewed

Scaffolds a Sewed Electron application with one worker, one window, explicit bindings, a React renderer, and the Vite development integration already wired.

```sh
pnpm create sewed my-app
cd my-app
pnpm install
pnpm dev
```

Inside this repository, before the package is published, run the bin directly:

```sh
node packages/create/bin/create-sewed.mjs ../my-app
```

The generated project pins the Sewed packages to this package's version. The template under `template/` is type-checked against the workspace packages by `pnpm -C packages/create check`, which the root test script runs.
