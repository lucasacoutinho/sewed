import { Context, Effect, Redacted, Schema } from "effect";
import type { Scope, Stream } from "effect";
import {
  Application,
  Certificate,
  Decidables,
  Decision,
  MainContext,
  Permission,
  Renderer,
  SewedError,
} from "sewed";
import { App, CommandLine, Gpu } from "sewed/main";

const entry = Renderer.entry(new URL("file:///renderer.html"), { bindings: [] });

// Queries and commands keep main placement and validated inputs.
const info: Effect.Effect<Application.Info, SewedError, MainContext> = App.info;
const userData: Effect.Effect<string, SewedError, MainContext> = App.path("userData");
const setLogs: Effect.Effect<void, SewedError, MainContext> = App.setPath("logs", "/var/log/app");
const gpu: Effect.Effect<typeof Schema.Json.Type, SewedError, MainContext> = App.gpu("complete");
const features: Effect.Effect<Record<string, string>, SewedError, MainContext> = App.gpuFeatures;
const loginItems: Effect.Effect<Application.LoginItems, SewedError, MainContext> = App.loginItems;
const setLoginItems: Effect.Effect<void, SewedError, MainContext> = App.setLoginItems({
  openAtLogin: true,
  args: ["--hidden"],
});
const badge: Effect.Effect<number, SewedError, MainContext> = App.badge;
const setBadge: Effect.Effect<void, SewedError, MainContext> = App.setBadge(3);
const about: Effect.Effect<void, SewedError, MainContext> = App.setAboutPanel({
  applicationName: "Sewed",
  authors: ["Lucas"],
});
const isDefault: Effect.Effect<boolean, SewedError, MainContext> = App.isDefaultProtocolClient({
  scheme: "sewed",
});
const secure: Effect.Effect<void, SewedError, MainContext> = App.setSecureKeyboardEntry(true);
const focus: Stream.Stream<Application.WindowFocus, SewedError, MainContext> = App.windowFocus;
const gone: Stream.Stream<Application.ChildProcessGone, SewedError, MainContext> =
  App.childProcesses;
const created: Stream.Stream<Application.WebContentsCreated, SewedError, MainContext> =
  App.webContentsCreated;
const dockBadge: Effect.Effect<void, SewedError, MainContext> = App.dock.setBadge("3");
// The dock icon is `Image.Source`, over wave 3's helper: a path or already-encoded bytes.
const dockIconFromPath: Effect.Effect<void, SewedError, MainContext> = App.dock.setIcon("icon.png");
const dockIconFromBytes: Effect.Effect<void, SewedError, MainContext> = App.dock.setIcon(
  new Uint8Array([137, 80, 78, 71]),
);
void dockIconFromPath;
void dockIconFromBytes;
// @ts-expect-error A dock icon is a path or encoded bytes, not an arbitrary number.
App.dock.setIcon(42);
const bounce: Effect.Effect<number, SewedError, MainContext> = App.dock.bounce("critical");
const tasks: Effect.Effect<void, SewedError, MainContext> = App.taskbar.setUserTasks([]);
const jumpList: Effect.Effect<void, SewedError, MainContext> = App.taskbar.setJumpList(null);
void info;
void userData;
void setLogs;
void gpu;
void features;
void loginItems;
void setLoginItems;
void badge;
void setBadge;
void about;
void isDefault;
void secure;
void focus;
void gone;
void created;
void dockBadge;
void bounce;
void tasks;
void jumpList;

// @ts-expect-error Application queries are main-owned.
Renderer.run(entry, App.info);
// @ts-expect-error Path names are a closed set.
App.path("cache");
// @ts-expect-error GPU information kinds are a closed set.
App.gpu("verbose");
// @ts-expect-error Dock bounce kinds are a closed set.
App.dock.bounce("loud");

// Startup declarations are data; application decisions are scoped installers on App.decide instead.
App.run(
  [
    CommandLine.declare({ name: "sewed-extras", value: "on" }),
    App.declare({ userModelId: "dev.sewed.playground" }),
    Gpu.declare({ acceleration: false }),
  ],
  Effect.void,
);
class Vault extends Context.Service<Vault, { readonly password: Redacted.Redacted<string> }>()(
  "app-extras/Vault",
) {}
const login: Effect.Effect<void, SewedError, MainContext | Scope.Scope | Vault> = App.decide(
  Decidables.App.Login,
  Decision.async((challenge) =>
    Effect.map(Vault, ({ password }): Application.LoginResponse =>
      challenge.isProxy ? { kind: "cancel" } : { kind: "credentials", username: "sewed", password },
    ),
  ),
);
void login;
App.decide(
  Decidables.App.Login,
  // @ts-expect-error Passwords enter as redacted values.
  Decision.async(() =>
    Effect.succeed({ kind: "credentials", username: "sewed", password: "secret" }),
  ),
);
// @ts-expect-error The decider lives in a scope.
const unscopedLogin: Effect.Effect<void, SewedError, MainContext> = App.decide(
  Decidables.App.Login,
  Decision.async(() => Effect.succeed({ kind: "cancel" })),
);
void unscopedLogin;

// The application decidables: Quit and CertificateError are async, LastWindowClosed is sync only.
// Natural spelling — no annotation, no `as const` — compiles and infers the literal answer, per fix
// round 1's Stage 1: dropping the `sync`/`async` overloads is what makes this hold.
const quit: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = App.decide(
  Decidables.App.Quit,
  Decision.sync(() => "allow"),
);
void quit;
const lastWindowClosed: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = App.decide(
  Decidables.App.LastWindowClosed,
  Decision.sync(() => "quit"),
);
void lastWindowClosed;
App.decide(
  Decidables.App.LastWindowClosed,
  // @ts-expect-error An async decider cannot install on the sync-timing LastWindowClosed decidable.
  Decision.async(() => Effect.succeed("quit")),
);
const certificate: Certificate.Presented = {
  fingerprint: "AA:BB:CC",
  subjectName: "example.com",
  issuerName: "Example CA",
  validStart: 0,
  validExpiry: 1,
};
void certificate;
// @ts-expect-error A presented certificate must carry a fingerprint.
const missingFingerprint: Certificate.Presented = {
  subjectName: "example.com",
  issuerName: "Example CA",
  validStart: 0,
  validExpiry: 1,
};
void missingFingerprint;
const certificateDecision: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = App.decide(
  Decidables.App.CertificateError,
  Decision.async(({ certificate: presented }) =>
    Effect.succeed(presented.fingerprint === "AA:BB:CC" ? "trust" : "reject"),
  ),
);
void certificateDecision;

// The hostname matching App.ts used to do inline moved out with the option it served: Certificate
// itself now owns the matching logic as Certificate.Policy, a value a consumer installs with rule
// data alone via the spec's two-argument Decision.policy, so the *.-suffix and lowercasing semantics
// the old option guaranteed stay expressible, and now compose. This is also Task 6b's own probe's
// fourth negative flipping positive: today's App.CertificateError event has `hostname` (this task's
// own addition, alongside `url`), which is exactly what Certificate.Policy compiles against —
// installing it here no longer needs an annotation, a cast, or a hand-written compile.
const certificatePolicyDecision: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  App.decide(
    Decidables.App.CertificateError,
    Decision.policy(Certificate.Policy, [{ hostname: "*.internal.example", trust: "always" }]),
  );
void certificatePolicyDecision;

// A permission policy's rule data is checked against its own Name literals at Decision.policy, before
// any install: "camera" is not one of Permission.Name's members ("media" grants the combined native
// media permission instead).
Decision.policy(Permission.Policy, [
  // @ts-expect-error "camera" is not a member of Permission.Name.
  { kind: "origin", origin: "https://e.example", permissions: ["camera"] },
]);

// @ts-expect-error guardQuit is replaced by App.decide(Decidables.App.Quit, …)
App.guardQuit(Effect.succeed(true));
// @ts-expect-error login is replaced by App.decide(Decidables.App.Login, …)
App.login(() => Effect.succeed({ kind: "cancel" as const }));
// @ts-expect-error quitOnLastWindowClosed, certificateErrors and every other option are gone; each
// became a declaration or a decidable, and the options object itself no longer exists.
App.run(Effect.void, {});
