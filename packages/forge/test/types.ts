import { Effect } from "effect";
import type { Scope, Stream } from "effect";
import { MainContext, RendererContext, SewedError } from "sewed";
import { App } from "sewed/main";
import { CrashReporter, Updater } from "../lib/index.js";
import { makeConfig } from "../lib/config.js";

// The Forge configuration helper produces Forge's own shape.
const config = makeConfig({
  name: "sewed-app",
  icon: "./assets/icon",
  makers: ["squirrel", "dmg", "zip"],
  github: { owner: "sewed", repo: "app", prerelease: true },
});
void config;
// @ts-expect-error Maker presets are a closed set.
makeConfig({ makers: ["msi"] });

// The updater is a scoped main resource fed by the same repository the publisher uses.
const feed: Effect.Effect<Updater.Feed, SewedError, MainContext> = Updater.githubFeed({
  owner: "sewed",
  repo: "app",
});
const updater: Effect.Effect<Updater.Handle, SewedError, MainContext | Scope.Scope> = Updater.make({
  url: "https://update.electronjs.org/sewed/app/win32-x64/1.0.0",
});
const state: Stream.Stream<Updater.State, SewedError, MainContext> = Effect.runSync(
  Effect.succeed(undefined as unknown as Updater.Handle),
).state;
const url: string = Updater.feedUrl({ owner: "sewed", repo: "app" }, "darwin", "arm64", "1.2.3");
void feed;
void updater;
void state;
void url;
// @ts-expect-error The updater retains main placement.
const misplaced: Effect.Effect<Updater.Handle, SewedError, RendererContext | Scope.Scope> =
  Updater.make({ url: "https://example.com" });
void misplaced;
// @ts-expect-error Feed server types are a closed set.
Updater.make({ url: "https://example.com", serverType: "xml" });

// Crash reporting starts before readiness through App.run's startup steps.
App.run(Effect.void, {
  startup: [
    CrashReporter.startup({
      submitUrl: "https://crashes.example.com/report",
      productName: "Sewed",
      uploadToServer: false,
      extra: { channel: "beta" },
    }),
  ],
});
const last: Effect.Effect<CrashReporter.Report | null, SewedError, MainContext> =
  CrashReporter.lastReport;
const parameters: Effect.Effect<CrashReporter.Parameters, SewedError, MainContext> =
  CrashReporter.parameters;
const set: Effect.Effect<void, SewedError, MainContext> = CrashReporter.setParameter("k", "v");
void last;
void parameters;
void set;
// @ts-expect-error Crash reporter queries retain main placement.
const misplacedReport: Effect.Effect<CrashReporter.Report | null, SewedError> =
  CrashReporter.lastReport;
void misplacedReport;
