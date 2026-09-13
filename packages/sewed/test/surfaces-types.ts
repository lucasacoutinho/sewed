import { Effect, Redacted, Scope, Stream } from "effect";
import {
  Binding,
  Clipboard as ClipboardData,
  MainContext,
  NativeTheme as NativeThemeData,
  Notification as NotificationData,
  PowerMonitor as PowerMonitorData,
  SafeStorage as SafeStorageData,
  SewedError,
  Shell as ShellData,
} from "sewed";
import { Clipboard, NativeTheme, Notification, PowerMonitor, SafeStorage, Shell } from "sewed/main";

// Root schemas stay inert data and type as such.
const source: NativeThemeData.Source = "dark";
const policy: ClipboardData.Policy = { read: ["text"], write: ["text", "image"] };
const rules: ShellData.Policy = [{ kind: "origin", origin: "https://example.com" }];
const sealed: SafeStorageData.Sealed = {
  version: 1,
  backend: "basic_text",
  bytes: new Uint8Array(),
};
void source;
void policy;
void rules;
void sealed;

// Main operations retain the main runtime requirement and fail with SewedError.
const themeState: Stream.Stream<NativeThemeData.State, SewedError, MainContext> = NativeTheme.state;
const themeCurrent: Effect.Effect<NativeThemeData.State, SewedError, MainContext> =
  NativeTheme.current;
const themeSet: Effect.Effect<void, SewedError, MainContext> = NativeTheme.setSource("light");
const powerState: Effect.Effect<PowerMonitorData.State, SewedError, MainContext> =
  PowerMonitor.state(60);
const powerEvents: Stream.Stream<PowerMonitorData.Event, SewedError, MainContext> =
  PowerMonitor.events;
const clipboardRead: Effect.Effect<ClipboardData.Content | null, SewedError, MainContext> =
  Clipboard.read("text");
const clipboardWrite: Effect.Effect<void, SewedError, MainContext> = Clipboard.write({
  kind: "text",
  text: "copied",
});
const clipboardFormats: Effect.Effect<readonly ClipboardData.Format[], SewedError, MainContext> =
  Clipboard.formats;
const notificationSupported: Effect.Effect<boolean, SewedError, MainContext> =
  Notification.supported;
const notification: Effect.Effect<Notification.Handle, SewedError, MainContext | Scope.Scope> =
  Notification.show({ title: "Sewed" });
const shellHandle: Effect.Effect<Shell.Handle, SewedError, MainContext> = Shell.make({
  policy: rules,
  paths: ["/tmp"],
});
const availability: Effect.Effect<SafeStorageData.Availability, SewedError, MainContext> =
  SafeStorage.availability;
const encrypted: Effect.Effect<SafeStorageData.Sealed, SewedError, MainContext> =
  SafeStorage.encrypt(Redacted.make("secret"));
const decrypted: Effect.Effect<
  Redacted.Redacted<string>,
  SewedError,
  MainContext
> = SafeStorage.decrypt(sealed);
void themeState;
void themeCurrent;
void themeSet;
void powerState;
void powerEvents;
void clipboardRead;
void clipboardWrite;
void clipboardFormats;
void notificationSupported;
void notification;
void shellHandle;
void availability;
void encrypted;
void decrypted;

// @ts-expect-error Theme observation retains the main runtime requirement.
const themeWithoutMain: Stream.Stream<NativeThemeData.State, SewedError> = NativeTheme.state;
void themeWithoutMain;

// @ts-expect-error Safe storage plaintext only enters as a redacted value.
SafeStorage.encrypt("secret");

// @ts-expect-error Clipboard formats are a closed set.
Clipboard.read("files");

// @ts-expect-error Theme sources are a closed set.
NativeTheme.setSource("auto");

// Hosted owners bind to the root protocols and require a scope.
const Theme = Binding.slot("theme", NativeThemeData.protocol);
const Power = Binding.slot("power", PowerMonitorData.protocol);
const Notifications = Binding.slot("notifications", NotificationData.protocol);
const Paste = Binding.slot("paste", ClipboardData.protocol);
const Links = Binding.slot("links", ShellData.protocol);

Effect.gen(function* () {
  const theme = yield* NativeTheme.host({ allowSetSource: true });
  const power = yield* PowerMonitor.host();
  const notifications = yield* Notification.host();
  const paste = yield* Clipboard.host(policy);
  const shell = yield* Shell.make({ policy: rules });
  const links = yield* shell.host;
  const bindings = [
    Binding.to(Theme, theme),
    Binding.to(Power, power),
    Binding.to(Notifications, notifications),
    Binding.to(Paste, paste),
    Binding.to(Links, links),
  ] as const;
  void bindings;
  // @ts-expect-error A hosted owner only binds to a slot over its own protocol.
  Binding.to(Theme, power);
}).pipe(Effect.scoped) satisfies Effect.Effect<void, SewedError, MainContext>;

// @ts-expect-error Hosted owners retain the main runtime requirement.
const hostWithoutMain: Effect.Effect<unknown, SewedError, Scope.Scope> = PowerMonitor.host();
void hostWithoutMain;
