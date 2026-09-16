import { Effect, Layer, Redacted, Scope, Stream } from "effect";
import {
  Binding,
  Capability,
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
import * as Testing from "sewed/testing";

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
const allowPlainText: Effect.Effect<void, SewedError, MainContext> = SafeStorage.allowPlainText;
void allowPlainText;
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
void availability;
void encrypted;
void decrypted;

// The shell is one capability. The native Layer produces exactly it and keeps the main requirement.
const shellNative: Layer.Layer<typeof ShellData.capability, SewedError, MainContext> = Shell.native(
  { policy: rules, paths: ["/tmp"] },
);
void shellNative;

// @ts-expect-error The native shell Layer cannot be built without the main runtime.
const shellWithoutMain: Layer.Layer<typeof ShellData.capability, SewedError> = Shell.native({
  policy: rules,
});
void shellWithoutMain;

// The memory Layer provides the same capability plus its recorder, and needs no runtime at all.
const shellMemory: Layer.Layer<typeof ShellData.capability | Testing.Recorder, SewedError> =
  Testing.Shell.memory({ policy: rules, paths: ["/tmp"] });
void shellMemory;

// An operation carries no runtime requirement: acquiring the capability is what proved it.
const shellCall = Effect.gen(function* () {
  const shell = yield* ShellData.capability;
  const opened: Effect.Effect<ShellData.OpenResult, SewedError> = shell.openPath({
    path: "/tmp/a",
  });
  yield* shell.openExternal({ url: "https://example.com/" });
  yield* shell.showItemInFolder({ path: "/tmp/a" });
  yield* shell.trashItem({ path: "/tmp/a" });
  yield* shell.beep({});
  return yield* opened;
});
const shellProgram: Effect.Effect<ShellData.OpenResult, SewedError, MainContext> = shellCall.pipe(
  Effect.provide(shellNative),
);
void shellProgram;

void Effect.gen(function* () {
  const shell = yield* ShellData.capability;
  // @ts-expect-error A shell payload is still checked against its schema.
  yield* shell.openExternal({ url: 1 });
});

// @ts-expect-error The removed handle is gone; there is no Shell.make and no handle.host.
Shell.make({ policy: rules });

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

Effect.gen(function* () {
  const theme = yield* NativeTheme.host({ allowSetSource: true });
  const power = yield* PowerMonitor.host();
  const notifications = yield* Notification.host();
  const paste = yield* Clipboard.host(policy);
  // Serving the capability carries the policy the native Layer holds to whoever binds to it.
  const links = yield* Capability.serve(ShellData.capability).pipe(
    Effect.provide(Shell.native({ policy: rules })),
  );
  const bindings = [
    Binding.to(Theme, theme),
    Binding.to(Power, power),
    Binding.to(Notifications, notifications),
    Binding.to(Paste, paste),
    Binding.to(ShellData.capability.slot, links),
  ] as const;
  void bindings;
  // @ts-expect-error A hosted owner only binds to a slot over its own protocol.
  Binding.to(Theme, power);
}).pipe(Effect.scoped) satisfies Effect.Effect<void, SewedError, MainContext>;

// @ts-expect-error Hosted owners retain the main runtime requirement.
const hostWithoutMain: Effect.Effect<unknown, SewedError, Scope.Scope> = PowerMonitor.host();
void hostWithoutMain;
