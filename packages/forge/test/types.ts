import { Effect, Stream } from "effect";
import type { Scope } from "effect";
import { MainContext, RendererContext, SewedError } from "sewed";
import { App, BrowserWindow, CommandLine, Gpu, Paths, Protocol, Session } from "sewed/main";
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

// The first consumer's entry, in its natural spelling: declarations before readiness, then the
// program claims the instance after its own checks. Every signature in step 3 answers to this.
declare const paths: { readonly session: string; readonly crashes: string };
declare const osLocale: () => string;
declare const launcherChecks: Effect.Effect<void, SewedError, MainContext>;
declare const handoff: Effect.Effect<boolean, SewedError, MainContext>;
declare const serve: Protocol.Handler;
const jobwright = Protocol.scheme("jobwright", {
  standard: true,
  secure: true,
  supportFetchAPI: true,
});
App.run(
  [
    Protocol.declare(jobwright),
    () => CommandLine.declare({ name: "lang", value: osLocale() }),
    Paths.declare({ sessionData: paths.session }),
    CrashReporter.declare({ directory: paths.crashes, uploadToServer: false }),
    Gpu.declare({ acceleration: true }),
  ],
  Effect.gen(function* () {
    yield* launcherChecks;
    if (yield* handoff) return yield* App.quit;
    const instance = yield* App.claimInstance({ data: { source: "desktop" } });
    const session = yield* Session.defaultSession;
    yield* Protocol.handle(session, jobwright, serve);
    const window = yield* BrowserWindow.make({ title: "Jobwright" });
    yield* instance.launches.pipe(
      Stream.runForEach(() => window.focus),
      Effect.forkScoped,
    );
  }).pipe(Effect.catchTag("SecondaryInstance", () => App.quit)),
);
// @ts-expect-error CrashReporter.startup is gone; declare the reporter.
CrashReporter.startup({ productName: "app" });
Effect.gen(function* () {
  // @ts-expect-error a declaration is a value, not an Effect: it cannot be yielded after readiness.
  yield* CrashReporter.declare({ productName: "app" });
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

// --- docs/forge.md: the guide's examples, spelled as the guide spells them ----------------------

declare const guideProgram: Effect.Effect<void, SewedError, MainContext | Scope.Scope>;

export const forgeUpdater = Effect.gen(function* () {
  const feed = yield* Updater.githubFeed({ owner: "acme", repo: "sewed-app" });
  const updater = yield* Updater.make(feed);
  yield* updater.check;
  yield* Stream.runForEach(updater.state, (state) =>
    state.status === "downloaded" ? updater.install : Effect.void,
  );
});

export const forgeCrashReporter = () =>
  App.run(
    [
      CrashReporter.declare({
        submitUrl: "https://crashes.acme.example/report",
        productName: "Sewed App",
        uploadToServer: false,
      }),
    ],
    guideProgram,
  );
