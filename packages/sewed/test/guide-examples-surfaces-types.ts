import { Effect, Layer, Match, Option, Schema, Stream } from "effect";
import type { Scope } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding, Dialog, MainContext, Remote, Screen as ScreenData, SewedError } from "sewed";
import type { Renderer } from "sewed";
import {
  BaseWindow,
  BrowserWindow,
  Capability,
  Clipboard,
  GlobalShortcut,
  ImageView,
  NativeTheme,
  Notification,
  PowerMonitor,
  Screen,
  Shell,
  Tray,
  View,
  WebContentsView,
  WindowControls,
  host,
} from "sewed/main";
import type { Session } from "sewed/main";

/**
 * The second file of guide examples, under the rules `guide-examples-types.ts` states: each
 * example is spelled as its guide spells it, a `yield*` example is wrapped in the `Effect.gen` it
 * would be written inside, and a handle or value the guide already has in hand is `declare const`.
 * These are the guides for windows, views, dialogs and the desktop surfaces.
 */

declare const window: BrowserWindow.Handle;
declare const session: Session.Handle;
declare const entry: Renderer.Entry;
declare const Document: Renderer.Entry;
declare const downloads: string;
declare const logoPath: string;
declare const trayPng: string;
declare const openFile: (
  path: string,
) => Effect.Effect<{ readonly read: (size: number) => Effect.Effect<string> }>;
declare const onDisplayChange: (change: ScreenData.Change) => Effect.Effect<void>;

type Program<A = void> = Effect.Effect<A, SewedError, MainContext | Scope.Scope>;

// --- docs/desktop-surfaces.md -----------------------------------------------------------------

export const desktopSurfaces = Effect.gen(function* () {
  const theme = yield* Capability.serve(NativeTheme.capability);
  const power = yield* Capability.serve(PowerMonitor.capability);
  const notifications = yield* Capability.serve(Notification.capability);
  const paste = yield* Capability.serve(Clipboard.capability);
  const links = yield* Capability.serve(Shell.capability);

  yield* window.webContents.load(entry, {
    bindings: [
      Binding.to(NativeTheme.capability.slot, theme),
      Binding.to(PowerMonitor.capability.slot, power),
      Binding.to(Notification.capability.slot, notifications),
      Binding.to(Clipboard.capability.slot, paste),
      Binding.to(Shell.capability.slot, links),
    ],
  });
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      NativeTheme.native({ allowSetSource: true }),
      PowerMonitor.native(),
      Notification.native(),
      Clipboard.native({ read: ["text", "html"], write: ["text"] }),
      Shell.native({
        policy: [{ kind: "origin", origin: "https://docs.example.com" }],
        paths: [downloads],
      }),
    ),
  ),
);

// --- docs/remote-resources.md -----------------------------------------------------------------

const ReaderMethods = RpcGroup.make(
  Rpc.make("read", {
    payload: { size: Schema.Finite },
    success: Schema.String,
  }),
);

const Reader = Remote.make({
  payload: Schema.Struct({ path: Schema.String }),
  protocol: ReaderMethods,
});

export const Readers = Binding.slot("readers", Reader.protocol);

export const readers = Remote.layer(Reader, ({ path }) =>
  ReaderMethods.toLayer(
    Effect.gen(function* () {
      const file = yield* openFile(path);
      return {
        read: ({ size }) => file.read(size),
      };
    }),
  ),
);

// --- docs/file-dialogs.md ---------------------------------------------------------------------

export const fileDialogs = Effect.gen(function* () {
  const selected = yield* window.dialog.open({
    mode: "file",
    multiple: true,
    filters: [{ name: "Text", extensions: ["txt", "md"] }],
  });

  const destination = yield* window.dialog.save({
    defaultPath: "notes.txt",
    filters: [{ name: "Text", extensions: ["txt"] }],
    properties: ["dontAddToRecent"],
  });
  return { selected, destination };
});

const Picker = RpcGroup.make(Rpc.make("open", { success: Dialog.OpenResult, error: SewedError }));
export const Files = Binding.slot("files", Picker);

// --- docs/dialogs.md --------------------------------------------------------------------------

export const dialogsMessage = Effect.gen(function* () {
  const window = yield* BrowserWindow.make({ title: "Dialog example" });
  const result = yield* window.dialog.message({
    message: "Continue?",
    buttons: ["Cancel", "Continue"],
    defaultId: 1,
    cancelId: 0,
    checkbox: { label: "Remember this choice", checked: false },
  });
  return result;
});

const Prompt = RpcGroup.make(Rpc.make("ask", { success: Dialog.MessageResult, error: SewedError }));
export const makePrompt = (window: BrowserWindow.Handle) =>
  host(
    Prompt,
    Prompt.toLayer({
      ask: () =>
        window.dialog.message({
          message: "Continue?",
          buttons: ["Cancel", "Continue"],
          cancelId: 0,
        }),
    }),
  );

// --- docs/screen.md ---------------------------------------------------------------------------

export const screenReads = Effect.gen(function* () {
  const displays = yield* Screen.displays;
  const primary = yield* Screen.primary;
  const cursor = yield* Screen.cursor;
  const nearest = yield* Screen.nearest(cursor);
  const matching = yield* Screen.matching(primary.workArea);

  yield* Screen.changes.pipe(Stream.runForEach(onDisplayChange), Effect.forkScoped);
  return { displays, nearest, matching };
});

const DisplayInfo = RpcGroup.make(
  Rpc.make("primary", { success: ScreenData.Display, error: SewedError }),
);
export const displayInfo = host(
  DisplayInfo,
  DisplayInfo.toLayer({ primary: () => Screen.primary }),
);

// --- docs/native-views.md ---------------------------------------------------------------------

export const compose = Effect.gen(function* () {
  const window = yield* BaseWindow.make({ width: 1000, height: 700 });
  const sidebar = yield* WebContentsView.make();
  const content = yield* WebContentsView.make();

  const sidebarAttachment = yield* window.attach(sidebar, {
    bounds: { x: 0, y: 0, width: 280, height: 700 },
  });
  yield* window.attach(content, {
    bounds: { x: 280, y: 0, width: 720, height: 700 },
  });

  yield* sidebarAttachment.setVisible(false);
});

export const nativeViewsPanel = Effect.gen(function* () {
  const panel = yield* View.make({ backgroundColor: "#202020", borderRadius: 8 });
  const logo = yield* ImageView.make({ image: logoPath });
  yield* window.attach(panel, { bounds: { x: 0, y: 0, width: 280, height: 700 } });
  yield* panel.attach(logo, { bounds: { x: 16, y: 16, width: 48, height: 48 } });
});

// --- docs/window-geometry.md and docs/window-controls.md --------------------------------------

const Controls = WindowControls.capability.slot;

export const windowGeometry = Effect.gen(function* () {
  const window = yield* BrowserWindow.make({ show: false });
  yield* window.setBounds({ x: 100, y: 100, width: 960, height: 640 });
  yield* window.show;
  yield* window.setFullScreen(true);

  const controls = yield* Controls();
  yield* controls.setBounds({ width: 800 });
  yield* controls.setFullScreen({ fullScreen: false });

  if ((yield* window.state.pipe(Stream.runHead)).pipe(Option.exists((s) => s.simpleFullScreen)))
    yield* window.setSimpleFullScreen(false);
});

export const windowControls = Effect.gen(function* () {
  const window = yield* BrowserWindow.make({ show: false });
  const controls = yield* Capability.serve(WindowControls.capability).pipe(
    Effect.provide(WindowControls.native(window)),
  );
  yield* window.webContents.load(Document, { bindings: [Binding.to(Controls, controls)] });
  yield* window.show;

  yield* window.showInactive;

  const client = yield* Controls();
  yield* client.hide();
  yield* client.show();
});

// --- docs/session-storage.md ------------------------------------------------------------------

export const sessionStorage: Program = Effect.gen(function* () {
  yield* session.clearStorage({
    kind: "origin",
    origin: "https://example.com",
    storages: ["localstorage", "indexdb"],
  });

  yield* session.clearStorage({
    kind: "session",
    storages: ["cookies"],
  });
});

// --- docs/context-menus.md --------------------------------------------------------------------

export const contextMenu = Effect.gen(function* () {
  const window = yield* BrowserWindow.make({ title: "Menu example" });
  const result = yield* window.menu.popup({
    items: [
      { kind: "command", id: "inspect", label: "Inspect" },
      { kind: "separator" },
      { kind: "checkbox", id: "details", label: "Show details", checked: false },
    ],
    position: { x: 24, y: 24 },
  });
  const description = Match.value(result).pipe(
    Match.when({ kind: "command" }, ({ id }) => `Selected ${id}`),
    Match.when({ kind: "checkbox" }, ({ id, checked }) => `${id}: ${checked}`),
    Match.when({ kind: "radio" }, ({ id }) => `Selected ${id}`),
    Match.when({ kind: "dismissed" }, () => "Dismissed"),
    Match.exhaustive,
  );
  yield* Effect.log(description);
});

// --- docs/desktop-resources.md ----------------------------------------------------------------

export const tray = Tray.make({
  icon: trayPng,
  template: true,
  tooltip: "Sewed",
  menu: { items: [{ kind: "command", id: "open", label: "Open" }] },
});

export const shortcut = GlobalShortcut.register("CommandOrControl+Shift+S");
