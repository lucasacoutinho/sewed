import { Effect, Layer, Redacted, Scope, Stream } from "effect";
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
import {
  Capability,
  Clipboard,
  NativeTheme,
  Notification,
  PowerMonitor,
  SafeStorage,
  Shell,
} from "sewed/main";
import * as Testing from "sewed/testing";
import * as NativeThemePolicy from "../src/internal/NativeThemePolicy.ts";

// The theme is the one surface whose options are a plain interface rather than a schema-derived
// type, so its decode schema is the only thing that could drift from the type it validates. These
// four assertions pin them together: the values check every shared field's type and optionality in
// both directions, and the keys catch a field added to one side alone, optional ones included.
type ThemeOptionsDecoded = typeof NativeThemePolicy.Options.Type;
declare const themeOptionsDecoded: ThemeOptionsDecoded;
declare const themeOptionsDeclared: NativeThemeData.Options;
declare const themeOptionsDecodedKey: keyof ThemeOptionsDecoded;
declare const themeOptionsDeclaredKey: keyof NativeThemeData.Options;
const themeOptionsForward: NativeThemeData.Options = themeOptionsDecoded;
const themeOptionsBackward: ThemeOptionsDecoded = themeOptionsDeclared;
const themeOptionsKeysForward: keyof NativeThemeData.Options = themeOptionsDecodedKey;
const themeOptionsKeysBackward: keyof ThemeOptionsDecoded = themeOptionsDeclaredKey;
void themeOptionsForward;
void themeOptionsBackward;
void themeOptionsKeysForward;
void themeOptionsKeysBackward;

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

// The theme is one capability too. Its native Layer produces exactly it and keeps the main
// requirement; the main-only queries above it are untouched.
const themeNative: Layer.Layer<typeof NativeThemeData.capability, SewedError, MainContext> =
  NativeTheme.native({ allowSetSource: true });
void themeNative;

// @ts-expect-error The native theme Layer cannot be built without the main runtime.
const themeNativeWithoutMain: Layer.Layer<typeof NativeThemeData.capability, SewedError> =
  NativeTheme.native();
void themeNativeWithoutMain;

// The memory Layer provides the same capability plus its recorder, and needs no runtime at all.
const themeMemory: Layer.Layer<typeof NativeThemeData.capability | Testing.Recorder, SewedError> =
  Testing.NativeTheme.memory({ allowSetSource: true });
void themeMemory;

// An operation carries no runtime requirement: acquiring the capability is what proved it.
const themeCall = Effect.gen(function* () {
  const theme = yield* NativeThemeData.capability;
  const states: Stream.Stream<NativeThemeData.State, SewedError> = theme.state();
  yield* theme.setSource({ source: "dark" });
  return states;
});
const themeProgram: Effect.Effect<
  Stream.Stream<NativeThemeData.State, SewedError>,
  SewedError,
  MainContext
> = themeCall.pipe(Effect.provide(themeNative));
void themeProgram;

void Effect.gen(function* () {
  const theme = yield* NativeThemeData.capability;
  // @ts-expect-error Theme sources stay a closed set through the capability.
  yield* theme.setSource({ source: "auto" });
});

// @ts-expect-error The removed hosted owner is gone; there is no NativeTheme.host.
NativeTheme.host({ allowSetSource: true });

// @ts-expect-error Safe storage plaintext only enters as a redacted value.
SafeStorage.encrypt("secret");

// @ts-expect-error Clipboard formats are a closed set.
Clipboard.read("files");

// @ts-expect-error Theme sources are a closed set.
NativeTheme.setSource("auto");

// Every desktop surface is a capability, so each slot comes from the capability itself and
// serving one requires a scope.
Effect.gen(function* () {
  const notifications = yield* Capability.serve(NotificationData.capability).pipe(
    Effect.provide(Notification.native()),
  );
  const paste = yield* Capability.serve(ClipboardData.capability).pipe(
    Effect.provide(Clipboard.native(policy)),
  );
  // Serving a capability carries the policy its native Layer holds to whoever binds to it.
  const theme = yield* Capability.serve(NativeThemeData.capability).pipe(
    Effect.provide(NativeTheme.native({ allowSetSource: true })),
  );
  const power = yield* Capability.serve(PowerMonitorData.capability).pipe(
    Effect.provide(PowerMonitor.native()),
  );
  const links = yield* Capability.serve(ShellData.capability).pipe(
    Effect.provide(Shell.native({ policy: rules })),
  );
  const bindings = [
    Binding.to(NativeThemeData.capability.slot, theme),
    Binding.to(PowerMonitorData.capability.slot, power),
    Binding.to(NotificationData.capability.slot, notifications),
    Binding.to(ClipboardData.capability.slot, paste),
    Binding.to(ShellData.capability.slot, links),
  ] as const;
  void bindings;
  // @ts-expect-error An owner only binds to a slot over its own protocol.
  Binding.to(NotificationData.capability.slot, paste);
}).pipe(Effect.scoped) satisfies Effect.Effect<void, SewedError, MainContext>;

// @ts-expect-error Serving a capability retains the main runtime requirement.
const serveWithoutMain: Effect.Effect<unknown, SewedError, Scope.Scope> = Capability.serve(
  NotificationData.capability,
);
void serveWithoutMain;

// The power monitor is one capability. Its native Layer takes no options and keeps the main
// requirement; the main-only state and events queries above it are untouched.
const powerNative: Layer.Layer<typeof PowerMonitorData.capability, SewedError, MainContext> =
  PowerMonitor.native();
void powerNative;

// @ts-expect-error The native power Layer cannot be built without the main runtime.
const powerNativeWithoutMain: Layer.Layer<typeof PowerMonitorData.capability, SewedError> =
  PowerMonitor.native();
void powerNativeWithoutMain;

// The memory Layer provides the same capability plus its recorder, and needs no runtime at all.
const powerMemory: Layer.Layer<typeof PowerMonitorData.capability | Testing.Recorder, SewedError> =
  Testing.PowerMonitor.memory();
void powerMemory;

// An operation carries no runtime requirement: acquiring the capability is what proved it.
const powerCall = Effect.gen(function* () {
  const power = yield* PowerMonitorData.capability;
  const events: Stream.Stream<PowerMonitorData.Event, SewedError> = power.events();
  const snapshot: Effect.Effect<PowerMonitorData.State, SewedError> = power.state({
    idleThresholdSeconds: 60,
  });
  yield* snapshot;
  return events;
});
const powerProgram: Effect.Effect<
  Stream.Stream<PowerMonitorData.Event, SewedError>,
  SewedError,
  MainContext
> = powerCall.pipe(Effect.provide(powerNative));
void powerProgram;

void Effect.gen(function* () {
  const power = yield* PowerMonitorData.capability;
  // @ts-expect-error The idle threshold is still checked against its schema.
  yield* power.state({ idleThresholdSeconds: "soon" });
});

// @ts-expect-error The removed hosted owner is gone; there is no PowerMonitor.host.
PowerMonitor.host();

// The clipboard is one capability. Its native Layer carries the format policy and keeps the main
// requirement; the main-only read, write, formats, and clear operations above it are untouched.
const clipboardNative: Layer.Layer<typeof ClipboardData.capability, SewedError, MainContext> =
  Clipboard.native(policy);
void clipboardNative;

// @ts-expect-error The native clipboard Layer cannot be built without the main runtime.
const clipboardNativeWithoutMain: Layer.Layer<typeof ClipboardData.capability, SewedError> =
  Clipboard.native(policy);
void clipboardNativeWithoutMain;

// The memory Layer provides the same capability plus its recorder, and needs no runtime at all.
const clipboardMemory: Layer.Layer<typeof ClipboardData.capability | Testing.Recorder, SewedError> =
  Testing.Clipboard.memory(policy);
void clipboardMemory;

// An operation carries no runtime requirement: acquiring the capability is what proved it.
const clipboardCall = Effect.gen(function* () {
  const clipboard = yield* ClipboardData.capability;
  const content: Effect.Effect<ClipboardData.Content | null, SewedError> = clipboard.read({
    format: "text",
  });
  yield* clipboard.write({ content: { kind: "text", text: "copied" } });
  yield* clipboard.formats();
  yield* clipboard.clear();
  return yield* content;
});
const clipboardProgram: Effect.Effect<ClipboardData.Content | null, SewedError, MainContext> =
  clipboardCall.pipe(Effect.provide(clipboardNative));
void clipboardProgram;

void Effect.gen(function* () {
  const clipboard = yield* ClipboardData.capability;
  // @ts-expect-error Clipboard formats stay a closed set through the capability.
  yield* clipboard.read({ format: "files" });
});

// @ts-expect-error The removed hosted owner is gone; there is no Clipboard.host.
Clipboard.host(policy);

// Notifications are one capability. The native Layer takes no options and keeps the main
// requirement; the main-only supported query and scoped show handle above it are untouched.
const notificationNative: Layer.Layer<typeof NotificationData.capability, SewedError, MainContext> =
  Notification.native();
void notificationNative;

// @ts-expect-error The native notification Layer cannot be built without the main runtime.
const notificationNativeWithoutMain: Layer.Layer<typeof NotificationData.capability, SewedError> =
  Notification.native();
void notificationNativeWithoutMain;

// The memory Layer provides the same capability plus its recorder, and needs no runtime at all.
const notificationMemory: Layer.Layer<
  typeof NotificationData.capability | Testing.Recorder,
  SewedError
> = Testing.Notification.memory();
void notificationMemory;

// One request is one notification, and its events carry no runtime requirement of their own.
const notificationCall = Effect.gen(function* () {
  const notifications = yield* NotificationData.capability;
  const events: Stream.Stream<NotificationData.Event, SewedError> = notifications.show({
    title: "Sewed",
  });
  return events;
});
const notificationProgram: Effect.Effect<
  Stream.Stream<NotificationData.Event, SewedError>,
  SewedError,
  MainContext
> = notificationCall.pipe(Effect.provide(notificationNative));
void notificationProgram;

void Effect.gen(function* () {
  const notifications = yield* NotificationData.capability;
  // @ts-expect-error A notification payload is still checked against its schema.
  yield* Stream.runCollect(notifications.show({ title: 1 }));
});

// @ts-expect-error The removed hosted owner is gone; there is no Notification.host.
Notification.host();
