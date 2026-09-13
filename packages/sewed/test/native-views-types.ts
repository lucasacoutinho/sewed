import { Effect, Scope } from "effect";
import { MainContext, Renderer, SewedError, WindowControls } from "sewed";
import { BaseWindow, BrowserWindow, WebContentsView } from "sewed/main";

const baseOptions: BaseWindow.Options = { width: 1000, height: 700, show: false };
const viewOptions: WebContentsView.Options = {};
const bounds: WindowControls.Bounds = { x: 0, y: 0, width: 300, height: 700 };

const nativeViews: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.gen(
  function* () {
    const window = yield* BaseWindow.make(baseOptions);
    const browser = yield* BrowserWindow.make({ show: false });
    const view = yield* WebContentsView.make(viewOptions);
    const attachment = yield* window.attach(view, { bounds });
    yield* attachment.setBounds({ ...bounds, width: 400 });
    yield* attachment.setVisible(false);
    yield* attachment.detach;
    yield* browser.attach(view, { bounds, visible: true });
    yield* view.close;
    yield* window.close;
    yield* browser.close;
    yield* view.awaitClosed;
    yield* window.awaitClosed;
    yield* browser.awaitClosed;
  },
);
void nativeViews;

// @ts-expect-error Native window acquisition requires MainContext and Scope.
const missingBaseRequirements: Effect.Effect<BaseWindow.Handle, SewedError, Scope.Scope> =
  BaseWindow.make();
void missingBaseRequirements;

// @ts-expect-error Native view acquisition requires MainContext and Scope.
const missingViewRequirements: Effect.Effect<WebContentsView.Handle, SewedError, Scope.Scope> =
  WebContentsView.make();
void missingViewRequirements;

// @ts-expect-error Attachment acquisition requires the caller's Scope.
const missingAttachmentScope: Effect.Effect<unknown, SewedError, MainContext> = Effect.gen(
  function* () {
    const window = yield* BaseWindow.make();
    const view = yield* WebContentsView.make();
    return yield* window.attach(view, { bounds });
  },
);
void missingAttachmentScope;

// @ts-expect-error Foreign native WebContents adoption is not public API.
WebContentsView.make({ webContents: {} });

declare const baseHandle: BaseWindow.Handle;
declare const browserHandle: BrowserWindow.Handle;
declare const viewHandle: WebContentsView.Handle;
// @ts-expect-error Native BaseWindow objects never cross the public boundary.
baseHandle.native;
// @ts-expect-error Native BrowserWindow objects never cross the public boundary.
browserHandle.native;
// @ts-expect-error Native WebContentsView objects never cross the public boundary.
viewHandle.native;

const rendererEntry = Renderer.entry(new URL("file:///renderer.html"), { bindings: [] });
const loadsInMain: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.gen(
  function* () {
    const view = yield* WebContentsView.make();
    yield* view.webContents.load(rendererEntry, { bindings: [] });
  },
);
void loadsInMain;
