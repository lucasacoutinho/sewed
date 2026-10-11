import { Effect, Layer, Schema, Scope } from "effect";
import type { Stream } from "effect";
import { Binding, Decidables, Decision, MainContext, SewedError, WindowControls } from "sewed";
import {
  BaseWindow,
  BrowserWindow,
  Capability,
  WebContentsView,
  WindowControls as WindowControlsMain,
} from "sewed/main";

declare const window: BrowserWindow.Handle;
declare const base: BaseWindow.Handle;

// Both window handles share `decide`, installed by `internal/Window.ts`'s own `make`: `BaseWindow`
// and `BrowserWindow` both spread its returned handle through `Window.toPublic`.
const windowDecide: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = window.decide(
  Decidables.Window.Close,
  Decision.async(() => Effect.succeed("allow")),
);
const baseDecide: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = base.decide(
  Decidables.Window.Close,
  Decision.async(() => Effect.succeed("allow")),
);
void windowDecide;
void baseDecide;
window.decide(
  Decidables.Window.Close,
  // @ts-expect-error Window.Close answers Allowance ("deny" | "allow"), not an arbitrary string.
  Decision.async(() => Effect.succeed("maybe")),
);

// Appearance commands live on both window handles and publish into the state stream.
const title: Effect.Effect<void, SewedError, MainContext> = window.setTitle("Sewed");
const onTop: Effect.Effect<void, SewedError, MainContext> = window.setAlwaysOnTop(true, "floating");
const opacity: Effect.Effect<void, SewedError, MainContext> = base.setOpacity(0.5);
const progress: Effect.Effect<void, SewedError, MainContext> = window.setProgress(
  0.5,
  "indeterminate",
);
const overlay: Effect.Effect<void, SewedError, MainContext> = window.setOverlayIcon(null, "");
const parent: Effect.Effect<void, SewedError, MainContext> = window.setParent(base);
const detached: Effect.Effect<void, SewedError, MainContext> = window.setParent(null);
const state: Stream.Stream<WindowControls.State, SewedError, MainContext> = base.state;
void title;
void onTop;
void opacity;
void progress;
void overlay;
void parent;
void detached;
void state;

// Simple fullscreen lives on both window handles too, mirroring fullScreen.
const simpleFullScreen: Effect.Effect<void, SewedError, MainContext> =
  window.setSimpleFullScreen(true);
const baseSimpleFullScreen: Effect.Effect<void, SewedError, MainContext> =
  base.setSimpleFullScreen(false);
const simpleFullScreenState = (value: WindowControls.State): boolean => value.simpleFullScreen;
void simpleFullScreen;
void baseSimpleFullScreen;
void simpleFullScreenState;
// @ts-expect-error Simple fullscreen requires an explicit boolean.
window.setSimpleFullScreen("true");

// A window's icon is `Image.Source`: a path or already-encoded bytes, on `setIcon` and on the
// overlay icon alike.
const iconFromPath: Effect.Effect<void, SewedError, MainContext> = window.setIcon("icon.png");
const iconFromBytes: Effect.Effect<void, SewedError, MainContext> = window.setIcon(
  new Uint8Array([137, 80, 78, 71]),
);
const overlayFromBytes: Effect.Effect<void, SewedError, MainContext> = window.setOverlayIcon(
  new Uint8Array([137, 80, 78, 71]),
  "busy",
);
void iconFromPath;
void iconFromBytes;
void overlayFromBytes;

// @ts-expect-error A window icon is a path or encoded bytes, not an arbitrary number.
window.setIcon(42);
// @ts-expect-error An overlay icon is a path or encoded bytes, not an arbitrary number.
window.setOverlayIcon(42, "busy");

const snapshot: WindowControls.State = {
  bounds: { x: 0, y: 0, width: 1, height: 1 },
  normalBounds: { x: 0, y: 0, width: 1, height: 1 },
  contentBounds: { x: 0, y: 0, width: 1, height: 1 },
  visible: true,
  focused: false,
  minimized: false,
  maximized: false,
  fullScreen: false,
  simpleFullScreen: false,
  title: "Sewed",
  alwaysOnTop: false,
  opacity: 1,
  resizable: true,
  movable: true,
  minimizable: true,
  maximizable: true,
  closable: true,
  fullScreenable: true,
  menuBarVisible: true,
  kiosk: false,
};
void snapshot;

// Creation options are plain data plus a Sewed parent handle.
const child: Effect.Effect<BrowserWindow.Handle, SewedError, MainContext | Scope.Scope> =
  BrowserWindow.make({
    parent: base,
    modal: true,
    alwaysOnTop: true,
    opacity: 0.9,
    frame: false,
    backgroundColor: "#000000",
    minWidth: 200,
  });
void child;

// @ts-expect-error Appearance commands retain main placement.
const titleWithoutMain: Effect.Effect<void, SewedError> = window.setTitle("Sewed");
void titleWithoutMain;

// @ts-expect-error Always-on-top levels are a closed set.
window.setAlwaysOnTop(true, "top");

// @ts-expect-error Progress modes are a closed set.
window.setProgress(0.5, "busy");

// @ts-expect-error A parent must be a Sewed window handle.
BrowserWindow.make({ parent: {} });

// @ts-expect-error Native Electron objects are not accepted as parents.
BrowserWindow.make({ parent: { id: "x", native: {} }, nativeParent: true });

// macOS window chrome is creation data; traffic light visibility is a main-only command.
const macWindow = BrowserWindow.make({
  titleBarStyle: "hiddenInset",
  trafficLightPosition: { x: 12, y: 10 },
  backgroundThrottling: false,
});
const throttledView = WebContentsView.make({ backgroundThrottling: false });
const buttons: Effect.Effect<void, SewedError, MainContext> =
  window.setWindowButtonVisibility(true);
const baseButtons: Effect.Effect<void, SewedError, MainContext> =
  base.setWindowButtonVisibility(false);
void macWindow;
void throttledView;
void buttons;
void baseButtons;
// @ts-expect-error Title bar styles are a closed set.
const unknownStyle = BrowserWindow.make({ titleBarStyle: "sideways" });
// @ts-expect-error Background throttling belongs to web contents, not to a bare window.
const baseThrottling = BaseWindow.make({ backgroundThrottling: false });
void unknownStyle;
void baseThrottling;

// Automation is declared at creation and narrows the handle; release compositions omit it.
const automatedWindow = BrowserWindow.make({
  automation: { evaluate: true, devtools: ["Page.captureScreenshot"] },
});
const automationProgram = Effect.gen(function* () {
  const handle = yield* automatedWindow;
  const pageTitle: Effect.Effect<string, SewedError, MainContext> = handle.automation.evaluate(
    "document.title",
    Schema.String,
  );
  const screenshot: Effect.Effect<unknown, SewedError, MainContext> = handle.automation.devtools(
    "Page.captureScreenshot",
    { format: "png" },
    Schema.Unknown,
  );
  void pageTitle;
  void screenshot;
  // @ts-expect-error Input was not declared for this window.
  void handle.automation.input({ type: "keyDown", keyCode: "a" });
  // @ts-expect-error A method outside the declared allowlist is rejected.
  void handle.automation.devtools("Runtime.evaluate", undefined, Schema.Unknown);
});
void automationProgram;
// @ts-expect-error A window created without a declaration has no evaluate member.
void window.automation.evaluate("1", Schema.Unknown);

// The content area is part of window state, and the capture source id is a main-only read.
const mediaSource: Effect.Effect<string, SewedError, MainContext> = window.mediaSourceId;
const baseMediaSource: Effect.Effect<string, SewedError, MainContext> = base.mediaSourceId;
const contentWidth = (value: WindowControls.State): number => value.contentBounds.width;
void mediaSource;
void baseMediaSource;
void contentWidth;

// The content area can change without a move or resize event, so layout reads it on demand.
const contentArea: Effect.Effect<WindowControls.State["contentBounds"], SewedError, MainContext> =
  window.contentBounds;
const baseContentArea: Effect.Effect<
  WindowControls.State["contentBounds"],
  SewedError,
  MainContext
> = base.contentBounds;
void contentArea;
void baseContentArea;

// A window's controls are one capability, and its native Layer carries the window it drives.
const controlsNative: Layer.Layer<typeof WindowControls.capability, SewedError, MainContext> =
  WindowControlsMain.native(window);
const baseControlsNative: Layer.Layer<typeof WindowControls.capability, SewedError, MainContext> =
  WindowControlsMain.native(base);
void controlsNative;
void baseControlsNative;

// @ts-expect-error The removed hosted owner is gone; a window has no controls member.
window.controls;

// The one-shot read behind the capability's `state`; the stream above it still replays and follows.
const currentState: Effect.Effect<WindowControls.State, SewedError, MainContext> = window.current;
const baseCurrentState: Effect.Effect<WindowControls.State, SewedError, MainContext> = base.current;
void currentState;
void baseCurrentState;

// Serving it binds one window's controls to a document, exactly like any other capability.
Effect.gen(function* () {
  const controls = yield* Capability.serve(WindowControls.capability).pipe(
    Effect.provide(WindowControlsMain.native(window)),
  );
  const bound = Binding.to(WindowControls.capability.slot, controls);
  void bound;
}).pipe(Effect.scoped) satisfies Effect.Effect<void, SewedError, MainContext>;

// An operation carries no runtime requirement: acquiring the capability is what proved it.
const controlsCall = Effect.gen(function* () {
  const controls = yield* WindowControls.capability;
  const changes: Stream.Stream<WindowControls.State, SewedError> = controls.changes();
  const snapshot: Effect.Effect<WindowControls.State, SewedError> = controls.state();
  yield* controls.setBounds({ width: 800 });
  yield* controls.setSimpleFullScreen({ simpleFullScreen: true });
  yield* snapshot;
  return changes;
});
void controlsCall;

void Effect.gen(function* () {
  const controls = yield* WindowControls.capability;
  // @ts-expect-error Bounds stay numbers through the capability.
  yield* controls.setBounds({ width: "wide" });
  // @ts-expect-error Always-on-top levels stay a closed set through the capability.
  yield* controls.setAlwaysOnTop({ alwaysOnTop: true, level: "top" });
  // @ts-expect-error Simple fullscreen stays a boolean through the capability.
  yield* controls.setSimpleFullScreen({ simpleFullScreen: "top" });
});

// Size limits, aspect ratio, input, and placement are main-only commands on either window kind.
const minimum: Effect.Effect<void, SewedError, MainContext> = window.setMinimumSize({
  width: 320,
  height: 200,
});
const maximum: Effect.Effect<void, SewedError, MainContext> = base.setMaximumSize({
  width: 0,
  height: 0,
});
const limits: Effect.Effect<WindowControls.SizeLimits, SewedError, MainContext> = window.sizeLimits;
const ratio: Effect.Effect<void, SewedError, MainContext> = window.setAspectRatio(16 / 9, {
  width: 0,
  height: 40,
});
const enabledNow: Effect.Effect<boolean, SewedError, MainContext> = window.enabled;
const disabled: Effect.Effect<void, SewedError, MainContext> = window.setEnabled(false);
const passThrough: Effect.Effect<void, SewedError, MainContext> = window.setIgnoreMouseEvents(true);
const autoHide: Effect.Effect<void, SewedError, MainContext> = window.setAutoHideMenuBar(true);
const everywhere: Effect.Effect<void, SewedError, MainContext> =
  window.setVisibleOnAllWorkspaces(true);
const onEvery: Effect.Effect<boolean, SewedError, MainContext> = window.visibleOnAllWorkspaces;
const painted: Effect.Effect<void, SewedError, MainContext> = window.setBackgroundColor("#101010");
const paint: Effect.Effect<string, SewedError, MainContext> = base.backgroundColor;
const centered: Effect.Effect<void, SewedError, MainContext> = window.center;
const raised: Effect.Effect<void, SewedError, MainContext> = base.moveTop;
// @ts-expect-error A size names both dimensions.
void window.setMinimumSize({ width: 320 });
void minimum;
void maximum;
void limits;
void ratio;
void enabledNow;
void disabled;
void passThrough;
void autoHide;
void everywhere;
void onEvery;
void painted;
void paint;
void centered;
void raised;

// Content geometry, shape, overlay and the events that are not state.
const windowEvents: Stream.Stream<WindowControls.Event, SewedError, MainContext> = window.events;
void windowEvents;
const handleBytes: Effect.Effect<Uint8Array, SewedError, MainContext> = base.nativeHandle;
void handleBytes;
void window.setContentBounds({ x: 0, y: 0, width: 800, height: 600 });
// @ts-expect-error content bounds name all four fields.
void window.setContentBounds({ width: 800, height: 600 });
void window.setContentSize({ width: 800, height: 600 });
void window.setHasShadow(false);
void window.setTitleBarOverlay({ color: "#202020", height: 32 });
void window.setShape([{ x: 0, y: 0, width: 10, height: 10 }]);
void window.moveAbove("window:1:0");
void window.setAccessibleTitle("Inbox");
void window.removeMenu;
const isNormal: Effect.Effect<boolean, SewedError, MainContext> = window.normal;
void isNormal;

// Platform members share the handle; they fail Native where Electron lacks them.
void window.setVibrancy("sidebar");
// @ts-expect-error not a vibrancy material
void window.setVibrancy("glass");
void window.setBackgroundMaterial("mica");
void window.setThumbarButtons([{ id: "play", icon: "/icons/play.png", flags: ["enabled"] }]);
const thumbar: Stream.Stream<string, SewedError, MainContext> = window.thumbarClicks;
void thumbar;
const messages: Stream.Stream<WindowControls.WindowMessage, SewedError, MainContext> =
  window.windowMessages(0x0010);
void messages;
void window.tabs.add(base);
const tabId: Effect.Effect<string | null, SewedError, MainContext> = window.tabs.identifier;
void tabId;
void window.decide(
  Decidables.Window.SessionEnd,
  Decision.sync((event) => (event.reasons.includes("critical") ? "allow" : "deny")),
);
