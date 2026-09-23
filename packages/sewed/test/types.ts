import { Context, Effect, Layer, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";
import {
  Binding,
  ClientContext,
  Decidables,
  Decision,
  Dialog,
  GuestView,
  MainContext,
  Menu,
  Navigation,
  Renderer,
  RendererContext,
  Screen as ScreenData,
  SewedError,
  WebContents,
  WindowControls,
  WorkerContext,
} from "../lib/index.js";
import { App, BrowserWindow, Screen, Session, Worker } from "../lib/main.js";
import * as WorkerDefinition from "../lib/WorkerApi.js";

const Protocol = RpcGroup.make(
  Rpc.make("count", { payload: { n: Schema.Number }, success: Schema.Number }),
);
const Counter = Binding.slot("counter", Protocol);
const bindingLayer = Binding.layer([]);
const layerShape: Layer.Layer<ClientContext, SewedError, MainContext> = bindingLayer;
void layerShape;

class Unrelated extends Context.Service<Unrelated, { readonly value: string }>()(
  "test/Unrelated",
) {}

const needsClientAndOtherServices = Effect.gen(function* () {
  yield* ClientContext;
  yield* Scope.Scope;
  yield* Unrelated;
  return 1;
});
const withLayerRequirements = Effect.provide(needsClientAndOtherServices, bindingLayer);
const expectedLayerRequirements: Effect.Effect<
  number,
  unknown,
  MainContext | Scope.Scope | Unrelated
> = withLayerRequirements;
void expectedLayerRequirements;
// @ts-expect-error Binding.layer retains its MainContext requirement.
const missingMain: Effect.Effect<number, unknown, Scope.Scope | Unrelated> = withLayerRequirements;
void missingMain;
// @ts-expect-error Binding.layer retains the caller's Scope requirement.
const missingScope: Effect.Effect<number, unknown, MainContext | Unrelated> = withLayerRequirements;
void missingScope;
// @ts-expect-error Binding.layer retains unrelated services.
const missingUnrelated: Effect.Effect<number, unknown, MainContext | Scope.Scope> =
  withLayerRequirements;
void missingUnrelated;

const definition = WorkerDefinition.define(
  Protocol,
  Protocol.toLayer({ count: ({ n }) => Effect.succeed(n) }),
);
const entry = Renderer.entry(new URL("file:///renderer.html"), { bindings: [Counter] });

const namedSession: Effect.Effect<Session.Handle, SewedError, MainContext> = Session.fromPartition({
  kind: "memory",
  name: "preview",
});
const defaultSession: Effect.Effect<Session.Handle, SewedError, MainContext> =
  Session.defaultSession;
void defaultSession;
Effect.gen(function* () {
  const session = yield* namedSession;
  // @ts-expect-error setPermissions is gone; permission checks are now Decidables.Session.Permission.
  Session.setPermissions(session, [
    { kind: "origin", origin: "https://example.com", permissions: ["notifications"] },
  ]);
  const permission: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = session.decide(
    Decidables.Session.Permission,
    Decision.sync(() => "allow"),
  );
  // @ts-expect-error Permission decisions remain main-owned.
  Renderer.run(entry, permission);
  const clear: Effect.Effect<void, SewedError, MainContext> = session.clearStorage({
    kind: "origin",
    origin: "https://example.com",
    storages: ["localstorage"],
  });
  // @ts-expect-error Storage clearing remains main-owned.
  Renderer.run(entry, clear);
  // @ts-expect-error Cookies cannot be mistaken for origin-scoped storage.
  session.clearStorage({
    kind: "origin",
    origin: "https://example.com",
    storages: ["cookies"],
  });
  // @ts-expect-error Clearing requires an explicit storage selection.
  session.clearStorage({ kind: "session", storages: [] });
  // @ts-expect-error Session.clearStorage is gone; it is a method on the handle.
  Session.clearStorage(session, { kind: "session", storages: ["cookies"] });
  const window = yield* BrowserWindow.make({ session });
  const navigation: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
    window.webContents.decide(
      Decidables.WebContents.Navigation,
      Decision.sync(() => "allow"),
    );
  // @ts-expect-error Navigation decisions remain main-owned.
  Renderer.run(entry, navigation);
  // Task 7b, on the real handles: a window's close guard installed on the window's own web contents
  // is the mistake this wave found. It used to compile, register, and never be consulted.
  window.webContents.decide(
    // @ts-expect-error Window.Close belongs to the window, not to its web contents.
    Decidables.Window.Close,
    Decision.sync(() => "deny"),
  );
  // ... and the converse on the window itself.
  window.decide(
    // @ts-expect-error WebContents.Navigation belongs to the web contents, not to the window.
    Decidables.WebContents.Navigation,
    Decision.sync(() => "allow"),
  );
  // @ts-expect-error setNavigationPolicy is gone; navigation is now a decidable.
  window.webContents.setNavigationPolicy([{ kind: "origin", origin: "https://example.com" }]);
});

// Navigation.Rules is the public schema replacing both removed navigation schemas, merging the
// URL-rule and match-pattern shapes into one array. Typed as `typeof Navigation.Rules.Encoded` rather
// than handed to Schema.decodeUnknownSync alone (whose parameter is `unknown`, so it does not itself
// type-check its argument): narrowing the schema to either shape alone is a compile error at this
// literal, not just a runtime one.
const encodedRules: typeof Navigation.Rules.Encoded = [
  { kind: "origin", origin: "https://example.com" },
  { kind: "document", url: "https://example.com/app" },
  "https://*.example.com/*",
];
const mergedRules: Navigation.Rules = Schema.decodeUnknownSync(Navigation.Rules)(encodedRules);
const compiledRules: readonly ((url: URL) => boolean)[] = Navigation.compile(mergedRules);
void compiledRules;
// @ts-expect-error WebContents.NavigationPolicy is gone; Navigation.Rules replaces both schemas.
void WebContents.NavigationPolicy;
// @ts-expect-error GuestView.NavigationPolicy is gone; Navigation.Rules replaces both schemas.
void GuestView.NavigationPolicy;
// Navigation.Policy used to be this same schema (Task 6b's plan defect); it is now the policy value
// definePolicy produces, so it is no longer a Schema.Codec a decoder can be built from.
// @ts-expect-error Navigation.Policy is a Policy value, not a schema: it decodes nothing.
Schema.decodeUnknownSync(Navigation.Policy);

// The natural, unannotated spelling: a policy is declared once and installed with rule data alone —
// the spec's two-argument `Decision.policy(kind, rules)`, resolved through the real Owner.decide
// every owner in this wave publishes.
declare const decisionOwner: Decision.Owner<"contents">;
declare const sessionOwner: Decision.Owner<"session">;
const navigationPolicy: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  decisionOwner.decide(
    Decidables.WebContents.Navigation,
    Decision.policy(Navigation.Policy, [{ kind: "origin", origin: "https://example.com" }]),
  );
void navigationPolicy;
// Fix round 1 (I2): the same policy value installs on WebContents.Popup too — its event has no
// `kind`, unlike Navigation's — and until now nothing type-checked pinned that second direction.
const popupPolicy: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  decisionOwner.decide(
    Decidables.WebContents.Popup,
    Decision.policy(Navigation.Policy, ["https://*.example.com/*"]),
  );
void popupPolicy;
decisionOwner.decide(
  Decidables.WebContents.Navigation,
  Decision.policy(Navigation.Policy, [
    // @ts-expect-error "orign" is not "origin" | "document": a misspelled rule kind.
    { kind: "orign", origin: "https://example.com" },
  ]),
);
sessionOwner.decide(
  Decidables.Session.Permission,
  // @ts-expect-error A navigation policy cannot decide a permission: its compile expects `url`,
  // which Session.Permission's event does not have. Asserted through a session's own owner, since
  // a permission decidable does not reach a web contents' `decide` at all now (below).
  Decision.policy(Navigation.Policy, []),
);
// Task 7b: a decider installs on the owner of its own event. A session's decidable does not reach
// a web contents' `decide`, whatever the decider is — the parameter, not the argument, is wrong.
decisionOwner.decide(
  // @ts-expect-error Session.Permission is a session's decidable, not a web contents'.
  Decidables.Session.Permission,
  Decision.sync(() => "allow"),
);

// @ts-expect-error A renderer cannot acquire a native browser session.
Renderer.run(entry, namedSession);
const sessionHandlers = Protocol.toLayer({
  count: () => Effect.as(namedSession, 1).pipe(Effect.orDie),
});
// @ts-expect-error A worker cannot acquire a native browser session.
WorkerDefinition.define(Protocol, sessionHandlers);
// @ts-expect-error Native partition strings do not select storage policy.
Session.fromPartition("persist:account");
// @ts-expect-error Partition persistence is an explicit kind.
Session.fromPartition({ name: "account" });
// @ts-expect-error First-creation-only native options are not session identity.
Session.fromPartition({ kind: "persistent", name: "account", cache: false });
// @ts-expect-error A partition name cannot replace the selected native handle.
BrowserWindow.make({ session: "account" });
// @ts-expect-error Session acquisition must run before assigning a handle to a window.
BrowserWindow.make({ session: namedSession });
// @ts-expect-error Browser session handles cannot be fabricated structurally.
BrowserWindow.make({ session: {} });
Effect.gen(function* () {
  const session = yield* Session.fromPartition({ kind: "persistent", name: "account" });
  yield* BrowserWindow.make({ session });
  yield* BrowserWindow.make({ session });
  // @ts-expect-error Native sessions have application lifetime and no scoped destruction API.
  yield* session.close;
  // Cookie access is a method on the handle now, not a free function taking it.
  void session.cookies.get({});
  // @ts-expect-error Native objects stay behind the session handle.
  session.native;
});

const appActivations: Stream.Stream<App.Activation, SewedError, MainContext> = App.activations;
const appQuit: Effect.Effect<void, SewedError, MainContext> = App.quit;
const screenDisplays: Effect.Effect<readonly ScreenData.Display[], SewedError, MainContext> =
  Screen.displays;
const screenPrimary: Effect.Effect<ScreenData.Display, SewedError, MainContext> = Screen.primary;
const screenCursor: Effect.Effect<ScreenData.Point, SewedError, MainContext> = Screen.cursor;
const screenNearest: Effect.Effect<ScreenData.Display, SewedError, MainContext> = Screen.nearest({
  x: 0,
  y: 0,
});
const screenMatching: Effect.Effect<ScreenData.Display, SewedError, MainContext> = Screen.matching({
  x: 0,
  y: 0,
  width: 800,
  height: 600,
});
const screenChanges: Stream.Stream<ScreenData.Change, SewedError, MainContext> = Screen.changes;
void screenDisplays;
void screenPrimary;
void screenCursor;
void screenNearest;
void screenMatching;
void screenChanges;
// @ts-expect-error A renderer cannot query the native display list directly.
Renderer.run(entry, Screen.displays);
// @ts-expect-error Points require numeric coordinates.
Screen.nearest({ x: "left", y: 0 });
// @ts-expect-error Display matching requires a complete rectangle.
Screen.matching({ width: 800, height: 600 });
const screenHandlers = Protocol.toLayer({
  count: () => Effect.map(Screen.primary, (display) => display.id).pipe(Effect.orDie),
});
// @ts-expect-error A worker definition cannot acquire native screen capabilities.
WorkerDefinition.define(Protocol, screenHandlers);
void appActivations;
void appQuit;
// @ts-expect-error Application events retain their main runtime requirement.
const misplacedActivations: Stream.Stream<App.Activation, SewedError> = App.activations;
void misplacedActivations;
// @ts-expect-error A renderer cannot observe native application activations directly.
Renderer.run(entry, Stream.runDrain(App.activations));
// @ts-expect-error A renderer cannot request application quit without a bound main handler.
Renderer.run(entry, App.quit);

// The native path of a user-provided file is a renderer query answered by the preload bridge.
declare const droppedFile: File;
const droppedPath: Effect.Effect<string, SewedError, RendererContext> =
  Renderer.pathOf(droppedFile);
void droppedPath;
Renderer.run(entry, Renderer.pathOf(droppedFile));
// @ts-expect-error File paths are resolved in the renderer runtime only.
const pathWithoutRenderer: Effect.Effect<string, SewedError> = Renderer.pathOf(droppedFile);
void pathWithoutRenderer;
const quitHandlers = Protocol.toLayer({ count: () => Effect.as(App.quit, 1).pipe(Effect.orDie) });
// @ts-expect-error A worker cannot consume the native quit capability directly.
WorkerDefinition.define(Protocol, quitHandlers);

const WorkerDependency = Binding.slot("worker-dependency", Protocol);
const clientAwareDefinition = WorkerDefinition.define(
  Protocol,
  Protocol.toLayer(
    Effect.gen(function* () {
      yield* WorkerContext;
      const dependency = yield* WorkerDependency();
      return { count: ({ n }) => dependency.count({ n }).pipe(Effect.orDie) };
    }),
  ),
  { bindings: [WorkerDependency] },
);
void clientAwareDefinition;

const clientRequiredHandlers = Protocol.toLayer(
  Effect.gen(function* () {
    const dependency = yield* WorkerDependency();
    return { count: ({ n }) => dependency.count({ n }).pipe(Effect.orDie) };
  }),
);
// @ts-expect-error Two-argument worker definitions only accept WorkerContext requirements.
WorkerDefinition.define(Protocol, clientRequiredHandlers);

Renderer.run(
  entry,
  Effect.gen(function* () {
    const counter = yield* Counter();
    const value: number = yield* counter.count({ n: 1 });
    return value;
  }),
);

// @ts-expect-error Main resources cannot run in the renderer.
Renderer.run(entry, BrowserWindow.make());
// @ts-expect-error Binding.layer cannot satisfy MainContext for a renderer run.
Renderer.run(entry, BrowserWindow.make().pipe(Effect.provide(bindingLayer)));
// @ts-expect-error Worker definitions are inert descriptors, not Layers.
Effect.void.pipe(Effect.provide(definition));
// @ts-expect-error Unprovided handler services cannot be hidden in a worker definition.
WorkerDefinition.define(Protocol, Protocol.toLayer({ count: () => Effect.as(MainContext, 1) }));
WorkerDefinition.define(
  Protocol,
  // @ts-expect-error Binding.layer cannot satisfy MainContext in a worker definition.
  Protocol.toLayer({
    count: () => Effect.as(MainContext, 1).pipe(Effect.provide(bindingLayer), Effect.orDie),
  }),
);
const mainDependentHandlers = Protocol.toLayer({
  count: () => Effect.as(MainContext, 1),
});
// @ts-expect-error MainContext cannot be laundered through the binding-aware overload.
WorkerDefinition.define(Protocol, mainDependentHandlers, { bindings: [] });
const rendererDependentHandlers = Protocol.toLayer({
  count: () => Effect.as(RendererContext, 1),
});
// @ts-expect-error RendererContext cannot be provided to a worker definition.
WorkerDefinition.define(Protocol, rendererDependentHandlers, { bindings: [] });
const unrelatedDependentHandlers = Protocol.toLayer({
  count: () => Effect.as(Unrelated, 1),
});
// @ts-expect-error Unrelated services cannot be provided to a worker definition.
WorkerDefinition.define(Protocol, unrelatedDependentHandlers, { bindings: [] });

const typedCall = Effect.flatMap(Counter(), (client) => client.count({ n: 1 }));
const correct: Effect.Effect<number, unknown, ClientContext | Scope.Scope> = typedCall;
void correct;
// @ts-expect-error Client requirements survive ordinary composition.
const missing: Effect.Effect<number, unknown, never> = typedCall;
void missing;
Effect.gen(function* () {
  const client = yield* Counter();
  // @ts-expect-error The RPC payload is still checked.
  yield* client.count({ n: "wrong" });
});

const OtherProtocol = RpcGroup.make(Rpc.make("other", { success: Schema.String }));
const Other = Binding.slot("other", OtherProtocol);
Effect.gen(function* () {
  const owner = yield* Worker.spawn(Worker.entry(new URL("file:///worker.js"), Protocol));
  // @ts-expect-error A binding cannot widen two different protocols into a compatible union.
  Binding.to(Other, owner);
});

// @ts-expect-error Runtime identity is not constructible from application code.
Layer.succeed(MainContext, {});
// @ts-expect-error Worker capabilities cannot run through the renderer entry.
Renderer.run(entry, WorkerDefinition.threadId);
const rendererOnly: Effect.Effect<void, never, RendererContext> = Effect.asVoid(RendererContext);
const workerOnly: Effect.Effect<number, never, WorkerContext> = WorkerDefinition.threadId;
void rendererOnly;
void workerOnly;

class Auth extends RpcMiddleware.Service<Auth>()("test/Auth", { requiredForClient: true }) {}
const AuthProtocol = RpcGroup.make(Rpc.make("locked").middleware(Auth), Rpc.make("plain"));
type AuthRpcs = RpcGroup.Rpcs<typeof AuthProtocol>;
const Authorized = Binding.slot("authorized", AuthProtocol);
const MiddlewareBinding = Binding.slot("middleware", AuthProtocol);
const middlewareDependentHandlers = Protocol.toLayer(
  Effect.gen(function* () {
    const authorized = yield* MiddlewareBinding();
    return { count: () => authorized.plain().pipe(Effect.as(1), Effect.orDie) };
  }),
);
// @ts-expect-error Unprovided middleware requirements cannot be laundered through bindings.
WorkerDefinition.define(Protocol, middlewareDependentHandlers, {
  bindings: [MiddlewareBinding],
});

const middlewareCall = Effect.flatMap(Authorized(), (client) => client.plain());
const withMiddlewareRequirements = Effect.provide(middlewareCall, bindingLayer);
const expectedMiddlewareRequirements: Effect.Effect<
  void,
  unknown,
  MainContext | Scope.Scope | Rpc.MiddlewareClient<AuthRpcs>
> = withMiddlewareRequirements;
void expectedMiddlewareRequirements;
// @ts-expect-error Binding.layer cannot satisfy the RPC middleware requirement.
const missingMiddleware: Effect.Effect<void, unknown, MainContext | Scope.Scope> =
  withMiddlewareRequirements;
void missingMiddleware;

Effect.gen(function* () {
  const window = yield* BrowserWindow.make();
  const popup: Effect.Effect<Menu.PopupResult, SewedError, MainContext> = window.menu.popup({
    items: [
      { kind: "command", id: "open", label: "Open" },
      { kind: "separator" },
      { kind: "checkbox", id: "visible", label: "Visible", checked: false },
      {
        kind: "submenu",
        label: "Mode",
        items: [{ kind: "radio", id: "compact", label: "Compact", checked: true }],
      },
    ],
    position: { x: 10, y: 20 },
  });
  // @ts-expect-error A renderer cannot directly open a native menu.
  Renderer.run(entry, popup);
  const menuHandlers = Protocol.toLayer({ count: () => Effect.as(popup, 1).pipe(Effect.orDie) });
  // @ts-expect-error Worker handlers cannot acquire native menu access.
  WorkerDefinition.define(Protocol, menuHandlers);
  // @ts-expect-error Popup menus must contain at least one item.
  window.menu.popup({ items: [] });
  // @ts-expect-error Submenus must contain at least one item.
  window.menu.popup({ items: [{ kind: "submenu", label: "Empty", items: [] }] });
  // @ts-expect-error Checkbox state is explicit.
  window.menu.popup({ items: [{ kind: "checkbox", id: "toggle", label: "Toggle" }] });
  // @ts-expect-error Both position coordinates are required together.
  window.menu.popup({ items: [{ kind: "command", id: "a", label: "A" }], position: { x: 1 } });
  window.menu.popup({
    items: [{ kind: "command", id: "a", label: "A" }],
    // @ts-expect-error The parent comes from the window handle.
    window,
  });
  window.menu.popup({
    items: [
      {
        kind: "command",
        id: "a",
        label: "A",
        // @ts-expect-error Native callbacks are not part of a menu definition.
        click: () => {},
      },
    ],
  });
  const message: Effect.Effect<Dialog.MessageResult, SewedError, MainContext> =
    window.dialog.message({ message: "Continue?", buttons: ["Cancel", "Continue"], cancelId: 0 });
  void message;
  // @ts-expect-error A renderer cannot invoke a native dialog directly.
  Renderer.run(entry, window.dialog.message({ message: "Continue?", buttons: ["OK"] }));
  // @ts-expect-error A dialog needs at least one button.
  window.dialog.message({ message: "Continue?", buttons: [] });
  // @ts-expect-error The window handle selects the parent; callers cannot override it.
  window.dialog.message({ message: "Continue?", buttons: ["OK"], parent: window });
  window.dialog.message({
    message: "Continue?",
    buttons: ["OK"],
    // @ts-expect-error The request owns interruption; options cannot replace its abort signal.
    signal: new AbortController().signal,
  });
  // @ts-expect-error A checked checkbox must have a label.
  window.dialog.message({ message: "Continue?", buttons: ["OK"], checkbox: { checked: true } });
  const dialogHandlers = Protocol.toLayer({
    count: () => Effect.map(message, (result) => result.response).pipe(Effect.orDie),
  });
  // @ts-expect-error Worker handlers cannot acquire a native dialog capability.
  WorkerDefinition.define(Protocol, dialogHandlers);
  const open: Effect.Effect<Dialog.OpenResult, SewedError, MainContext> = window.dialog.open({
    mode: "file",
    multiple: true,
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
  const save: Effect.Effect<Dialog.SaveResult, SewedError, MainContext> = window.dialog.save({
    defaultPath: "notes.txt",
  });
  window.dialog.open({ mode: "directory", multiple: true });
  window.dialog.open({ mode: "file", properties: ["showHiddenFiles"] });
  window.dialog.save({ defaultPath: "notes.txt", properties: ["dontAddToRecent"] });
  // @ts-expect-error Open dialog properties are Electron's own flags; showOverwriteConfirmation is save-only.
  window.dialog.open({ mode: "file", properties: ["showOverwriteConfirmation"] });
  // @ts-expect-error Save dialog properties are Electron's own flags; promptToCreate is open-only.
  window.dialog.save({ properties: ["promptToCreate"] });
  // @ts-expect-error mode and multiplicity flags are not part of OpenOptions.properties.
  window.dialog.open({ mode: "file", properties: ["openFile"] });
  // @ts-expect-error Save dialogs keep their main requirement in renderer programs.
  Renderer.run(entry, save);
  const pickerHandlers = Protocol.toLayer({ count: () => Effect.as(open, 1).pipe(Effect.orDie) });
  // @ts-expect-error Native file pickers cannot run in worker handlers.
  WorkerDefinition.define(Protocol, pickerHandlers);
  // @ts-expect-error File and directory selection require an explicit single mode.
  window.dialog.open({});
  // @ts-expect-error File filters do not apply to directory selection.
  window.dialog.open({ mode: "directory", filters: [{ name: "Text", extensions: ["txt"] }] });
  // @ts-expect-error A file filter must include an extension.
  window.dialog.open({ mode: "file", filters: [{ name: "Text", extensions: [] }] });
  // @ts-expect-error Native picker options cannot override the selected parent.
  window.dialog.save({ parent: window });
  // @ts-expect-error File pickers have no native abort signal API.
  window.dialog.open({ mode: "file", signal: new AbortController().signal });
  // @ts-expect-error Security-scoped bookmark lifetimes are a separate capability.
  window.dialog.save({ securityScopedBookmarks: true });
  Effect.map(open, (result) => {
    if (result.kind === "selected") {
      const first: string = result.paths[0];
      return first;
    }
    // @ts-expect-error A canceled picker has no selected paths.
    return result.paths;
  });
  Effect.map(save, (result) => {
    if (result.kind === "selected") return result.path;
    // @ts-expect-error A canceled save dialog has no destination.
    return result.path;
  });
  const visibility: Stream.Stream<boolean, never, MainContext> = window.state.pipe(
    Stream.map((state) => state.visible),
  );
  void visibility;
  const geometry: Stream.Stream<WindowControls.Bounds, never, MainContext> = window.state.pipe(
    Stream.map((state) => state.normalBounds),
  );
  const setBounds: Effect.Effect<void, SewedError, MainContext> = window.setBounds({ width: 800 });
  const setFullScreen: Effect.Effect<void, SewedError, MainContext> = window.setFullScreen(true);
  void geometry;
  void setBounds;
  void setFullScreen;
  // @ts-expect-error Renderer programs cannot change native geometry directly.
  Renderer.run(entry, window.setBounds({ x: 100, y: 100 }));
  const geometryHandlers = Protocol.toLayer({
    count: () => Effect.as(window.setFullScreen(true), 1).pipe(Effect.orDie),
  });
  // @ts-expect-error Worker handlers cannot execute native fullscreen operations directly.
  WorkerDefinition.define(Protocol, geometryHandlers);
  // @ts-expect-error Bounds coordinates are numbers.
  window.setBounds({ x: "left" });
  // @ts-expect-error A renderer cannot execute a native window visibility operation directly.
  Renderer.run(entry, window.show);
  const nativeHandlers = Protocol.toLayer({
    count: () => Effect.as(window.focus, 1).pipe(Effect.orDie),
  });
  // @ts-expect-error A worker cannot execute a native window focus operation directly.
  WorkerDefinition.define(Protocol, nativeHandlers);
  // @ts-expect-error Native window state retains its main runtime requirement.
  const stream: import("effect/Stream").Stream<unknown> = window.state;
  void stream;
  const contents: import("effect/Stream").Stream<WebContents.State, never, MainContext> =
    window.webContents.state;
  void contents;
  // @ts-expect-error Web contents state cannot be observed without the main capability.
  const misplacedContents: import("effect/Stream").Stream<WebContents.State> =
    window.webContents.state;
  void misplacedContents;
});

const Controls = Binding.slot("window-controls", WindowControls.protocol);
Effect.gen(function* () {
  const controls = yield* Binding.deferred(Controls);
  // @ts-expect-error Window controls do not implicitly grant menu access.
  controls.popup({ items: [{ kind: "command", id: "a", label: "A" }] });
  // @ts-expect-error Window controls do not grant native dialog access.
  controls.message({ message: "Continue?", buttons: ["OK"] });
  // @ts-expect-error Bound geometry calls retain their payload types.
  controls.setBounds({ width: "wide" });
  // @ts-expect-error Bound fullscreen calls require an explicit boolean.
  controls.setFullScreen({ fullScreen: "true" });
  yield* controls.show();
  yield* controls.setBounds({ width: 800 });
});

const DisplayInfo = RpcGroup.make(
  Rpc.make("primary", { success: ScreenData.Display, error: SewedError }),
  Rpc.make("changes", { success: ScreenData.Change, stream: true, error: SewedError }),
);
const Displays = Binding.slot("displays", DisplayInfo);
Effect.gen(function* () {
  const display = yield* Binding.deferred(Displays);
  // @ts-expect-error The application did not expose cursor access in this protocol.
  display.cursor();
  yield* display.primary();
  yield* Stream.runDrain(display.changes());
});

const Prompt = RpcGroup.make(Rpc.make("ask", { success: Dialog.MessageResult, error: SewedError }));
const PromptSlot = Binding.slot("prompt", Prompt);
Effect.gen(function* () {
  const prompt = yield* Binding.deferred(PromptSlot);
  yield* prompt.ask();
});

const MenuProtocol = RpcGroup.make(
  Rpc.make("choose", { payload: Menu.PopupOptions, success: Menu.PopupResult, error: SewedError }),
);
const MenuSlot = Binding.slot("menu", MenuProtocol);
Effect.gen(function* () {
  const menu = yield* Binding.deferred(MenuSlot);
  yield* menu.choose({ items: [{ kind: "command", id: "a", label: "A" }] });
});

const applicationOptions: Menu.ApplicationOptions = {
  items: [
    { kind: "role", role: "editMenu" },
    {
      kind: "submenu",
      label: "Window",
      items: [
        { kind: "command", id: "show", label: "Show", accelerator: "CommandOrControl+S" },
        { kind: "checkbox", id: "details", label: "Details", checked: false },
        { kind: "radio", id: "small", label: "Small", checked: true },
        { kind: "role", role: "close" },
      ],
    },
  ],
};
// Step 3: the application menu is a scoped resource the program acquires; step 4 replaces it
// with contributions.
const applicationMenu: Effect.Effect<App.Menu, SewedError, MainContext | Scope.Scope> =
  App.menu(applicationOptions);
// @ts-expect-error the menu is main placement; MainContext cannot be erased.
const misplacedMenu: Effect.Effect<App.Menu, SewedError, Scope.Scope> =
  App.menu(applicationOptions);
void misplacedMenu;
const menuSelections: Stream.Stream<Menu.Selection, SewedError> = Effect.runSync(
  Effect.succeed(undefined as unknown as App.Menu),
).selections;
const replaced: Effect.Effect<void, SewedError> = Effect.runSync(
  Effect.succeed(undefined as unknown as App.Menu),
).replace(applicationOptions);
// @ts-expect-error `menu` is no longer an App.run option; acquire the menu with App.menu.
App.run(Effect.void, { menu: applicationOptions });
// @ts-expect-error App.setMenu is gone; the menu handle's `replace` is the operation.
App.setMenu(applicationOptions);
// @ts-expect-error App.menuSelections is gone; the menu handle's `selections` is the stream.
App.menuSelections;
// @ts-expect-error a role item at the top level needs a submenu role, as before.
App.menu({ items: [{ kind: "role", role: "undo" }] });
// @ts-expect-error An application menu requires a nonempty menu bar.
App.menu({ items: [] });
// @ts-expect-error Cross-platform menu bars contain submenus or standard menu roles.
App.menu({ items: [{ kind: "command", id: "a", label: "A" }] });
// @ts-expect-error Submenus cannot be empty.
App.menu({ items: [{ kind: "submenu", label: "Empty", items: [] }] });
void applicationMenu;
void menuSelections;
void replaced;
// @ts-expect-error Roles do not have application command IDs.
const identifiedRole: Menu.ApplicationItem = { kind: "role", role: "copy", id: "copy" };
void identifiedRole;
// @ts-expect-error Roles cannot accept click callbacks.
const callbackRole: Menu.ApplicationItem = { kind: "role", role: "copy", click: () => {} };
void callbackRole;
// @ts-expect-error Only the declared native roles are supported.
const unsupportedRole: Menu.ApplicationItem = { kind: "role", role: "shareMenu" };
void unsupportedRole;
// The seven roles Jobwright's application menu needs are leaf roles, like every Electron role
// but `shareMenu`.
const jobwrightRoles: readonly Menu.ApplicationItem[] = [
  { kind: "role", role: "services" },
  { kind: "role", role: "hide" },
  { kind: "role", role: "hideOthers" },
  { kind: "role", role: "unhide" },
  { kind: "role", role: "front" },
  { kind: "role", role: "zoom" },
  { kind: "role", role: "help" },
];
void jobwrightRoles;
// A submenu may also carry a role: `help` and `window` keep their own items alongside whatever
// the platform adds; `services` and `recentDocuments` are filled by the OS, so the type accepts
// only an empty list there. Whether a nonempty list is refused is a decode-time rule, pinned at
// runtime in menu.test.ts, not by the type.
const helpSubmenu: Menu.ApplicationItem = {
  kind: "submenu",
  role: "help",
  label: "Help",
  items: [{ kind: "role", role: "about" }],
};
void helpSubmenu;
const servicesSubmenu: Menu.ApplicationItem = {
  kind: "submenu",
  role: "services",
  label: "Services",
  items: [],
};
void servicesSubmenu;
// @ts-expect-error Only `help`, `window`, `services` and `recentDocuments` are submenu roles.
const wrongSubmenuRole: Menu.ApplicationItem = { kind: "submenu", role: "quit", items: [] };
void wrongSubmenuRole;
const numericAccelerator: Menu.ApplicationItem = {
  kind: "command",
  id: "a",
  label: "A",
  // @ts-expect-error Native command accelerators must be strings.
  accelerator: 1,
};
void numericAccelerator;
// @ts-expect-error A checkbox needs an initial checked value.
const uncheckedApplicationItem: Menu.ApplicationItem = { kind: "checkbox", id: "a", label: "A" };
void uncheckedApplicationItem;
// @ts-expect-error A role never masquerades as a custom command event.
const roleSelection: Menu.Selection = { kind: "role", role: "copy" };
void roleSelection;
// @ts-expect-error Context popup items remain role-free.
const popupRole: Menu.Item = { kind: "role", role: "copy" };
void popupRole;

const MenuEventsProtocol = RpcGroup.make(
  Rpc.make("selections", { success: Menu.Selection, stream: true, error: SewedError }),
);
const MenuEventsSlot = Binding.slot("menu-events", MenuEventsProtocol);
Effect.gen(function* () {
  const client = yield* Binding.deferred(MenuEventsSlot);
  yield* Stream.runDrain(client.selections());
});
