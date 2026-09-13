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
App.run(program, {
  startup: [
    CrashReporter.startup({
      submitUrl: "https://crashes.acme.example/report",
      productName: "Sewed App",
      uploadToServer: false,
    }),
  ],
});
```

Electron's crash reporter must start before readiness to cover every process,
so `CrashReporter.startup(options)` is a step for `App.run`'s `startup` list
rather than an Effect. Invalid options fail startup with code `Startup`. After
readiness, `CrashReporter.lastReport`, `uploadedReports`, `uploadToServer`
and `setUploadToServer`, and `parameters` with `setParameter` and
`removeParameter` cover the rest; parameter keys and values keep Electron's
byte limits.

## Verification

The external playground's `pnpm verify:forge` starts the crash reporter
through a startup step with uploads disabled, reads and edits its parameters,
proves the update feed and the updater's platform gating, and checks that a
malformed startup step fails the application with `Startup`.
