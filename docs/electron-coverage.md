# Electron coverage plan

## Problem

Sewed wraps the process model and the native surfaces a first application meets: application lifecycle, windows and views, web contents, sessions with protocols and downloads, screen, dialogs, menus, tray, global shortcuts, utility processes. Electron 44 exposes 22 main-process modules and about 45 classes; Sewed touches 6 and 13. The rest is reachable only by importing `electron` directly in main, which discards the scoping, the typed errors, and the runtime requirement that make the covered surfaces safe, and which the playground's architecture rule forbids outright.

The goal is complete coverage that reads as one library. That rules out module-by-module wrapping. Every surface must land on one of the shapes Sewed already has, keep Electron types out of the shared contracts, and give renderers the same explicit-binding path that window controls use today. This document fixes those shapes, maps every Electron surface onto them, and orders the work.

## Usage (caller's view)

Main code uses a surface directly. Queries, commands, and streams read like the existing `Tray` and `Screen` code, and a surface with a policy is a capability the composition provides:

```ts
import { Effect, Stream } from "effect";
import { App, NativeTheme, Notification, PowerMonitor, Shell } from "sewed/main";

App.run(
  [],
  Effect.gen(function* () {
    const shell = yield* Shell.capability;
    yield* shell.openExternal({ url: "https://docs.example.com/start" });

    yield* NativeTheme.state.pipe(
      Stream.runForEach((theme) => Effect.log(`dark: ${theme.shouldUseDarkColors}`)),
      Effect.forkScoped,
    );

    const alert = yield* Notification.show({ title: "Export finished", body: "12 files" });
    yield* alert.events.pipe(Stream.take(1), Stream.runDrain, Effect.forkScoped);

    yield* PowerMonitor.events.pipe(
      Stream.filter((event) => event.kind === "suspend"),
      Stream.runForEach(() => Effect.log("suspending")),
      Effect.forkScoped,
    );
  }).pipe(
    Effect.provide(
      Shell.native({ policy: [{ kind: "origin", origin: "https://docs.example.com" }] }),
    ),
  ),
);
```

A renderer never imports Electron. It reaches a surface through a capability main serves, which carries the same policy a main-side call obeys:

```ts
// shared/bindings.ts
import { NativeTheme, Shell, WindowControls } from "sewed";
export const Theme = NativeTheme.capability.slot;
export const Links = Shell.capability.slot;
export const Controls = WindowControls.capability.slot;

// main/app.ts
App.run(
  [],
  Effect.gen(function* () {
    const theme = yield* Capability.serve(NativeTheme.capability).pipe(
      Effect.provide(NativeTheme.native()),
    );
    const links = yield* Capability.serve(Shell.capability).pipe(
      Effect.provide(
        Shell.native({ policy: [{ kind: "origin", origin: "https://docs.example.com" }] }),
      ),
    );
    const window = yield* BrowserWindow.make({ title: "Sewed" });
    const controls = yield* Capability.serve(WindowControls.capability).pipe(
      Effect.provide(WindowControls.native(window)),
    );
    yield* window.webContents.load(Renderer.entry(url, { bindings }), {
      bindings: [
        Binding.to(Theme, theme),
        Binding.to(Links, links),
        Binding.to(Controls, controls),
      ],
    });
  }),
);

// renderer/features/theme/use-theme.ts
const theme = useClient(Theme);
const state = useStream(() => theme.state(), [theme]);
const links = useClient(Links);
const open = useAction((url: string) => links.openExternal({ url }));
```

A worker or a main-owned Effect binds the same owners through `Binding.layer`. Nothing about a surface changes with the runtime that calls it; only the owner selection does.

## Shape

### The nine shapes

Every Electron surface becomes one or more of these. The exemplar column names code that already exists, so an implementer copies a shape rather than inventing one.

| Shape              | Type                                                                    | Rules                                                                                                                                                    | Exemplar                                                   |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Query              | `Effect<Data, SewedError, MainContext>`                                 | Validated input, copied output, `Native` on failure                                                                                                      | `Screen.displays`                                          |
| Command            | `Effect<void, SewedError, MainContext>`                                 | Schema-decoded input, `Protocol` on invalid input                                                                                                        | `Session.clearStorage`                                     |
| Observation stream | `Stream<Event, SewedError, MainContext>`                                | One listener and one bounded queue per observer, overflow fails that observer with `Limit`, no replay                                                    | `Screen.changes`, `App.activations`                        |
| State stream       | `Stream<State, SewedError, MainContext>`                                | Replays the current value, retains a small backlog, observers skip superseded states                                                                     | `window.state`, `webContents.state`                        |
| Scoped resource    | `make(options)` requiring `MainContext` and `Scope`, returning a handle | Scope closure destroys the native object, late access fails with `Closed`, never recreated                                                               | `Tray.make`, `Download.start`                              |
| App-lived handle   | `acquire` in `MainContext` returning an opaque handle                   | Identity only, no scoped destruction, settings replaced atomically                                                                                       | `Session.fromPartition`                                    |
| Policy             | A root schema of rules a decidable's decider is compiled from           | Rules are data, decoded before installation, and a policy grants: it passes on what it does not match                                                    | `Permission.Policy`, `Navigation.Policy`                   |
| Decidable          | A declared native question resolved by one owner                        | Declared once in `Decidables`, inert; a decider installs on its owner for a scope, and its own composition combines several                              | `Decidables.Window.Close`, `Decidables.Session.Permission` |
| Capability         | `Capability.define(name, protocol)` with a `native` Layer               | One contract per surface: `native` runs in process and carries the policy, `client` reaches it over a binding, `serve` makes the layer in scope an owner | `Shell.capability`, `WindowControls.capability`            |

### Module layout

Each surface is one root module and one main module with the same name, plus the two modules its capability needs:

- `packages/sewed/src/<Surface>.ts` holds only schemas, types, the `protocol` RPC group, and `capability`. It imports nothing from Electron, so shared contract files and renderers can import it. The root entry exports it as a namespace.
- `packages/sewed/src/internal/<Surface>Policy.ts` holds the surface's rules: a `Core<R>` interface for whatever supplies the platform, and an `operations` function that checks the rules once and returns operations over that core. It imports nothing from Electron, so both layers of the capability and a Node test run the same rules.
- `packages/sewed/src/internal/<Surface>.ts` supplies the Electron core, exports `native`, and re-exports the root schemas so main code needs one import path. The main entry exports it under the same name.
- `packages/sewed/src/internal/<Surface>Memory.ts` supplies a stand-in core and exports `memory` through `sewed/testing`. A per-owner surface has none, because its `native` takes the owner as an argument and imports no Electron, so a test supplies the owner itself.
- Surfaces that extend an existing handle extend that handle instead of adding a namespace: web contents extras hang off `window.webContents`, session extras off `Session`, window extras off the window handle and `WindowControls.protocol`.

Names follow Electron's module names, so a reader who knows Electron finds the surface: `NativeTheme`, `PowerMonitor`, `SafeStorage`, `Shell`, `Clipboard`, `Notification`. Sewed keeps its own names only where it already deviates.

### Invariants encoded in types and where validation lives

- Placement is a requirement, per boundary-discipline: every operation requires `MainContext`; the compiler rejects it in renderers and workers, and the renderer path is the served capability.
- Inputs are parsed at the boundary: every payload is a root schema decoded before Electron sees it, and every output is copied into a schema type. Electron objects never cross into the shared contracts, per boundary-discipline.
- Errors are one type: `SewedError` with `Closed`, `Protocol`, `Limit`, `Startup`, `Native`, and the native cause retained.
- Lifetimes are scopes: a native object exists exactly while its acquiring scope is open, per the existing API contract. Observation streams own their listeners and queues. Nothing is recreated behind the application.
- Policies are data: anything that lets a renderer reach outside the application, such as opening a URL, writing the clipboard, or reading cookies, is gated by a schema policy that main installs when it creates the owner. Deny is the default.
- Native questions are decidables: every event Electron asks the application about is declared once in `Decidables`, answered by deciders a feature installs on the event's own owner for a scope, and combined by the composition the decidable declares. A decider installed on another owner is a compile error. See [the decision model](native-policy.md).
- Secrets are `Redacted`: `SafeStorage` takes and returns `Redacted<string>` so plaintext never prints in logs or diagnostics.

### What the surface hides

The capability is the load-bearing decision. One contract per surface hides the transport, the policy check, the schema validation, request scoping, and diagnostics, so a renderer feature is one `useClient` call. Main code calls the same contract through its native layer, which dispatches in process and pays no RPC cost. Both layers of a capability carry the same policy, so a rule holds regardless of which runtime asks.

The library deliberately does not expose Electron callbacks, event emitters, native image objects, or `webRequest` closures. It does not wrap deprecated surfaces. It does not add a generic escape hatch; the escape hatch is importing `electron` in main, which stays possible and stays outside the library's guarantees.

### Type sketch for the first wave

Bodies are not implemented; signatures and rules are the contract.

```ts
// sewed (root): Shell.ts
export const Policy = Schema.Array(UrlRule.Rule);
export const OpenResult = Schema.Struct({ opened: Schema.Boolean, message: Schema.String });
export const protocol = RpcGroup.make(
  Rpc.make("openExternal", { payload: { url: Schema.String }, error: SewedError }),
  Rpc.make("openPath", {
    payload: { path: Schema.String },
    success: OpenResult,
    error: SewedError,
  }),
  Rpc.make("showItemInFolder", { payload: { path: Schema.String }, error: SewedError }),
  Rpc.make("trashItem", { payload: { path: Schema.String }, error: SewedError }),
  Rpc.make("beep", { payload: {}, error: SewedError }),
);
export interface Options {
  readonly policy: Shell.Policy; // origins, documents, mailto, and match patterns openExternal may reach; deny by default
  readonly paths?: readonly string[]; // absolute roots openPath, showItemInFolder, trashItem may touch
}
export const capability = Capability.define("shell", protocol);

// sewed/main: internal/Shell.ts
// The policy travels with this Layer, so a served renderer call obeys the rules a main call does.
export const native: (
  options: Shell.Options,
) => Layer<typeof Shell.capability, SewedError, MainContext>;

// sewed/testing: internal/ShellMemory.ts
export const memory: (
  options: Shell.Options,
) => Layer<typeof Shell.capability | Testing.Recorder, SewedError>;
```

```ts
// sewed (root): NativeTheme.ts
export const Source = Schema.Literals(["system", "light", "dark"]);
export const State = Schema.Struct({
  source: Source,
  shouldUseDarkColors: Schema.Boolean,
  shouldUseHighContrastColors: Schema.Boolean,
  shouldUseInvertedColorScheme: Schema.Boolean,
  inForcedColorsMode: Schema.Boolean,
  prefersReducedTransparency: Schema.Boolean,
});
export const protocol = RpcGroup.make(
  Rpc.make("state", { success: State, stream: true, error: SewedError }),
  Rpc.make("setSource", { payload: { source: Source }, error: SewedError }),
);

// sewed/main: internal/NativeTheme.ts
export const state: Stream<NativeTheme.State, SewedError, MainContext>; // replays, follows `updated`
export const current: Effect<NativeTheme.State, SewedError, MainContext>;
export const setSource: (source: NativeTheme.Source) => Effect<void, SewedError, MainContext>;
export const native: (options?: {
  readonly allowSetSource?: boolean;
}) => Layer<typeof NativeTheme.capability, SewedError, MainContext>;
```

```ts
// sewed (root): PowerMonitor.ts
export const Event = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("suspend") }),
  Schema.Struct({ kind: Schema.Literal("resume") }),
  Schema.Struct({ kind: Schema.Literal("power-source"), onBattery: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("screen"), locked: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("user"), active: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("shutdown") }),
  Schema.Struct({
    kind: Schema.Literal("thermal"),
    state: Schema.Literals(["unknown", "nominal", "fair", "serious", "critical"]),
  }),
  Schema.Struct({ kind: Schema.Literal("speed-limit"), limit: Schema.Finite }),
]);
export const State = Schema.Struct({
  onBattery: Schema.Boolean,
  idleSeconds: Schema.Finite,
  idleState: Schema.Literals(["active", "idle", "locked", "unknown"]),
  thermal: Schema.Literals(["unknown", "nominal", "fair", "serious", "critical"]),
});
export const protocol = RpcGroup.make(
  Rpc.make("state", {
    payload: { idleThresholdSeconds: Schema.Finite },
    success: State,
    error: SewedError,
  }),
  Rpc.make("events", { success: Event, stream: true, error: SewedError }),
);

// sewed/main: internal/PowerMonitor.ts
export const state: (
  idleThresholdSeconds: number,
) => Effect<PowerMonitor.State, SewedError, MainContext>;
export const events: Stream<PowerMonitor.Event, SewedError, MainContext>; // observation stream
export const native: () => Layer<typeof PowerMonitor.capability, SewedError, MainContext>;
```

```ts
// sewed (root): Notification.ts
export const Options = Schema.Struct({
  title: Schema.String,
  body: Schema.optionalKey(Schema.String),
  subtitle: Schema.optionalKey(Schema.String),
  silent: Schema.optionalKey(Schema.Boolean),
  urgency: Schema.optionalKey(Schema.Literals(["normal", "critical", "low"])),
  timeout: Schema.optionalKey(Schema.Literals(["default", "never"])),
  icon: Schema.optionalKey(Schema.String), // absolute path, like Tray.Icon
  actions: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Schema.String, text: Schema.String })),
  ),
  reply: Schema.optionalKey(Schema.Struct({ placeholder: Schema.String })),
});
export const Event = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("shown") }),
  Schema.Struct({ kind: Schema.Literal("clicked") }),
  Schema.Struct({ kind: Schema.Literal("action"), id: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("replied"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("closed") }),
  Schema.Struct({ kind: Schema.Literal("failed"), message: Schema.String }),
]);
export const protocol = RpcGroup.make(
  // One request is one notification: the stream ends when it closes, and interrupting the
  // request closes it. Request scoping is the resource lifetime, as with Remote leases.
  Rpc.make("show", { payload: Options, success: Event, stream: true, error: SewedError }),
);

// sewed/main: internal/Notification.ts
export const supported: Effect<boolean, SewedError, MainContext>;
export const show: (
  options: Notification.Options,
) => Effect<Handle, SewedError, MainContext | Scope>;
export interface Handle {
  readonly events: Stream<Notification.Event, SewedError, MainContext>; // finishes on close
  readonly close: Effect<void, SewedError, MainContext>;
}
export const native: () => Layer<typeof Notification.capability, SewedError, MainContext>;
```

```ts
// sewed (root): Clipboard.ts
export const Format = Schema.Literals(["text", "html", "rtf", "image", "bookmark"]);
export const Content = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("html"),
    html: Schema.String,
    text: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal("rtf"), rtf: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("image"), png: Binary.Bytes }),
  Schema.Struct({ kind: Schema.Literal("bookmark"), title: Schema.String, url: Schema.String }),
]);
export const Policy = Schema.Struct({ read: Schema.Array(Format), write: Schema.Array(Format) });
export const protocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("read", {
      payload: { format: Format },
      success: Schema.NullOr(Content),
      error: SewedError,
    }),
    Rpc.make("write", { payload: { content: Content }, error: SewedError }),
    Rpc.make("formats", { success: Schema.Array(Format), error: SewedError }),
    Rpc.make("clear", { error: SewedError }),
  ),
);

// sewed/main: internal/Clipboard.ts
export const read: (
  format: Clipboard.Format,
) => Effect<Clipboard.Content | null, SewedError, MainContext>;
export const write: (content: Clipboard.Content) => Effect<void, SewedError, MainContext>;
export const formats: Effect<readonly Clipboard.Format[], SewedError, MainContext>;
export const clear: Effect<void, SewedError, MainContext>;
export const native: (
  policy: Clipboard.Policy,
) => Layer<typeof Clipboard.capability, SewedError, MainContext>;
```

```ts
// sewed (root): SafeStorage.ts
export const Availability = Schema.Struct({
  available: Schema.Boolean,
  backend: Schema.String, // Electron's selected backend name, informational
});
// No protocol: ciphertext and plaintext stay in main. Applications that need renderer access
// wrap it in their own host with their own contract.

// sewed/main: internal/SafeStorage.ts
export const availability: Effect<SafeStorage.Availability, SewedError, MainContext>;
export const encrypt: (value: Redacted<string>) => Effect<Uint8Array, SewedError, MainContext>; // Native when unavailable
export const decrypt: (bytes: Uint8Array) => Effect<Redacted<string>, SewedError, MainContext>;
```

### Definition of done for one surface

1. Root module with schemas, types, and `protocol`, and a contract test proving the root import creates no native object and imports no Electron module.
2. Main module with the operations in the shapes above, re-exporting the root schemas.
3. Errors mapped to the five codes with the native cause kept.
4. A capability with its policy, where the catalog says one exists: a `native` Layer that carries the rules, and either a `memory` Layer for an ambient surface or a structural owner a Node test supplies for a per-owner one.
5. A paragraph in `docs/api.md`, a surface document or a section in an existing one, the README line, and the regenerated reference.
6. A playground fixture `verify:<surface>` with recorded evidence for the native behavior, and a playground feature when the surface has a visible UI.

## Catalog

Wave numbers order the work; the shapes say what to copy. "Owner" marks a surface the library ships as a capability.

| Electron surface                                                                                                                                                                 | Sewed home                                                                                                            | Shapes                                                          | Owner                                                     | Wave    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | ------- |
| `shell`                                                                                                                                                                          | `Shell`                                                                                                               | policy, command, capability                                     | yes, URL and path policy                                  | 1       |
| `clipboard`                                                                                                                                                                      | `Clipboard`                                                                                                           | query, command, policy, capability                              | yes, read and write formats                               | 1       |
| `nativeTheme`                                                                                                                                                                    | `NativeTheme`                                                                                                         | state stream, command, capability                               | yes, set-source gated                                     | 1       |
| `Notification`                                                                                                                                                                   | `Notification`                                                                                                        | scoped resource, observation stream, capability                 | yes, one notification per request                         | 1       |
| `powerMonitor`                                                                                                                                                                   | `PowerMonitor`                                                                                                        | query, observation stream, capability                           | yes                                                       | 1       |
| `safeStorage`                                                                                                                                                                    | `SafeStorage`                                                                                                         | query, command with `Redacted`                                  | no, by design                                             | 1       |
| `webContents` print, `printToPDF`, `capturePage`                                                                                                                                 | `window.webContents.print`, `pdf`, `capture`                                                                          | command, query returning `Binary.Bytes`                         | no                                                        | 2       |
| `webContents` zoom, audio mute, user agent                                                                                                                                       | `window.webContents.zoom`, `audio`, `userAgent`                                                                       | state stream, command                                           | in `WindowControls.protocol`                              | 2       |
| `webContents.findInPage`                                                                                                                                                         | `window.webContents.find`                                                                                             | scoped resource whose stream ends the search                    | in `WindowControls.protocol`                              | 2       |
| `webContents.insertCSS`, `executeJavaScript`                                                                                                                                     | `window.webContents.style`                                                                                            | scoped resource; script injection is not offered                | no                                                        | 2       |
| `NavigationHistory`                                                                                                                                                              | `window.webContents.history`                                                                                          | state stream, command                                           | in `WindowControls.protocol`                              | 2       |
| `BrowserWindow` extras: title, icon, always on top, opacity, resizable and friends, progress bar, overlay icon, flash, menu bar visibility, content protection, parent and modal | window handle                                                                                                         | command, state stream fields                                    | in `WindowControls.protocol` where renderer use is common | 2       |
| `View`, `ImageView`                                                                                                                                                              | `WebContentsView` siblings                                                                                            | scoped resource, attach                                         | no                                                        | 2       |
| `session.cookies`                                                                                                                                                                | `session.cookies`                                                                                                     | query, command, observation stream, policy by origin            | yes                                                       | 3       |
| `session.webRequest`                                                                                                                                                             | `session.intercept(decidable, filter, decider)`                                                                       | three decidables, each scoped by its own filter                 | no                                                        | 3       |
| `session.setProxy`, `resolveProxy`                                                                                                                                               | `Session.setProxy`, `resolveProxy`                                                                                    | command, query                                                  | no                                                        | 3       |
| spellchecker, cache, user agent, download path                                                                                                                                   | `Session.*`                                                                                                           | command, query                                                  | no                                                        | 3       |
| `setCertificateVerifyProc`, device and display-media handlers                                                                                                                    | `Decidables.Session.Permission` (device), `.Certificate`, `.DisplayMedia`, via `session.decide`                       | decidable                                                       | no                                                        | 3       |
| `session.preconnect`                                                                                                                                                             | `Decidables.Session.Preconnect`, via `session.decide`                                                                 | decidable                                                       | no                                                        | 3       |
| `session.extensions`                                                                                                                                                             | `Session.loadExtension`                                                                                               | scoped resource                                                 | no                                                        | 3       |
| `session.serviceWorkers`                                                                                                                                                         | `Session.serviceWorkers`                                                                                              | query, observation stream                                       | no                                                        | 3       |
| `app` paths, name, version, locale, GPU info                                                                                                                                     | `App.info`, `App.paths`                                                                                               | query                                                           | no                                                        | 4       |
| `app` login items, badge, about panel, default protocol client, secure keyboard entry                                                                                            | `App.*`                                                                                                               | command, query                                                  | no                                                        | 4       |
| `app.commandLine`, `app.setAppUserModelId`                                                                                                                                       | `CommandLine.declare`, `App.declare`                                                                                  | declaration, before ready                                       | no                                                        | 4       |
| `app` window focus and blur, child process gone, web contents created                                                                                                            | `App.windowFocus`, `App.childProcesses`                                                                               | observation stream                                              | no                                                        | 4       |
| `app` certificate error and HTTP login prompts                                                                                                                                   | `Decidables.App.CertificateError`, `.Login`, via `App.decide`                                                         | decidable                                                       | no                                                        | 4       |
| `Dock`, user tasks, jump list                                                                                                                                                    | `App.dock`, `App.taskbar`                                                                                             | command, platform-gated with `Native` elsewhere                 | no                                                        | 4       |
| `powerSaveBlocker`                                                                                                                                                               | `PowerSaveBlocker.hold(kind)`                                                                                         | scoped resource                                                 | no                                                        | 5       |
| `netLog`, `contentTracing`                                                                                                                                                       | `Diagnostics.netLog`, `Diagnostics.trace`                                                                             | scoped resource writing to a path                               | no                                                        | 5       |
| `net`, `ClientRequest`, `WebSocket`                                                                                                                                              | `Net.layer` providing Effect's `HttpClient` over `net.fetch`                                                          | Layer                                                           | no                                                        | 5       |
| `systemPreferences`                                                                                                                                                              | `SystemPreferences`                                                                                                   | query, observation stream                                       | no                                                        | 6       |
| `desktopCapturer`                                                                                                                                                                | `Session` display media policy plus `DesktopCapturer.sources`                                                         | query, policy                                                   | no                                                        | 6       |
| `TouchBar` family                                                                                                                                                                | `TouchBar` schema, `window.touchBar.set`                                                                              | data, command, observation stream for interactions              | no                                                        | 6       |
| `ShareMenu`                                                                                                                                                                      | `window.menu.share`                                                                                                   | command                                                         | no                                                        | 6       |
| `inAppPurchase`, `pushNotifications`                                                                                                                                             | `Store`, `PushNotifications`                                                                                          | query, command, observation stream                              | no                                                        | 6       |
| `webUtils.getPathForFile`                                                                                                                                                        | `Renderer.pathOf(file)` through the preload bridge                                                                    | renderer query                                                  | n/a                                                       | 2       |
| `WebContents` hosting a page the application does not own: pattern navigation, `will-download` veto, `executeJavaScript`, `debugger`, `sendInputEvent`                           | `GuestView`                                                                                                           | scoped resource, policy, observation stream, capability         | yes, navigate and capture gated                           | 7       |
| `app.requestSingleInstanceLock`, `releaseSingleInstanceLock`, `second-instance`                                                                                                  | `App.claimInstance`                                                                                                   | scoped resource                                                 | no                                                        | 13      |
| `protocol.registerSchemesAsPrivileged`                                                                                                                                           | `Protocol.declare`                                                                                                    | declaration, before ready                                       | no                                                        | 13      |
| `app.disableHardwareAcceleration`                                                                                                                                                | `Gpu.declare`                                                                                                         | declaration, before ready                                       | no                                                        | 13      |
| `app.setPath` before ready                                                                                                                                                       | `Paths.declare`                                                                                                       | declaration, before ready                                       | no                                                        | 13      |
| `autoUpdater`                                                                                                                                                                    | `@sewed/forge`'s `Updater.make`, `githubFeed`                                                                         | scoped resource, observation stream, query, command             | no                                                        | Shipped |
| `crashReporter`                                                                                                                                                                  | `CrashReporter.declare` (start), `lastReport`, `uploadedReports`, `uploadToServer`, `setUploadToServer`, `parameters` | declaration, query, command                                     | no                                                        | 13      |
| `MessagePortMain`'s 256 KiB envelope, renderer to main                                                                                                                           | `Binary.bulk(rpc, { field, maxBytes })`                                                                               | declared field bound, client-fragmented request, owner assembly | no                                                        | 14      |
| `app.exit`                                                                                                                                                                       | `App.exit(code)`                                                                                                      | command, after the application scope closes                     | no                                                        | 15      |
| `app.getPreferredSystemLanguages`                                                                                                                                                | `App.preferredSystemLanguages()`                                                                                      | query, synchronous, before ready                                | no                                                        | 15      |
| no Electron API of its own; a path chosen after `shell`'s roots were configured                                                                                                  | `Shell.Grants`, provided beside the shell capability                                                                  | scoped resource, policy                                         | no                                                        | 15      |
| `app.getAppPath` (before ready)                                                                                                                                                  | `App.appPath()`                                                                                                       | query, synchronous, before ready                                | no                                                        | 16      |
| `app.getPath` (before ready)                                                                                                                                                     | `App.defaultPath(name)`                                                                                               | query, synchronous, before ready                                | no                                                        | 16      |
| `dialog.showErrorBox`                                                                                                                                                            | `App.showErrorBox({ title, content })`                                                                                | command, synchronous, no window                                 | no                                                        | 16      |
| `app.exit` (forced, no finalizer)                                                                                                                                                | `App.terminate(code)`                                                                                                 | command, running nothing                                        | no                                                        | 16      |
| no Electron API of its own; the `electron` package's own binary, resolved for a launcher                                                                                         | `resolveElectron({ cwd?, electronPath? })` (`@sewed/vite`)                                                            | resolver function, before Electron starts                       | no                                                        | 16      |
| `webContents`'s `did-navigate` `httpResponseCode`                                                                                                                                | `window.webContents.state`'s `ready.httpStatus`                                                                       | state stream field                                              | no                                                        | 18      |
| `webContents.capturePage`'s and a guest tab's own image size                                                                                                                     | `WebContents.Capture` (`window.webContents.capture`, a guest tab's `capture`)                                         | query returning a struct                                        | no                                                        | 18      |
| `nativeImage` decode, resize, encode                                                                                                                                             | `Image.decode`, `resize`, `encode` (`sewed/main`); `Image.Bitmap`, `Layer`, `compose` (`sewed`)                       | inert schema, pure function, query                              | no                                                        | 18      |
| `MenuItemConstructorOptions.role`, every role but `shareMenu`, and a submenu carrying one                                                                                        | `Menu.Role.role`, `Menu.ApplicationSubmenu.role`                                                                      | inert schema, command                                           | no                                                        | 19      |
| `Dock.setIcon`                                                                                                                                                                   | `App.dock.setIcon`                                                                                                    | command, platform-gated with `Native` elsewhere                 | no                                                        | 19      |
| permission check/request handlers' `mediaType`/`mediaTypes`                                                                                                                      | `Decidables.Session.Permission`'s `mediaTypes`, `Permission.Rule.mediaTypes`                                          | decidable event field, policy rule                              | no                                                        | 19      |
| `OpenDialogOptions.properties`, `SaveDialogOptions.properties`                                                                                                                   | `Dialog.OpenOptions.properties`, `Dialog.SaveOptions.properties`                                                      | forwarded flags                                                 | no                                                        | 19      |
| `BaseWindow.setSimpleFullScreen`, `isSimpleFullScreen`                                                                                                                           | window handle `setSimpleFullScreen`, `WindowControls.State.simpleFullScreen`                                          | command, state stream field                                     | in `WindowControls.protocol`                              | 19      |
| `Tray`'s `NativeImage \| string` icon, `setTemplateImage`                                                                                                                        | `Tray.Options.icon`, `setImage(icon, { template? })`                                                                  | scoped resource option, command                                 | no                                                        | 19      |
| `webContents`'s `page-title-updated`                                                                                                                                             | `window.webContents.title`, `guest.webContents.title`                                                                 | state stream                                                    | in `Decidables.WebContents.TitleUpdate`                   | 20      |
| `NavigationHistory.goToIndex`, settled                                                                                                                                           | `window.webContents.back`, `forward`, `go` (`WebContents.Settled`)                                                    | command, awaits the navigation it started                       | in `WindowControls.protocol`                              | 20      |
| `View.addChildView` reordering an already-attached view to the top                                                                                                               | `attachment.raise`                                                                                                    | command                                                         | no                                                        | 20      |
| `session.fromPartition`'s own native key, unmapped                                                                                                                               | `Session.fromPartition({ mapping: "raw" })`                                                                           | option                                                          | no                                                        | 20      |
| `session.protocol.handle`'s own `(Request) => Response \| Promise<Response>` shape                                                                                               | `Protocol.handleWeb`                                                                                                  | scoped resource, web-shaped handler                             | no                                                        | 20      |
| `BrowserView`                                                                                                                                                                    | none, deprecated in favor of `WebContentsView`                                                                        |                                                                 |                                                           | never   |
| `ipcMain`, `MessageChannelMain`, `MessagePortMain`, `contextBridge`, `webFrameMain`                                                                                              | internal transport                                                                                                    |                                                                 |                                                           | never   |
| `webFrame`, `sharedTexture`                                                                                                                                                      | none, renderer or GPU internals                                                                                       |                                                                 |                                                           | never   |

## Waves

1. **Universal desktop.** Shell, Clipboard, NativeTheme, Notification, PowerMonitor, SafeStorage. Six namespaces, five owners. This is what every application asks for in its first week and it exercises every shape once, so it also proves the conventions before the larger waves.
2. **Window and web contents extras.** Grows the window handle and `WindowControls.protocol`; adds print, capture, find, history, zoom, audio, and the generic views. Mostly commands and state fields on existing handles.
3. **Session extras.** Cookies with an origin policy, request interception with Effect deciders, proxy, spellchecker, cache, certificates, extensions, service workers. The interception design is the one piece here that needs its own sketch before code.
4. **Application extras.** Queries and commands on `App`, declarations that must precede readiness, and the remaining application events.
5. **Operations.** Power save blocker, logging and tracing, and networking as an Effect `HttpClient` layer. Updates and crash reporting belong to a future Electron Forge bindings package.
6. **Platform specific.** System preferences, desktop capture, Touch Bar, share menu, store and push surfaces, each failing with `Native` on other platforms rather than being absent from the types.
7. **Guest views.** A distinct view kind for pages the application does not own, with body-aware interception on the session; see [Guest views](guest-views.md).

Each wave ships as its own set of commits, one surface per commit, with the playground fixture in the same change. A wave is complete when the catalog rows for it meet the definition of done and the playground's full harness passes on the isolated display.

## Synthesis decision

Two whole-shape candidates were compared. The chosen shape is the hybrid: direct Effects in main plus a hosted owner per surface over a root protocol. It was adapted from the "namespace per Electron module" candidate, which supplied the module layout and the direct main-side API, and from the "everything is an owner" candidate, which supplied the uniform renderer path and the policy-at-creation rule. Rejected from the second candidate: routing main-side calls through RPC, which would serialize every call and forbid native handles in main for no benefit.

## Tradeoffs accepted

- We accept two entry points per surface, root schemas and main operations, in exchange for shared contracts that never import Electron.
- We accept one hosted owner per surface, each a thin adapter, in exchange for a renderer path that is one binding and one hook, with policy and diagnostics included.
- We accept that policies deny by default and must be spelled out, in exchange for renderers that cannot reach outside the application by omission.
- We accept copying every native value into schema types, in exchange for outputs that survive the transport and never leak Electron objects.
- We accept that platform-specific surfaces exist in the types on every platform and fail with `Native` elsewhere, in exchange for one contract per application rather than per platform.
- We accept not offering `executeJavaScript` or `webRequest` closures, in exchange for keeping renderer isolation and request policy as data.

## Alternatives considered

- **Namespace per Electron module, renderer access left to applications.** The status quo extended. Small library surface, but every application rewrites the same host protocols for theme, clipboard, and links, and policy lives in application code where it is inconsistent. Lost on interface depth: it hides less and pushes the repeated work to callers.
- **Everything is an owner.** Every surface exists only as `Binding.Owner` over a protocol, and main code binds it like a renderer. One mechanism, complete uniformity, but main-side calls pay serialization, native handles cannot be returned, and the ceremony of `Binding.layer` for a single `shell.openExternal` is disproportionate. Lost on main ergonomics.
- **A generic escape hatch such as `Native.use((electron) => ...)`.** Would cover everything in one afternoon and guarantee nothing: no scoping, no policy, no typed errors, and Electron types in application code. Rejected as not being coverage.

## Decisions

Resolved with one lens: the most performant, scalable, extensible, and future-proof option.

1. Every surface with common renderer use ships a hosted owner. One binding and one hook per surface scales across features, and the owner carries its policy, so applications compose owners instead of rewriting host protocols.
2. `Shell.openExternal` is gated by a URL-rule allowlist and the clipboard by format lists. Policies are data, deny by default, and extend without API changes.
3. `SafeStorage` stays main-only with `Redacted` plaintext, and ciphertext is an opaque `Sealed` schema that records the backend, so stored secrets stay attributable across backend changes and can travel through application contracts.
4. `net` is covered as an Effect `HttpClient` layer over `net.fetch`, which keeps application code on the Effect client while gaining Chromium's proxy and cookie handling.
5. `webRequest` accepts Effect deciders per filter, fenced to a filter plus a decision schema; declarative rules are a special case of a decider.
6. Updates and crash reporting are out of scope; they belong to a future Electron Forge bindings package.
7. The preload bridge gains `pathOf(file)` in wave two, because file drag and drop is core desktop behavior and the path of a user-chosen file is the user's own disclosure.
8. Electron's module names are used throughout.

Risks: wave 2 touches the window handle that every fixture exercises, so it needs the isolated-display harness green before and after each surface; wave 3's interception design can absorb arbitrary complexity if it is not fenced to filters plus decisions.

## Status

Every wave in the catalog has shipped. `CHANGELOG.md` at the repository root records what each one added.

### Backpressure verification

The stalled-consumer regression in `packages/sewed/test/binary.test.ts` waits for the producer count to remain unchanged across consecutive event-loop turns, then verifies that a second quiescence observation has the same count. It also checks that production stays bounded, an independent RPC remains usable, and cancellation finalizes the stalled producer. Fixed wall-clock sleeps are no longer its settling condition. The event-loop observation is a bounded regression check, not a throughput or capacity measurement.

## Next implementation step

The catalog is covered. The Electron Forge bindings package shipped as `@sewed/forge` with the updater, crash reporter, and configuration helper; see [Electron Forge bindings](forge.md). Forge packaging was exercised on Linux: a scaffolded application packaged through `makeConfig` and the packaged binary passed the scaffold smoke probe, which is why the template ships pnpm's hoisted linker, the exotic dependency allowance, and the zip library override. What remains is platform runs on macOS and Windows for wave six, the updater, and the platform makers. The request observation tap, the scoped login decider, the shared observation helpers, and the playground's adoption of hosted surfaces shipped.
