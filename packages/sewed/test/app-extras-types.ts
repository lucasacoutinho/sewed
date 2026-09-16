import { Context, Effect, Redacted, Schema } from "effect";
import type { Scope, Stream } from "effect";
import {
  Application,
  Certificate,
  Decidables,
  Decision,
  MainContext,
  Renderer,
  SewedError,
} from "sewed";
import { App } from "sewed/main";

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

// Startup options are data; application decisions are scoped installers on App.decide instead.
App.run(Effect.void, {
  commandLine: [
    { name: "enable-features", value: "WebRTCPipeWireCapturer" },
    { name: "no-sandbox" },
  ],
  appUserModelId: "com.example.sewed",
  hardwareAcceleration: false,
});
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
  Decision.async(() => Effect.succeed({ kind: "cancel" } as const)),
);
void unscopedLogin;

// The application decidables: Quit and CertificateError are async, LastWindowClosed is sync only.
const quit: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = App.decide(
  Decidables.App.Quit,
  Decision.sync(() => "allow" as const),
);
void quit;
const lastWindowClosed: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = App.decide(
  Decidables.App.LastWindowClosed,
  Decision.sync(() => "quit" as const),
);
void lastWindowClosed;
App.decide(
  Decidables.App.LastWindowClosed,
  // @ts-expect-error An async decider cannot install on the sync-timing LastWindowClosed decidable.
  Decision.async(() => Effect.succeed("quit" as const)),
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
    Effect.succeed(presented.fingerprint === "AA:BB:CC" ? ("trust" as const) : ("reject" as const)),
  ),
);
void certificateDecision;

// The menu App.run installed can be replaced after startup; nothing is ever restored.
const replaceMenu: Effect.Effect<void, SewedError, MainContext> = App.setMenu({
  items: [
    {
      kind: "submenu",
      label: "Updates",
      items: [{ kind: "command", id: "check", label: "Check for Updates" }],
    },
  ],
});
void replaceMenu;

// @ts-expect-error guardQuit is replaced by App.decide(Decidables.App.Quit, …)
App.guardQuit(Effect.succeed(true));
// @ts-expect-error login is replaced by App.decide(Decidables.App.Login, …)
App.login(() => Effect.succeed({ kind: "cancel" as const }));
// @ts-expect-error quitOnLastWindowClosed is replaced by Decidables.App.LastWindowClosed
App.run(Effect.void, { quitOnLastWindowClosed: true });
// @ts-expect-error certificateErrors is replaced by Decidables.App.CertificateError
App.run(Effect.void, { certificateErrors: [] });
