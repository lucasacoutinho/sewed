# Electron Forge bindings

`@sewed/forge` binds a Sewed application to Electron Forge's packaging and
publishing and to Electron's update and crash reporting runtime. It has two
entry points: `@sewed/forge` for the main-process runtime and
`@sewed/forge/config` for `forge.config.js`.

## Packaging configuration

```js
// forge.config.js
import { makeConfig } from "@sewed/forge/config";

export default makeConfig({
  name: "sewed-app",
  icon: "./assets/icon",
  makers: ["squirrel", "dmg", "zip", "deb"],
  github: { owner: "acme", repo: "sewed-app" },
});
```

`makeConfig` produces Forge's own configuration shape from a few decisions:
the product name and icon, ASAR packaging, extra resources, ignore patterns,
maker presets, and a GitHub publisher. Makers and the publisher are referenced
by package name, so only the makers you keep need installing. The result
follows Forge's configuration shape; if `@electron-forge/shared-types` is installed,
`satisfies ForgeConfig` in the config file checks it, and anything the helper does
not cover can be spread over it.

Install `@electron-forge/cli` and the makers you keep as development
dependencies. Forge has two pnpm requirements of its own, and the `create-sewed`
template ships both in `pnpm-workspace.yaml`: `nodeLinker: hoisted`, because Forge
packages a hoisted `node_modules` and refuses pnpm's isolated layout, and
`blockExoticSubdeps: false`, because Forge's dependency tree carries a
git-resolved package that pnpm 11's supply-chain policy blocks by default. The
template also overrides `yauzl` to its current major: Electron Packager extracts
Electron with yauzl 2, which on Node 26 ends the process silently a few megabytes
into the archive, so packaging succeeds with an empty result. Node 24 does not
need the override.

## Updates

```ts
const feed = yield * Updater.githubFeed({ owner: "acme", repo: "sewed-app" });
const updater = yield * Updater.make(feed);
yield * updater.check;
yield *
  Stream.runForEach(updater.state, (state) =>
    state.status === "downloaded" ? updater.install : Effect.void,
  );
```

`Updater.make(feed)` points Electron's updater at a feed for the caller's
scope and returns a handle whose `state` stream replays the current state and
follows the updater's events: checking, available, not available, downloaded
with the release name, notes, date, and URL, installing, and error. `check`
asks for updates and `install` restarts into a downloaded update, failing with
`Protocol` before one exists. `Updater.githubFeed` builds the
update.electronjs.org feed for the running platform, architecture, and
version from the same repository the publisher releases to, which is the
binding between publishing and updating; `Updater.feedUrl` is the pure form
for other hosts. One updater is active at a time, and Linux has no updater,
so `make` fails with `Native` there. Feeds and crash submission URLs are HTTPS
only, and repository names and versions are validated and encoded into the feed
path, since a feed an attacker can rewrite is a feed that installs their code.

## Crash reporting

```ts
App.run(
  [
    CrashReporter.declare({
      submitUrl: "https://crashes.acme.example/report",
      productName: "Sewed App",
      uploadToServer: false,
    }),
  ],
  program,
);
```

Electron's crash reporter must start before readiness to cover every process,
so `CrashReporter.declare(options)` is a declaration for `App.run`
rather than an Effect. `directory` is created, recursively, and then set as
Electron's `crashDumps` path before the reporter starts, so the directory
exists once the program runs. Invalid options, or a directory that cannot be
created, fail startup with code `Startup`.
After readiness, `CrashReporter.lastReport`, `uploadedReports`,
`uploadToServer` and `setUploadToServer`, and `parameters` with
`setParameter` and `removeParameter` cover the rest; parameter keys and
values keep Electron's byte limits.

## Verification

The external playground's `pnpm verify:forge` declares the crash reporter
with uploads disabled, reads and edits its parameters, proves the update feed
and the updater's platform gating, and checks that a malformed declaration
fails the application with `Startup`.
