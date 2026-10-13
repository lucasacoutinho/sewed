# create-sewed

Scaffolds a Sewed Electron application with one worker, one window, explicit bindings, a React renderer, and the Vite development integration already wired.

The packages are not published yet. From the Sewed repository:

```sh
pnpm install
pnpm release:pack
node packages/create/bin/create-sewed.mjs ../my-app --local-packages .artifacts
pnpm --dir ../my-app install
pnpm --dir ../my-app dev
```

Choose a new or empty directory for your app. Its directory name becomes the package name; use `--name @acme/desktop` to choose another. The command prepares the complete project before placing it there.

`--local-packages <directory>` selects the matching-version `sewed`, `@sewed/react`, and `@sewed/vite` archives produced by `pnpm release:pack`. It checks that every required archive exists and is a regular file before creating the project's parent directory or replacing an empty destination. Local dependency paths are absolute, so the app can be installed from another working directory; keep the archive directory in place for later installs.

Without `--local-packages`, the generated project retains version pins for installing published packages. Once packages are published, `pnpm create sewed my-app` uses that default.

The root test script checks argument handling, destination protection and failed placement. `pnpm -C packages/create check` checks both TypeScript projects in the template against the workspace packages. `pnpm check:consumer` packs the CLI and libraries, invokes `--local-packages`, then installs, typechecks and builds a fresh application.
