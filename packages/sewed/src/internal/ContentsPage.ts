import { isAbsolute } from "node:path";
import type { WebContents as NativeContents } from "electron";
import { Deferred, Effect, Schema, Stream } from "effect";
import {
  Drag,
  DeviceEmulation,
  EditCommand,
  ImageAnimationPolicy,
  PagePoint,
  SelectionAdjustment,
  VisualZoomLimits,
} from "../WebContents.ts";
import type { Source as ImageSource } from "../Image.ts";
import type { Activity, DevToolsState, PageEvent } from "../WebContents.ts";
import { SewedError } from "../SewedError.ts";
import * as Observation from "./Observation.ts";
import { decoded, protocolError } from "./ProtocolError.ts";
import type { Control } from "./WebContentsCore.ts";

const decodeDrag = Schema.decodeUnknownSync(Drag);
const decodeEmulation = Schema.decodeUnknownSync(DeviceEmulation);
const decodeCommand = Schema.decodeUnknownSync(EditCommand);
const decodeAdjustment = Schema.decodeUnknownSync(SelectionAdjustment);
const decodePoint = Schema.decodeUnknownSync(PagePoint);
const decodeLimits = Schema.decodeUnknownSync(VisualZoomLimits);
const decodeAnimation = Schema.decodeUnknownSync(ImageAnimationPolicy);
const decodeString = Schema.decodeUnknownSync(Schema.String);
const decodeWorker = Schema.decodeUnknownSync(Schema.Literals(["service", "shared"]));
const decodeText = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));

const contextMenu = (params: Electron.ContextMenuParams): PageEvent => ({
  kind: "context-menu",
  x: params.x,
  y: params.y,
  pageUrl: params.pageURL,
  frameUrl: params.frameURL,
  linkUrl: params.linkURL,
  linkText: params.linkText,
  sourceUrl: params.srcURL,
  mediaType: params.mediaType,
  hasImageContents: params.hasImageContents,
  isEditable: params.isEditable,
  selectionText: params.selectionText,
  misspelledWord: params.misspelledWord,
  dictionarySuggestions: [...params.dictionarySuggestions],
  source: params.menuSourceType,
  editFlags: {
    canUndo: params.editFlags.canUndo,
    canRedo: params.editFlags.canRedo,
    canCut: params.editFlags.canCut,
    canCopy: params.editFlags.canCopy,
    canPaste: params.editFlags.canPaste,
    canDelete: params.editFlags.canDelete,
    canSelectAll: params.editFlags.canSelectAll,
  },
});

/** A frame Electron hands over whole; `null` once it navigated away or was destroyed. */
const createdFrame = (details: Electron.FrameCreatedDetails): PageEvent | undefined => {
  const frame = details.frame;
  if (frame === null) return undefined;
  try {
    return {
      kind: "frame",
      change: "created",
      frame: {
        processId: frame.processId,
        routingId: frame.routingId,
        isMainFrame: frame.parent === null,
      },
      url: frame.url,
    };
  } catch {
    return undefined;
  }
};

/**
 * Page events, DevTools state, emulation and editing commands: the members of a web contents that
 * neither load nor decide anything. Kept apart from `WebContentsCore.ts`, which owns navigation
 * state and the decision gates.
 */
export const make = (
  native: NativeContents,
  control: Pick<Control, "closed" | "operation" | "asynchronous">,
  // Supplied by the owner: turning a source into a native image needs Electron's own module,
  // which this file must not import to stay loadable outside it.
  imageOf: (source: ImageSource, label: string) => Electron.NativeImage,
) => {
  const { operation, asynchronous } = control;
  return {
    /**
     * What the page does that main may react to: context-menu requests, cursor and link-target
     * changes, the theme color, HTML fullscreen, DOM readiness, preload failures, frames coming
     * and going, and DevTools opening, closing and taking focus.
     */
    events: Observation.fromEmitter<PageEvent>("Page", () => native, [
      [
        "context-menu",
        (_event: unknown, params: Electron.ContextMenuParams) => contextMenu(params),
      ],
      ["cursor-changed", (_event: unknown, type: string): PageEvent => ({ kind: "cursor", type })],
      [
        "update-target-url",
        (_event: unknown, url: string): PageEvent => ({ kind: "target-url", url }),
      ],
      [
        "did-change-theme-color",
        (_event: unknown, color: string | null): PageEvent => ({ kind: "theme-color", color }),
      ],
      ["enter-html-full-screen", (): PageEvent => ({ kind: "html-full-screen", active: true })],
      ["leave-html-full-screen", (): PageEvent => ({ kind: "html-full-screen", active: false })],
      ["dom-ready", (): PageEvent => ({ kind: "dom-ready" })],
      [
        "preload-error",
        (_event: unknown, path: string, error: Error): PageEvent => ({
          kind: "preload-error",
          path,
          message: error.message,
        }),
      ],
      [
        "frame-created",
        (_event: unknown, details: Electron.FrameCreatedDetails) => createdFrame(details),
      ],
      [
        "did-frame-navigate",
        (
          _event: unknown,
          url: string,
          httpStatus: number,
          _statusText: string,
          isMainFrame: boolean,
          processId: number,
          routingId: number,
        ): PageEvent => ({
          kind: "frame",
          change: "navigated",
          frame: { processId, routingId, isMainFrame },
          url,
          httpStatus,
        }),
      ],
      [
        "did-frame-finish-load",
        (
          _event: unknown,
          isMainFrame: boolean,
          processId: number,
          routingId: number,
        ): PageEvent => ({
          kind: "frame",
          change: "loaded",
          frame: { processId, routingId, isMainFrame },
        }),
      ],
      ["devtools-opened", (): PageEvent => ({ kind: "devtools", change: "opened" })],
      ["devtools-closed", (): PageEvent => ({ kind: "devtools", change: "closed" })],
      ["devtools-focused", (): PageEvent => ({ kind: "devtools", change: "focused" })],
      [
        "devtools-open-url",
        (_event: unknown, url: string): PageEvent => ({ kind: "devtools-open-url", url }),
      ],
      ["devtools-reload-page", (): PageEvent => ({ kind: "devtools-reload-page" })],
      [
        "devtools-search-query",
        (_event: unknown, query: string): PageEvent => ({ kind: "devtools-search-query", query }),
      ],
      [
        "content-bounds-updated",
        (_event: unknown, bounds: Electron.Rectangle): PageEvent => ({
          kind: "content-bounds-updated",
          bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        }),
      ],
      [
        "preferred-size-changed",
        (_event: unknown, size: Electron.Size): PageEvent => ({
          kind: "preferred-size",
          width: size.width,
          height: size.height,
        }),
      ],
      [
        "input-event",
        (_event: unknown, input: { readonly type: string }): PageEvent => ({
          kind: "input",
          type: input.type,
        }),
      ],
      [
        "did-attach-webview",
        (_event: unknown, guest: { readonly id: number }): PageEvent => ({
          kind: "webview-attached",
          nativeId: guest.id,
        }),
      ],
      [
        "will-frame-navigate",
        (details: {
          readonly url: string;
          readonly isMainFrame: boolean;
          readonly isSameDocument: boolean;
        }): PageEvent => ({
          kind: "frame-will-navigate",
          url: details.url,
          isMainFrame: details.isMainFrame,
          isSameDocument: details.isSameDocument,
        }),
      ],
    ]).pipe(Stream.interruptWhen(Deferred.await(control.closed))),
    /** What the page is doing right now. */
    activity: operation((): Activity => ({
      loading: native.isLoading(),
      waitingForResponse: native.isWaitingForResponse(),
      crashed: native.isCrashed(),
      beingCaptured: native.isBeingCaptured(),
      backgroundThrottling: native.getBackgroundThrottling(),
    })),
    devTools: operation((): DevToolsState => ({
      opened: native.isDevToolsOpened(),
      focused: native.isDevToolsFocused(),
      title: native.getDevToolsTitle(),
    })),
    toggleDevTools: operation(() => {
      native.toggleDevTools();
    }),
    setDevToolsTitle: (title: string) =>
      Effect.andThen(
        decoded("Invalid DevTools title", () => decodeString(title)),
        (value) =>
          operation(() => {
            native.setDevToolsTitle(value);
          }),
      ),
    /** Opens DevTools on the element at a point in the page. */
    inspectElement: (point: PagePoint) =>
      Effect.andThen(
        decoded("Invalid inspection point", () => decodePoint(point)),
        ({ x, y }) =>
          operation(() => {
            native.inspectElement(x, y);
          }),
      ),
    /** Opens DevTools for the page's service worker or shared worker. */
    inspectWorker: (kind: "service" | "shared") =>
      Effect.andThen(
        decoded("Invalid worker kind", () => decodeWorker(kind)),
        (value) =>
          operation(() => {
            if (value === "service") native.inspectServiceWorker();
            else native.inspectSharedWorker();
          }),
      ),
    enableDeviceEmulation: (parameters: DeviceEmulation) =>
      Effect.andThen(
        decoded("Invalid device emulation", () => decodeEmulation(parameters)),
        (value) =>
          operation(() => {
            native.enableDeviceEmulation({
              ...value,
              screenSize: { ...value.screenSize },
              viewPosition: { ...value.viewPosition },
              viewSize: { ...value.viewSize },
            });
          }),
      ),
    disableDeviceEmulation: operation(() => {
      native.disableDeviceEmulation();
    }),
    /** Runs an editing command in the focused frame. */
    edit: (command: EditCommand) =>
      Effect.andThen(
        decoded("Invalid edit command", () => decodeCommand(command)),
        (value) =>
          operation(() => {
            native[value]();
          }),
      ),
    /** Replaces the selection with `text`. */
    replace: (text: string) =>
      Effect.andThen(
        decoded("Invalid replacement text", () => decodeString(text)),
        (value) =>
          operation(() => {
            native.replace(value);
          }),
      ),
    /** Replaces the misspelled word under the caret, as a spelling suggestion does. */
    replaceMisspelling: (text: string) =>
      Effect.andThen(
        decoded("Invalid replacement text", () => decodeText(text)),
        (value) =>
          operation(() => {
            native.replaceMisspelling(value);
          }),
      ),
    adjustSelection: (adjustment: SelectionAdjustment) =>
      Effect.andThen(
        decoded("Invalid selection adjustment", () => decodeAdjustment(adjustment)),
        (value) =>
          operation(() => {
            native.adjustSelection({ ...value });
          }),
      ),
    /** Copies the video frame at a point in the page to the clipboard. */
    copyVideoFrameAt: (point: PagePoint) =>
      Effect.andThen(
        decoded("Invalid video point", () => decodePoint(point)),
        ({ x, y }) =>
          operation(() => {
            native.copyVideoFrameAt(x, y);
          }),
      ),
    /** Opens the system's save dialog for the video frame at a point in the page. */
    saveVideoFrameAs: (point: PagePoint) =>
      Effect.andThen(
        decoded("Invalid video point", () => decodePoint(point)),
        ({ x, y }) =>
          operation(() => {
            native.saveVideoFrameAs(x, y);
          }),
      ),
    /** Copies the image at a point in the page to the clipboard. */
    copyImageAt: (point: PagePoint) =>
      Effect.andThen(
        decoded("Invalid image point", () => decodePoint(point)),
        ({ x, y }) =>
          operation(() => {
            native.copyImageAt(x, y);
          }),
      ),
    setVisualZoomLimits: (limits: VisualZoomLimits) =>
      Effect.andThen(
        decoded("Invalid visual zoom limits", () => decodeLimits(limits)),
        (value) =>
          asynchronous("Could not set visual zoom limits", () =>
            native.setVisualZoomLevelLimits(value.minimum, value.maximum),
          ),
      ),
    setImageAnimationPolicy: (policy: ImageAnimationPolicy) =>
      Effect.andThen(
        decoded("Invalid image animation policy", () => decodeAnimation(policy)),
        (value) =>
          operation(() => {
            native.setImageAnimationPolicy(value);
          }),
      ),
    /**
     * Starts an operating system drag of files out of the page, with `icon` under the pointer.
     * Call it while the page handles `dragstart`, having cancelled the page's own drag.
     */
    startDrag: (drag: Drag) =>
      Effect.andThen(
        decoded("Invalid drag", () => {
          const value = decodeDrag(drag);
          for (const file of value.files)
            if (!isAbsolute(file)) throw protocolError("Dragged file paths must be absolute");
          return { files: value.files, icon: imageOf(value.icon, "Drag icon") };
        }),
        ({ files, icon }) =>
          operation(() => {
            native.startDrag({ file: files[0], files: [...files], icon });
          }),
      ),
    /** Shows the dictionary popover for the selected word, on macOS. */
    showDefinitionForSelection: operation(() => {
      if (process.platform !== "darwin")
        throw new SewedError({
          code: "Native",
          message: "Definitions for a selection are available only on macOS",
        });
      native.showDefinitionForSelection();
    }),
    /** Writes a V8 heap snapshot of the page to an absolute path. */
    takeHeapSnapshot: (path: string) =>
      Effect.andThen(
        decoded("Invalid heap snapshot path", () => {
          if (!isAbsolute(decodeString(path)))
            throw protocolError("Heap snapshot path must be absolute");
          return path;
        }),
        (target) =>
          asynchronous("Could not take heap snapshot", () => native.takeHeapSnapshot(target)),
      ),
  };
};
