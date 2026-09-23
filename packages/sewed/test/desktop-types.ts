import { Effect, Scope, Stream } from "effect";
import {
  GlobalShortcut as GlobalShortcutData,
  MainContext,
  Renderer,
  SewedError,
  Tray as TrayData,
} from "sewed";
import { GlobalShortcut, Tray } from "sewed/main";

const trayOptions: TrayData.Options = {
  icon: "./tray.png",
  template: true,
  menu: {
    items: [{ kind: "command", id: "open", label: "Open" }],
  },
};
const tray = Tray.make(trayOptions);
// A tray icon is `Image.Source`, exactly like a window icon: a path or already-encoded bytes.
const trayFromBytes = Tray.make({ icon: new Uint8Array([137, 80, 78, 71]) });
void trayFromBytes;
// @ts-expect-error Tray.Icon is gone; a tray icon is Image.Source, a path or already-encoded bytes.
void TrayData.Icon;
// @ts-expect-error A tray icon is a path or encoded bytes, not an arbitrary number.
Tray.make({ icon: 42 });
const shortcut = GlobalShortcut.register("Control+Shift+S");

const mainTray: Effect.Effect<Tray.Handle, SewedError, MainContext | Scope.Scope> = tray;
const mainShortcut: Effect.Effect<GlobalShortcut.Handle, SewedError, MainContext | Scope.Scope> =
  shortcut;
void mainTray;
void mainShortcut;

Effect.gen(function* () {
  const owner = yield* tray;
  const events: Stream.Stream<TrayData.Event, SewedError, MainContext> = owner.events;
  const setToolTip: Effect.Effect<void, SewedError, MainContext> = owner.setToolTip("Sewed");
  const setImage: Effect.Effect<void, SewedError, MainContext> = owner.setImage("./next.png");
  const setImageFromBytes: Effect.Effect<void, SewedError, MainContext> = owner.setImage(
    new Uint8Array([137, 80, 78, 71]),
    { template: true },
  );
  void setImageFromBytes;
  const setMenu: Effect.Effect<void, SewedError, MainContext> = owner.setMenu({
    items: [{ kind: "checkbox", id: "enabled", label: "Enabled", checked: true }],
  });
  void events;
  void setToolTip;
  void setImage;
  void setMenu;
  const registered = yield* shortcut;
  const presses: Stream.Stream<void, SewedError, MainContext> = registered.presses;
  void presses;
});

// @ts-expect-error Tray resources retain their main runtime requirement.
const missingTrayMain: Effect.Effect<Tray.Handle, SewedError, Scope.Scope> = tray;
void missingTrayMain;

// @ts-expect-error Shortcut resources retain their main runtime requirement.
const missingShortcutMain: Effect.Effect<GlobalShortcut.Handle, SewedError, Scope.Scope> = shortcut;
void missingShortcutMain;

Tray.make({
  icon: "./tray.png",
  menu: {
    items: [{ kind: "command", id: "open", label: "Open" }],
    // @ts-expect-error Tray menu configuration intentionally has no popup position.
    position: { x: 0, y: 0 },
  },
});

const rendererTray = Tray.make({ icon: "./tray.png" });
// @ts-expect-error A renderer cannot acquire a native tray.
Renderer.run({ url: new URL("file:///renderer.html"), bindings: [] }, rendererTray);

const event: TrayData.Event = {
  kind: "menu-selection",
  selection: { kind: "command", id: "open" },
};
const shortcutAccelerator: GlobalShortcutData.Accelerator = "Control+Shift+S";
void event;
void shortcutAccelerator;
