import { Effect, Redacted, Schema } from "effect";
import type { Stream } from "effect";
import { Application, MainContext, Renderer, SewedError } from "sewed";
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

// Startup options and policies are data plus one login decider.
App.run(Effect.void, {
  commandLine: [
    { name: "enable-features", value: "WebRTCPipeWireCapturer" },
    { name: "no-sandbox" },
  ],
  appUserModelId: "com.example.sewed",
  hardwareAcceleration: false,
  certificateErrors: [{ hostname: "*.internal.example", trust: "always" }],
  login: (challenge) =>
    Effect.succeed<Application.LoginResponse>(
      challenge.isProxy
        ? { kind: "cancel" }
        : { kind: "credentials", username: "sewed", password: Redacted.make("secret") },
    ),
});
App.run(Effect.void, {
  // @ts-expect-error Passwords enter as redacted values.
  login: () => Effect.succeed({ kind: "credentials", username: "sewed", password: "secret" }),
});
App.run(Effect.void, {
  // @ts-expect-error Certificate trust is a closed set.
  certificateErrors: [{ hostname: "a", trust: "maybe" }],
});
