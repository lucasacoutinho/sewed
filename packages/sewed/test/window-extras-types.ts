import { Effect, Schema, Scope } from "effect";
import type { Stream } from "effect";
import { MainContext, SewedError, WindowControls } from "sewed";
import { BaseWindow, BrowserWindow, WebContentsView } from "sewed/main";

declare const window: BrowserWindow.Handle;
declare const base: BaseWindow.Handle;

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

const snapshot: WindowControls.State = {
  bounds: { x: 0, y: 0, width: 1, height: 1 },
  normalBounds: { x: 0, y: 0, width: 1, height: 1 },
  contentBounds: { x: 0, y: 0, width: 1, height: 1 },
  visible: true,
  focused: false,
  minimized: false,
  maximized: false,
  fullScreen: false,
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
