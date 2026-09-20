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
  readonly policy: Shell.Policy; // origins and documents openExternal may reach; deny by default
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
  Schema.Struct({ kind: Schema.Literal("speed-limit"), limit: Schema.Number }),
]);
export const State = Schema.Struct({
  onBattery: Schema.Boolean,
  idleSeconds: Schema.Number,
  idleState: Schema.Literals(["active", "idle", "locked", "unknown"]),
  thermal: Schema.Literals(["unknown", "nominal", "fair", "serious", "critical"]),
});
export const protocol = RpcGroup.make(
  Rpc.make("state", {
    payload: { idleThresholdSeconds: Schema.Number },
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

| Electron surface                                                                                                                                                                 | Sewed home                                                                                      | Shapes                                                  | Owner                                                     | Wave  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- | ----- |
| `shell`                                                                                                                                                                          | `Shell`                                                                                         | policy, command, capability                             | yes, URL and path policy                                  | 1     |
| `clipboard`                                                                                                                                                                      | `Clipboard`                                                                                     | query, command, policy, capability                      | yes, read and write formats                               | 1     |
| `nativeTheme`                                                                                                                                                                    | `NativeTheme`                                                                                   | state stream, command, capability                       | yes, set-source gated                                     | 1     |
| `Notification`                                                                                                                                                                   | `Notification`                                                                                  | scoped resource, observation stream, capability         | yes, one notification per request                         | 1     |
| `powerMonitor`                                                                                                                                                                   | `PowerMonitor`                                                                                  | query, observation stream, capability                   | yes                                                       | 1     |
| `safeStorage`                                                                                                                                                                    | `SafeStorage`                                                                                   | query, command with `Redacted`                          | no, by design                                             | 1     |
| `webContents` print, `printToPDF`, `capturePage`                                                                                                                                 | `window.webContents.print`, `pdf`, `capture`                                                    | command, query returning `Binary.Bytes`                 | no                                                        | 2     |
| `webContents` zoom, audio mute, user agent                                                                                                                                       | `window.webContents.zoom`, `audio`, `userAgent`                                                 | state stream, command                                   | in `WindowControls.protocol`                              | 2     |
| `webContents.findInPage`                                                                                                                                                         | `window.webContents.find`                                                                       | scoped resource whose stream ends the search            | in `WindowControls.protocol`                              | 2     |
| `webContents.insertCSS`, `executeJavaScript`                                                                                                                                     | `window.webContents.style`                                                                      | scoped resource; script injection is not offered        | no                                                        | 2     |
| `NavigationHistory`                                                                                                                                                              | `window.webContents.history`                                                                    | state stream, command                                   | in `WindowControls.protocol`                              | 2     |
| `BrowserWindow` extras: title, icon, always on top, opacity, resizable and friends, progress bar, overlay icon, flash, menu bar visibility, content protection, parent and modal | window handle                                                                                   | command, state stream fields                            | in `WindowControls.protocol` where renderer use is common | 2     |
| `View`, `ImageView`                                                                                                                                                              | `WebContentsView` siblings                                                                      | scoped resource, attach                                 | no                                                        | 2     |
| `session.cookies`                                                                                                                                                                | `session.cookies`                                                                               | query, command, observation stream, policy by origin    | yes                                                       | 3     |
| `session.webRequest`                                                                                                                                                             | `session.intercept(decidable, filter, decider)`                                                 | three decidables, each scoped by its own filter         | no                                                        | 3     |
| `session.setProxy`, `resolveProxy`                                                                                                                                               | `Session.setProxy`, `resolveProxy`                                                              | command, query                                          | no                                                        | 3     |
| spellchecker, cache, user agent, download path                                                                                                                                   | `Session.*`                                                                                     | command, query                                          | no                                                        | 3     |
| `setCertificateVerifyProc`, device and display-media handlers                                                                                                                    | `Decidables.Session.Permission` (device), `.Certificate`, `.DisplayMedia`, via `session.decide` | decidable                                               | no                                                        | 3     |
| `session.preconnect`                                                                                                                                                             | `Decidables.Session.Preconnect`, via `session.decide`                                           | decidable                                               | no                                                        | 3     |
| `session.extensions`                                                                                                                                                             | `Session.loadExtension`                                                                         | scoped resource                                         | no                                                        | 3     |
| `session.serviceWorkers`                                                                                                                                                         | `Session.serviceWorkers`                                                                        | query, observation stream                               | no                                                        | 3     |
| `app` paths, name, version, locale, GPU info                                                                                                                                     | `App.info`, `App.paths`                                                                         | query                                                   | no                                                        | 4     |
| `app` login items, badge, about panel, default protocol client, secure keyboard entry                                                                                            | `App.*`                                                                                         | command, query                                          | no                                                        | 4     |
| `app.commandLine`, `app.setAppUserModelId`                                                                                                                                       | `App.run` options, before ready                                                                 | startup option                                          | no                                                        | 4     |
| `app` window focus and blur, child process gone, web contents created                                                                                                            | `App.windowFocus`, `App.childProcesses`                                                         | observation stream                                      | no                                                        | 4     |
| `app` certificate error and HTTP login prompts                                                                                                                                   | `Decidables.App.CertificateError`, `.Login`, via `App.decide`                                   | decidable                                               | no                                                        | 4     |
| `Dock`, user tasks, jump list                                                                                                                                                    | `App.dock`, `App.taskbar`                                                                       | command, platform-gated with `Native` elsewhere         | no                                                        | 4     |
| `powerSaveBlocker`                                                                                                                                                               | `PowerSaveBlocker.hold(kind)`                                                                   | scoped resource                                         | no                                                        | 5     |
| `netLog`, `contentTracing`                                                                                                                                                       | `Diagnostics.netLog`, `Diagnostics.trace`                                                       | scoped resource writing to a path                       | no                                                        | 5     |
| `net`, `ClientRequest`, `WebSocket`                                                                                                                                              | `Net.layer` providing Effect's `HttpClient` over `net.fetch`                                    | Layer                                                   | no                                                        | 5     |
| `systemPreferences`                                                                                                                                                              | `SystemPreferences`                                                                             | query, observation stream                               | no                                                        | 6     |
| `desktopCapturer`                                                                                                                                                                | `Session` display media policy plus `DesktopCapturer.sources`                                   | query, policy                                           | no                                                        | 6     |
| `TouchBar` family                                                                                                                                                                | `TouchBar` schema, `window.touchBar.set`                                                        | data, command, observation stream for interactions      | no                                                        | 6     |
| `ShareMenu`                                                                                                                                                                      | `window.menu.share`                                                                             | command                                                 | no                                                        | 6     |
| `inAppPurchase`, `pushNotifications`                                                                                                                                             | `Store`, `PushNotifications`                                                                    | query, command, observation stream                      | no                                                        | 6     |
| `webUtils.getPathForFile`                                                                                                                                                        | `Renderer.pathOf(file)` through the preload bridge                                              | renderer query                                          | n/a                                                       | 2     |
| `WebContents` hosting a page the application does not own: pattern navigation, `will-download` veto, `executeJavaScript`, `debugger`, `sendInputEvent`                           | `GuestView`                                                                                     | scoped resource, policy, observation stream, capability | yes, navigate and capture gated                           | 7     |
| `autoUpdater`, `crashReporter`                                                                                                                                                   | a future Electron Forge bindings package                                                        |                                                         |                                                           | later |
| `BrowserView`                                                                                                                                                                    | none, deprecated in favor of `WebContentsView`                                                  |                                                         |                                                           | never |
| `ipcMain`, `MessageChannelMain`, `MessagePortMain`, `contextBridge`, `webFrameMain`                                                                                              | internal transport                                                                              |                                                         |                                                           | never |
| `webFrame`, `sharedTexture`                                                                                                                                                      | none, renderer or GPU internals                                                                 |                                                         |                                                           | never |

## Waves

1. **Universal desktop.** Shell, Clipboard, NativeTheme, Notification, PowerMonitor, SafeStorage. Six namespaces, five owners. This is what every application asks for in its first week and it exercises every shape once, so it also proves the conventions before the larger waves.
2. **Window and web contents extras.** Grows the window handle and `WindowControls.protocol`; adds print, capture, find, history, zoom, audio, and the generic views. Mostly commands and state fields on existing handles.
3. **Session extras.** Cookies with an origin policy, request interception with Effect deciders, proxy, spellchecker, cache, certificates, extensions, service workers. The interception design is the one piece here that needs its own sketch before code.
4. **Application extras.** Queries and commands on `App`, startup options that must precede readiness, and the remaining application events.
5. **Operations.** Power save blocker, logging and tracing, and networking as an Effect `HttpClient` layer. Updates and crash reporting belong to a future Electron Forge bindings package.
6. **Platform specific.** System preferences, desktop capture, Touch Bar, share menu, store and push surfaces, each failing with `Native` on other platforms rather than being absent from the types.
7. **Guest views.** A distinct view kind for pages the application does not own, with body-aware interception on the session; see the [guest view design record](superpowers/specs/2026-09-13-guest-view-surface-design.md).

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

Resolved on 2026-09-13 with one lens: the most performant, scalable, extensible, and future-proof option.

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

Wave 1 shipped on 2026-09-13: `NativeTheme`, `PowerMonitor`, `Notification`, `Clipboard`, `Shell`, and `SafeStorage` in `sewed` and `sewed/main`, with compile-time contracts in `packages/sewed/test/surfaces-types.ts`, the playground's `pnpm verify:surfaces`, and [desktop surfaces](desktop-surfaces.md). The clipboard follows Electron 44's asynchronous `ClipboardItem` model rather than the removed synchronous readers.

Wave 2 shipped on 2026-09-13: `Renderer.pathOf` through the preload bridge; web contents print, PDF, capture, zoom, audio, user agent, scoped find, scoped style, and policy-gated history, with zoom, audio, history, and find in `WindowControls.protocol`; window appearance state and commands, taskbar progress, icons, parent and modal options; and `View` and `ImageView` on a shared attachment registry. The playground's `verify:webcontents-extras`, `verify:windows`, and `verify:native-views` cover them. Two Electron 44 facts shaped the code: `findInPage`'s `findNext` flag starts a session when true and advances it when false, and page capture is flaky under software rendering on the test display, so the fixture retries it.

Wave 3 shipped on 2026-09-13: cookies with a hosted origin policy, request interception with Effect deciders on match-pattern filters and data decisions, proxy, spell checker, cache, user agent, download path, certificate rules, device permissions on the permission policy, scoped extensions, and service worker observation, covered by the playground's `verify:session-extras`. Electron accepts one native listener per interception stage, so the library keeps one listener over the union of installed filters and dispatches to matching intercepts, and it only loads extensions into persistent sessions.

Wave 4 shipped on 2026-09-13: `App.info`, paths, GPU information, login items, badges, the about panel, default protocol client registration, secure keyboard entry, window focus, child process, and web contents creation streams, the macOS dock and Windows taskbar groups that fail with `Native` elsewhere, and `App.run` startup options for command line switches, the app user model id, and hardware acceleration plus certificate error and HTTP login policies, covered by the playground's `verify:app-extras` including a real authentication challenge.

Wave 5 shipped on 2026-09-13: `Net.layer` provides Effect's `HttpClient` over `net.fetch` or a session's `fetch`, with `Net.online` and `Net.resolveHost`; `PowerSaveBlocker.hold`, `NetLog.record`, and `ContentTracing.record` are scoped resources; all covered by the playground's `verify:operations`, which fetches through a session's cookies and writes a net log and a trace.

Wave 6 shipped on 2026-09-13: `SystemPreferences`, `DesktopCapturer.sources` with `Session.setDisplayMedia`, `window.touchBar`, `window.menu.share`, `InAppPurchase`, and `PushNotifications`, each present on every platform and failing with `Native` where Electron does not implement it. The playground's `verify:platform` proves the Linux paths, the validation, and the gating; macOS and Windows behavior still needs runs on those platforms.

Wave 7 shipped on 2026-09-13: `GuestView` in `sewed` and `sewed/main`, built on `internal/WebContentsCore.ts`, the contents core the renderer half now shares; `internal/GuestNavigation.ts`, `GuestAutomation.ts`, `ContentsDownloads.ts`, and `GuestHost.ts` hold the Node-testable pieces the composed `internal/GuestView.ts` uses; `internal/ContentsRegistry.ts` attributes every request stage to its Sewed handle as `sourceId`; `Session.intercept` gained the byte-capped body filter; and `internal/DownloadItem.ts` wraps an already-started item in a `Download.Handle`. The compile-time contract lives in `packages/sewed/test/guest-types.ts`, the playground's `verify:guest` covers the native behavior, and its `/guest` route proves the protocol from React. Three facts shaped the code: Electron honors a download veto and save path only inside its callback, so download deciders run synchronously; a state update published from a Chromium callback resumes the waiting fiber on that callback's stack, so navigations start on a fresh task; and a blocked navigation's error page finishes loading after the next navigation has started, so the ready state waits for the current navigation's commit. On Electron 44 an open DevTools front-end coexists with the guest's debugger session rather than blocking it.

Wave 8 shipped on 2026-09-14, driven by the first desktop consumer's migration. Window options gained the macOS `titleBarStyle` and `trafficLightPosition`, and window handles gained `setWindowButtonVisibility`, which fails with `Native` off macOS. `BrowserWindow.make` and `WebContentsView.make` accept `backgroundThrottling`. Every web contents has a main-only `console` observation stream. A renderer's web contents has `downloads(decide)` over the shared `internal/ContentsDownloads.ts` dispatch, whose `Download.Decision` gained `prompt` with optional `Dialog.SaveOptions`; the offer and decision schemas moved from `GuestView` to `Download`. `App.setMenu` replaces the application menu. Replacement differs from the rejected restoration: nothing returns to an earlier menu, and the existing guard keeps a replaced menu's callbacks silent. The compile-time contracts extend `window-extras-types.ts`, `webcontents-types.ts`, and `app-extras-types.ts`, and the playground's `verify:windows`, `verify:webcontents-extras`, and `verify:application-menus` cover the native behavior, including a replacement while a submenu is open. The macOS title bar options and button visibility still need a run on macOS.

Wave 9 shipped on 2026-09-14, also driven by the first desktop consumer. `@sewed/react` gained `connect(entry)`, an external store that connects a document outside React and reports `connecting`, `ready`, or `unavailable` with its cause, with `RuntimeProvider` to give that runtime to a React root the application owns and `useRuntimeStatus` to read it. A renderer that also ships as a plain web page therefore renders without the preload instead of failing at mount. A renderer's web contents gained the `blocked` stream the guest view already had, and the `Blocked` schema moved from `GuestView` to `WebContents`. `packages/react/test/connection.test.ts` covers the store in Node, the contracts extend `packages/react/test/types.ts` and `webcontents-types.ts`, and the playground renders its tree through `RuntimeProvider` while `verify:webcontents-extras` observes a denied popup and navigation.

Wave 10 shipped on 2026-09-14 for the first consumer's move of its shell and managed browser onto Sewed. `RuntimeStore.run` lets code outside components use a document's one connection. Origin and document rules accept schemes that `App.run` registers as standard, and the shell policy accepts exact `mailto` recipients. `BrowserWindow.make` accepts the guest automation declaration, now in the root `Automation` module, for development tooling. Window state gains `contentBounds`, window handles gain `mediaSourceId`, and the contents core gains `terminate` and `favicons`. Guest views gain an input policy. Sessions gain `setPreconnect`, `closeAllConnections`, `resolveHost`, and `blobData`. Image views accept encoded bytes. Node tests cover the Electron-free pieces, the contracts extend `window-extras-types.ts`, `webcontents-types.ts`, `guest-types.ts`, `session-extras-types.ts`, `native-views-types.ts`, and the React contracts, and the playground fixtures exercise the native behavior. Four facts shaped the result: X11 can change a window's content area without a move or resize event, so window handles also read `contentBounds` on demand; a DevTools command that waits for a compositor frame does not complete for a window that was never shown; a blocking guest input policy also blocks input sent with `automation.input`; and on Electron 44 on Linux `closeAllConnections` left a streaming response open with or without Sewed.

Wave 11 shipped on 2026-09-15: every surface a renderer reaches is one capability. `Capability.define(name, protocol)` names the contract once and gives it a slot. `Capability.fromHandlers` builds the `native` layer, which dispatches in this process; `Capability.client` builds the layer that reaches the same contract over a binding; `internal/CapabilityMemory.ts` builds the `memory` layer, which applies the same policy in a Node test and records every call; `Capability.serve`, which `sewed/main` exports beside `host`, turns whichever layer is in scope into an owner a document binds to; and `Capability.declaration` gives a renderer entry its slot. Eight surfaces moved: Shell, NativeTheme, PowerMonitor, Clipboard, Notification, Cookies, WindowControls, and GuestView tabs. This replaces the handle-plus-host pair the earlier waves shipped, and supersedes decision 1 above. `Shell.make`, every `*.host`, `Session.hostCookies`, `window.controls`, and `guest.host` are gone with no alias. Each surface keeps its rules in an Electron-free policy module that both layers call, so a served renderer call obeys exactly the rules a main-side call does.

Four properties of the model are documented rather than enforced, and each is stated in the guide for the surface it affects. Serve a per-owner capability inside its owner's own scope: the owner lives for the scope `serve` runs in, and a served owner held over a closed window fails `Closed` from the handler rather than by the connection dropping. The two per-owner surfaces have no `memory` layer, because their `native` is already Electron-free and a test supplies the owner directly. One capability is one key, so two owners of one surface in a single binding list need an explicit slot each. An operation carries no scope, so a scoped search is a stream that absorbs its own.

Two rules are enforced in code. `Capability.define` refuses a protocol that declares RPC middleware and names the operation, because Effect applies middleware inside its RPC server and an in-process call would skip a check a bound call honors; middleware remains available through the binding API, which `Remote` uses for its lease guard. A call over a binding is encoded and validated by the protocol's schemas, and an in-process call is neither, deliberately, because avoiding that cost is what the native layer exists for.

The compile-time contracts live in `packages/sewed/test/capability-types.ts`, `surfaces-types.ts`, `window-extras-types.ts`, and `guest-types.ts`; `window-state.test.ts` and `guest-host.test.ts` cover the two per-owner surfaces over structural owners with no Electron.

One placement error survived every one of those checks and was caught only by the native harness. `serve` was first written beside `define` and `client` in the root module, and it builds an RPC server, so the root entry a renderer imports reached `Host.ts`. Every capability's root module imports `Capability.ts` to define its contract, so the server entered the renderer bundle of any application that bound any surface. Types, node tests, and the reference all passed, because nothing about it is a type error or a wrong answer; it is a property of the module graph, and the only check that reads a built renderer bundle is the playground's `pnpm verify`. `serve` now lives in `internal/CapabilityServe.ts` behind `sewed/main`, beside `host`, and `root-entry.test.ts` pins the property in Node: the root entry must reach neither the RPC server nor Electron.

The native evidence for the wave is the playground's full harness on the isolated display, with 32 of 32 verifications passing, including `verify:surfaces`, `verify:windows`, `verify:sessions`, `verify:session-extras`, `verify:webcontents-extras`, and `verify:guest`, which drive all eight capabilities through real Electron.

Wave 12 shipped on 2026-09-20: every native event the application decides is one decidable. Thirteen mechanisms became one. `Decision.decidable` declares a question once — its owner, its event and answer schemas, its timing, the fallback when nobody has an opinion, the failure a broken decider contributes, and how several deciders combine — and `Decidables` is the catalog of eighteen. A feature installs a decider through the owner's own door, `decide`, or `intercept` for a session's three request stages, and the install lives for the caller's scope. `App.guardQuit`, `window.guardClose`, `App.login`, `App.run`'s `certificateErrors` and `quitOnLastWindowClosed` options, `Session.setPermissions`, `Session.setCertificatePolicy`, `Session.setPreconnect`, `Session.setDisplayMedia`, `webContents.setNavigationPolicy`, a guest's `setNavigationPolicy` and input-policy setter, the `Rules<R>` bundle `Session.intercept` took, and `downloads(decide)` are gone with no alias.

Four rules carry the model. A decidable names the owner that resolves it, so a decider installed elsewhere is a compile error naming both owners, and a runtime refusal for a caller not compiling against the types — the failure it replaces was the quietest there is, since such a decider registers, is never consulted, and leaves its decidable answering the fallback forever. Composition is declared beside the event rather than chosen by whoever resolves it: `first` keeps the earliest non-`Pass` answer, `restrictive` ranks answers by a declared order so no decider widens another's denial, and `chain` folds, because two `headers` answers rank equal and a ranking would reintroduce Electron's single-listener clobbering one level up. What a _broken_ decider contributes is declared data, separate from the fallback, since conflating the two is closed only when the fallback is the closed answer — a crashing close guard resolved `allow` under the first implementation, and `Window.Close` now declares `failure: "deny"`. And a policy is a grant list that compiles itself: `Navigation.Policy`, `Permission.Policy`, and `Certificate.Policy` answer only what their rules match and pass otherwise, so two features' policies compose as a union instead of vetoing each other; a cap is an explicit decider, which is what a guest's creation-time navigation patterns install as.

`sewed/testing` gained an owner stand-in over the production registry and the production `decide` builder, so a feature written against `Decision.Owner<O>` or `Decision.Requests` is exercised in a Node test by the code that ships. It is three constructors rather than one, because a stand-in carries the posture of the owner it names: `Testing.owner(kind)` for the application, a window and a session, whose real owners build a bare registry; `Testing.contents({ of: "window" | "guest", input? })`, which calls the same `ContentsPosture` functions the two real contents call; and `Testing.requests()`, which carries `intercept` and `resolveChain` and no `decide`, because that is what a session's request stages have. Each stand-in publishes exactly the doors its production owner does. The stage table and the request filter's URL-and-type match moved into an Electron-free `internal/RequestStages.ts` that both intercept doors call; upload assembly stays native, so a test event carries its own `body`. [The decision model](native-policy.md) is the one page that explains all of it, and every other guide links there rather than restating it. The contracts live in `packages/sewed/test/decision-types.ts`, `testing-types.ts`, and `guide-examples-types.ts`, which holds the natural spelling of each guide's main example so a signature change breaks the build rather than the documentation.

Real-Electron coverage is not uniform across the catalog, and the honest account is this. Two decidables have no real-Electron evidence at all: `WebContents.Unload`, which no fixture touches, and `App.CertificateError`, which `app-extras-fixture` installs and never triggers, because no fixture makes an HTTPS request that fails verification. `Session.Certificate` is exercised by capturing the verify proc Sewed installs and calling it, not by a real TLS handshake. `WebContents.Popup` is exercised only on its deny path — nothing allows a popup, because what an allowed popup's own window _is_ is the case this wave leaves ungoverned. Those are covered by unit tests over structural fakes and by nothing else; an HTTPS fixture with a certificate that fails verification would close the two certificate gaps together. `WebContents.Input` was a guest's alone until `verify:windows` gained a check that a decider installed on a window's own web contents blocks a key sent with `sendInputEvent`, that the native listener exists only while that decider does, and that closing its scope lets the next key through; that is also the only executing proof of the one line in `internal/WebContents.ts` that hands the real contents to the input gate, since the unit suite cannot import that file.

### Suite timing

`pnpm test` ran five times in succession on 2026-09-15 and passed 248 of 248 each time, in 7.39 to 7.67 seconds. Earlier waves reported single-test failures that passed on re-run, always the same test: "a stalled binary consumer stops production before the full source is buffered" in `packages/sewed/test/binary.test.ts`, reported once as `18 !== 16`.

The failure mode belongs to that test's settling window rather than to the transport. The test stalls a consumer, sleeps 50 ms, snapshots how many chunks the producer made, sleeps another 50 ms, and asserts with `assert.equal` that the count has not moved. The 50 ms is the whole assumption: it is how long backpressure is given to settle, it is derived from nothing, and the assertion allows no tolerance, so two further chunks fail it. The reported `18 !== 16` is exactly that shape.

It did not reproduce here. That test ran 101 times without failing: five times inside whole-suite runs, 30 times in isolation, and 66 times under deliberate CPU contention at 6 and at 16 concurrent copies on a 24-core machine. The observed rate on this machine is 0 in 101, which is not evidence that the assumption holds, only that this machine does not violate it. Before the suite carries the performance budgets this model plans, replace the two fixed sleeps with a wait for observed quiescence: sample the produced count until it stops advancing, then assert that it stays put. That removes the timing assumption without weakening what the test proves.

## Next implementation step

The catalog is covered. The Electron Forge bindings package shipped on 2026-09-13 as `@sewed/forge` with the updater, crash reporter, and configuration helper; see [Electron Forge bindings](forge.md). Forge packaging was exercised on Linux on 2026-09-13: a scaffolded application packaged through `makeConfig` and the packaged binary passed the scaffold smoke probe, which is why the template ships pnpm's hoisted linker, the exotic dependency allowance, and the zip library override. What remains is platform runs on macOS and Windows for wave six, the updater, and the platform makers. The request observation tap, the scoped login decider, the shared observation helpers, and the playground's adoption of hosted surfaces shipped on 2026-09-13.
