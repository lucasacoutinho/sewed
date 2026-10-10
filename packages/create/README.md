# create-sewed

Scaffolds a Sewed Electron application with one worker, one window, explicit bindings, a React renderer, and the Vite development integration already wired.

```sh
pnpm create sewed my-app
cd my-app
pnpm install
pnpm dev
```

Choose a new or empty directory for your app. Its directory name becomes the package name; use `--name @acme/desktop` to choose another. The command prepares the complete project before placing it there.

Inside this repository, before the package is published, run the bin directly:

```sh
node packages/create/bin/create-sewed.mjs ../my-app
```

The generated project pins the Sewed packages to this package's version. The root test script checks the command and its tests, and `pnpm -C packages/create check` checks both TypeScript projects in the template against the workspace packages.
