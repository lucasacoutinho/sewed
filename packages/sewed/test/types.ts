import { Context, Effect, Layer, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";
import {
  Binding,
  ClientContext,
  Dialog,
  MainContext,
  Menu,
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
  const permissions: Effect.Effect<void, SewedError, MainContext> = Session.setPermissions(
    session,
    [
      { kind: "origin", origin: "https://example.com", permissions: ["notifications"] },
      { kind: "document", url: "file:///app/index.html", permissions: ["fullscreen"] },
    ],
  );
  // @ts-expect-error Permission policy changes remain main-owned.
  Renderer.run(entry, permissions);
  Session.setPermissions(session, [
    // @ts-expect-error Permission names cannot widen into arbitrary native capabilities.
    { kind: "origin", origin: "https://example.com", permissions: ["unknown"] },
  ]);
  Session.setPermissions(session, [
    // @ts-expect-error Permission rules must grant an explicit nonempty set.
    { kind: "origin", origin: "https://example.com", permissions: [] },
  ]);
  const clear: Effect.Effect<void, SewedError, MainContext> = Session.clearStorage(session, {
    kind: "origin",
    origin: "https://example.com",
    storages: ["localstorage"],
  });
  // @ts-expect-error Storage clearing remains main-owned.
  Renderer.run(entry, clear);
  // @ts-expect-error Cookies cannot be mistaken for origin-scoped storage.
  Session.clearStorage(session, {
    kind: "origin",
    origin: "https://example.com",
    storages: ["cookies"],
  });
  // @ts-expect-error Clearing requires an explicit storage selection.
  Session.clearStorage(session, { kind: "session", storages: [] });
  const window = yield* BrowserWindow.make({ session });
  const navigation: Effect.Effect<void, SewedError, MainContext> =
    window.webContents.setNavigationPolicy([{ kind: "origin", origin: "https://example.com" }]);
  // @ts-expect-error Navigation policy changes remain main-owned.
  Renderer.run(entry, navigation);
  // @ts-expect-error Native callback policy is not part of the public contract.
  window.webContents.setNavigationPolicy(() => true);
});
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
  // @ts-expect-error Native objects stay behind the session handle.
  session.cookies.get({});
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
App.run(Effect.void, { menu: applicationOptions });
const applicationMenu: Stream.Stream<Menu.Selection, SewedError, MainContext> = App.menuSelections;
// @ts-expect-error Application menu consumption retains its main requirement.
const misplacedApplicationMenu: Stream.Stream<Menu.Selection, SewedError> = applicationMenu;
void misplacedApplicationMenu;
// @ts-expect-error A renderer cannot observe native application menus directly.
Renderer.run(entry, Stream.runDrain(applicationMenu));
const applicationMenuHandlers = Protocol.toLayer({
  count: () => Stream.runDrain(applicationMenu).pipe(Effect.as(1), Effect.orDie),
});
// @ts-expect-error A worker cannot observe application menu selections directly.
WorkerDefinition.define(Protocol, applicationMenuHandlers);
// @ts-expect-error An application menu requires a nonempty menu bar.
App.run(Effect.void, { menu: { items: [] } });
// @ts-expect-error Cross-platform menu bars contain submenus or standard menu roles.
App.run(Effect.void, { menu: { items: [{ kind: "command", id: "a", label: "A" }] } });
// @ts-expect-error Leaf roles cannot appear at the top of the menu bar.
App.run(Effect.void, { menu: { items: [{ kind: "role", role: "copy" }] } });
// @ts-expect-error Submenus cannot be empty.
App.run(Effect.void, { menu: { items: [{ kind: "submenu", label: "Empty", items: [] }] } });
// @ts-expect-error Roles do not have application command IDs.
const identifiedRole: Menu.ApplicationItem = { kind: "role", role: "copy", id: "copy" };
void identifiedRole;
// @ts-expect-error Roles cannot accept click callbacks.
const callbackRole: Menu.ApplicationItem = { kind: "role", role: "copy", click: () => {} };
void callbackRole;
// @ts-expect-error Only the declared native roles are supported.
const unsupportedRole: Menu.ApplicationItem = { kind: "role", role: "shareMenu" };
void unsupportedRole;
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
