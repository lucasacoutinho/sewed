import { Effect, Scope } from "effect";
import { MainContext, Renderer, SewedError, WebContents, WindowControls } from "sewed";
import { BaseWindow, BrowserWindow, ImageView, View, WebContentsView } from "sewed/main";

const baseOptions: BaseWindow.Options = { width: 1000, height: 700, show: false };
const viewOptions: WebContentsView.Options = {};
const bounds: WindowControls.Bounds = { x: 0, y: 0, width: 300, height: 700 };

const nativeViews: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.gen(
  function* () {
    const window = yield* BaseWindow.make(baseOptions);
    const browser = yield* BrowserWindow.make({ show: false });
    const view = yield* WebContentsView.make(viewOptions);
    const attachment = yield* window.attach(view, { bounds });
    const attachmentSnapshot: View.AttachmentSnapshot = yield* attachment.current;
    void attachmentSnapshot;
    yield* attachment.raise;
    yield* attachment.setBounds({ ...bounds, width: 400 });
    yield* attachment.setVisible(false);
    const contentsSnapshot: WebContents.Snapshot = yield* view.webContents.current;
    void contentsSnapshot;
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

Effect.gen(function* () {
  const window = yield* BaseWindow.make();
  const view = yield* WebContentsView.make();
  const attachment = yield* window.attach(view, { bounds });
  // @ts-expect-error `raise` is a bare Effect, like `detach`, not a method to call.
  attachment.raise();
});

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

// Container and image views attach like web contents views and nest inside each other.
const composedViews: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.gen(
  function* () {
    const window = yield* BaseWindow.make();
    const panel = yield* View.make({ backgroundColor: "#202020", borderRadius: 8 });
    const picture = yield* ImageView.make({ image: "./logo.png" });
    const content = yield* WebContentsView.make();
    const panelAttachment = yield* window.attach(panel, { bounds });
    const pictureAttachment = yield* panel.attach(picture, { bounds, visible: true });
    const contentAttachment = yield* panel.attach(content, { bounds });
    yield* panel.setBackgroundColor("#101010");
    yield* picture.setImage("./next.png");
    yield* pictureAttachment.setBounds({ ...bounds, width: 64 });
    // Raises the picture above the content view within their shared parent, `panel`.
    yield* pictureAttachment.raise;
    yield* contentAttachment.detach;
    yield* panelAttachment.setVisible(false);
    yield* picture.close;
    yield* panel.close;
    yield* panel.awaitClosed;
  },
);
void composedViews;

// @ts-expect-error Plain views require MainContext and Scope.
const missingViewMain: Effect.Effect<View.Handle, SewedError, Scope.Scope> = View.make();
void missingViewMain;

Effect.gen(function* () {
  const window = yield* BaseWindow.make();
  // @ts-expect-error Only Sewed view handles attach.
  yield* window.attach({ id: "foreign" }, { bounds });
});

declare const panelHandle: View.Handle;
declare const imageHandle: ImageView.Handle;
// @ts-expect-error Native View objects never cross the public boundary.
panelHandle.native;
// @ts-expect-error Native ImageView objects never cross the public boundary.
imageHandle.native;

// Images come from a file path or from encoded image bytes, such as a bundled PNG.
const pictureFromBytes = ImageView.make({ image: new Uint8Array([137, 80, 78, 71]) });
const replacedFromBytes = imageHandle.setImage(new Uint8Array([137, 80, 78, 71]));
void pictureFromBytes;
void replacedFromBytes;
// @ts-expect-error An image is a path or bytes, not a number.
void ImageView.make({ image: 7 });
