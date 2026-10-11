import { Schema } from "effect";
import type { Effect, Stream } from "effect";
import * as Binary from "./Binary.ts";
import * as Image from "./Image.ts";
import { Bounds } from "./internal/Geometry.ts";
import type { MainContext } from "./RuntimeContext.ts";
import type { SewedError } from "./SewedError.ts";

export const DevToolsOptions = Schema.Struct({
  mode: Schema.optionalKey(Schema.Literals(["left", "right", "bottom", "undocked", "detach"])),
  activate: Schema.optionalKey(Schema.Boolean),
});
export type DevToolsOptions = typeof DevToolsOptions.Type;

const Ready = Schema.Struct({
  status: Schema.Literal("ready"),
  url: Schema.String,
  processId: Schema.Finite,
  httpStatus: Schema.Finite,
});
const Failed = Schema.Struct({
  status: Schema.Literal("failed"),
  url: Schema.String,
  code: Schema.Finite,
  description: Schema.String,
});
export const State = Schema.Union([
  Schema.Struct({ status: Schema.Literal("idle") }),
  Schema.Struct({ status: Schema.Literal("loading"), url: Schema.String }),
  Ready,
  Failed,
  Schema.Struct({
    status: Schema.Literal("gone"),
    reason: Schema.String,
    exitCode: Schema.Finite,
  }),
]);
export type State = typeof State.Type;

/**
 * What `back`, `forward`, and `go` answer once the navigation they started has settled — the
 * state stream's `Ready` or `Failed` branch, never `idle`, `loading`, or `gone`. A history move
 * cannot itself crash the renderer or leave the page unstarted.
 */
export const Settled = Schema.Union([Ready, Failed]);
export type Settled = typeof Settled.Type;

export const Responsiveness = Schema.Union([
  Schema.Struct({ status: Schema.Literal("unknown") }),
  Schema.Struct({
    status: Schema.Literals(["responsive", "unresponsive"]),
    processId: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
]);
export type Responsiveness = typeof Responsiveness.Type;

/** A console message a page logged; the stream is main-only and never served to renderers. */
export const ConsoleMessage = Schema.Struct({
  level: Schema.Literals(["debug", "info", "warning", "error"]),
  message: Schema.String,
  lineNumber: Schema.Finite,
  sourceId: Schema.String,
});
export type ConsoleMessage = typeof ConsoleMessage.Type;

/** A window, webview, navigation, redirect, or download a policy denied. */
export const Blocked = Schema.Struct({
  kind: Schema.Literals(["navigation", "redirect", "popup", "webview", "download"]),
  url: Schema.String,
});
export type Blocked = typeof Blocked.Type;

const Positive = Schema.Finite.check(Schema.isGreaterThan(0));
const Count = Schema.Int.check(Schema.isGreaterThan(0));
const Offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PrintPageSizeName = Schema.Literals([
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "Legal",
  "Letter",
  "Tabloid",
]);
const CustomPageSize = Schema.Struct({ width: Positive, height: Positive });

/** A named page size or custom dimensions in microns. */
export const PrintPageSize = Schema.Union([PrintPageSizeName, CustomPageSize]);
export type PrintPageSize = typeof PrintPageSize.Type;

/** A named page size, including Ledger, or custom dimensions in inches. */
export const PdfPageSize = Schema.Union([
  Schema.Literals([...PrintPageSizeName.literals, "Ledger"]),
  CustomPageSize,
]);
export type PdfPageSize = typeof PdfPageSize.Type;

export const PrintOptions = Schema.Struct({
  silent: Schema.optionalKey(Schema.Boolean),
  printBackground: Schema.optionalKey(Schema.Boolean),
  deviceName: Schema.optionalKey(Schema.String),
  color: Schema.optionalKey(Schema.Boolean),
  landscape: Schema.optionalKey(Schema.Boolean),
  scaleFactor: Schema.optionalKey(Positive),
  pagesPerSheet: Schema.optionalKey(Count),
  collate: Schema.optionalKey(Schema.Boolean),
  copies: Schema.optionalKey(Count),
  pageRanges: Schema.optionalKey(Schema.Array(Schema.Struct({ from: Offset, to: Offset }))),
  duplexMode: Schema.optionalKey(Schema.Literals(["simplex", "shortEdge", "longEdge"])),
  header: Schema.optionalKey(Schema.String),
  footer: Schema.optionalKey(Schema.String),
  pageSize: Schema.optionalKey(PrintPageSize),
  margins: Schema.optionalKey(
    Schema.Struct({
      marginType: Schema.optionalKey(
        Schema.Literals(["default", "none", "printableArea", "custom"]),
      ),
      top: Schema.optionalKey(Offset),
      bottom: Schema.optionalKey(Offset),
      left: Schema.optionalKey(Offset),
      right: Schema.optionalKey(Offset),
    }),
  ),
});
export type PrintOptions = typeof PrintOptions.Type;

export const PdfOptions = Schema.Struct({
  landscape: Schema.optionalKey(Schema.Boolean),
  displayHeaderFooter: Schema.optionalKey(Schema.Boolean),
  printBackground: Schema.optionalKey(Schema.Boolean),
  scale: Schema.optionalKey(Positive),
  pageSize: Schema.optionalKey(PdfPageSize),
  margins: Schema.optionalKey(
    Schema.Struct({
      top: Schema.optionalKey(Schema.Finite),
      bottom: Schema.optionalKey(Schema.Finite),
      left: Schema.optionalKey(Schema.Finite),
      right: Schema.optionalKey(Schema.Finite),
    }),
  ),
  pageRanges: Schema.optionalKey(Schema.String),
  headerTemplate: Schema.optionalKey(Schema.String),
  footerTemplate: Schema.optionalKey(Schema.String),
  preferCSSPageSize: Schema.optionalKey(Schema.Boolean),
  generateTaggedPDF: Schema.optionalKey(Schema.Boolean),
  generateDocumentOutline: Schema.optionalKey(Schema.Boolean),
});
export type PdfOptions = typeof PdfOptions.Type;

export const CaptureOptions = Schema.Struct({
  rect: Schema.optionalKey(Bounds),
  stayHidden: Schema.optionalKey(Schema.Boolean),
  stayAwake: Schema.optionalKey(Schema.Boolean),
});
export type CaptureOptions = typeof CaptureOptions.Type;

/**
 * What a capture answers instead of bare bytes: the PNG, its pixel size as the native image
 * itself reports it, and the display's scale factor for the area it captured. `width` and
 * `height` are always pixels, never DIPs — a consumer who wants bytes alone reads one field.
 */
export const Capture = Schema.Struct({
  bytes: Binary.Bytes,
  width: Schema.Finite,
  height: Schema.Finite,
  scaleFactor: Schema.Finite,
});
export type Capture = typeof Capture.Type;

export const ZoomFactor = Schema.Finite.check(Schema.isBetween({ minimum: 0.25, maximum: 5 }));
export const Zoom = Schema.Struct({ factor: ZoomFactor });
export type Zoom = typeof Zoom.Type;

export const Audio = Schema.Struct({ muted: Schema.Boolean, audible: Schema.Boolean });
export type Audio = typeof Audio.Type;

export const FindText = Schema.String.check(Schema.isMinLength(1));
export const FindOptions = Schema.Struct({
  forward: Schema.optionalKey(Schema.Boolean),
  matchCase: Schema.optionalKey(Schema.Boolean),
});
export type FindOptions = typeof FindOptions.Type;
export const FindResult = Schema.Struct({
  activeMatchOrdinal: Schema.Int,
  matches: Schema.Int,
  selectionArea: Bounds,
  finalUpdate: Schema.Boolean,
});
export type FindResult = typeof FindResult.Type;
export const FindStop = Schema.Literals(["clearSelection", "keepSelection", "activateSelection"]);
export type FindStop = typeof FindStop.Type;

/** One search over a document: its results end when it stops or a new search replaces it. */
export interface Search {
  readonly results: Stream.Stream<FindResult, SewedError, MainContext>;
  readonly next: (forward?: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly stop: (action?: FindStop) => Effect.Effect<void, SewedError, MainContext>;
}

export const HistoryEntry = Schema.Struct({ url: Schema.String, title: Schema.String });
export type HistoryEntry = typeof HistoryEntry.Type;
export const History = Schema.Struct({
  index: Schema.Int,
  entries: Schema.Array(HistoryEntry),
  canGoBack: Schema.Boolean,
  canGoForward: Schema.Boolean,
});
export type History = typeof History.Type;

export const SaveType = Schema.Literals(["HTMLOnly", "HTMLComplete", "MHTML"]);
export type SaveType = typeof SaveType.Type;

export const StyleOptions = Schema.Struct({
  origin: Schema.optionalKey(Schema.Literals(["author", "user"])),
});
export type StyleOptions = typeof StyleOptions.Type;

/**
 * `webContents.current`'s own answer: the same six values its streams (`state`, `history`,
 * `title`, `favicons`, `zoom`, `audio`) last published, read fresh at the callback rather than
 * waited for — the one-shot precedent `internal/Window.ts`'s own `current` already ships.
 */
export const Snapshot = Schema.Struct({
  state: State,
  history: History,
  title: Schema.String,
  favicons: Schema.Array(Schema.String),
  zoom: Zoom,
  audio: Audio,
});
export type Snapshot = typeof Snapshot.Type;

const Point = Schema.Struct({ x: Schema.Int, y: Schema.Int });
const Extent = Schema.Struct({
  width: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  height: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

/** What the page says can be done with the selection or field a context menu was opened on. */
export const EditFlags = Schema.Struct({
  canUndo: Schema.Boolean,
  canRedo: Schema.Boolean,
  canCut: Schema.Boolean,
  canCopy: Schema.Boolean,
  canPaste: Schema.Boolean,
  canDelete: Schema.Boolean,
  canSelectAll: Schema.Boolean,
});
export type EditFlags = typeof EditFlags.Type;

/** A request for a context menu, with what was under the pointer. Coordinates are in the page. */
export const ContextMenu = Schema.Struct({
  kind: Schema.Literal("context-menu"),
  x: Schema.Finite,
  y: Schema.Finite,
  pageUrl: Schema.String,
  frameUrl: Schema.String,
  linkUrl: Schema.String,
  linkText: Schema.String,
  sourceUrl: Schema.String,
  mediaType: Schema.String,
  hasImageContents: Schema.Boolean,
  isEditable: Schema.Boolean,
  selectionText: Schema.String,
  misspelledWord: Schema.String,
  dictionarySuggestions: Schema.Array(Schema.String),
  source: Schema.String,
  editFlags: EditFlags,
});
export type ContextMenu = typeof ContextMenu.Type;

/** One frame of the page, named by the process it runs in and its routing id inside it. */
export const FrameIdentity = Schema.Struct({
  processId: Schema.Finite,
  routingId: Schema.Finite,
  isMainFrame: Schema.Boolean,
});
export type FrameIdentity = typeof FrameIdentity.Type;

/**
 * Something the page did that main may want to react to. Each observer owns its own native
 * listeners, so a web contents nobody observes pays nothing for these.
 */
export const PageEvent = Schema.Union([
  ContextMenu,
  Schema.Struct({ kind: Schema.Literal("cursor"), type: Schema.String }),
  /** The link under the pointer or keyboard focus; empty once it leaves one. */
  Schema.Struct({ kind: Schema.Literal("target-url"), url: Schema.String }),
  /** The page's `theme-color`, or `null` when it declares none. */
  Schema.Struct({ kind: Schema.Literal("theme-color"), color: Schema.NullOr(Schema.String) }),
  /** An element entered or left fullscreen through the page's own Fullscreen API. */
  Schema.Struct({ kind: Schema.Literal("html-full-screen"), active: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("dom-ready") }),
  Schema.Struct({
    kind: Schema.Literal("preload-error"),
    path: Schema.String,
    message: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("frame"),
    change: Schema.Literals(["created", "navigated", "loaded"]),
    frame: FrameIdentity,
    /** The frame's URL, where Electron reports one: on `created` and `navigated`. */
    url: Schema.optionalKey(Schema.String),
    /** The response status of a `navigated` frame; `-1` for a navigation that is not HTTP. */
    httpStatus: Schema.optionalKey(Schema.Finite),
  }),
  Schema.Struct({
    kind: Schema.Literal("devtools"),
    change: Schema.Literals(["opened", "closed", "focused"]),
  }),
  /** DevTools asked to open a link, reload the page, or search for text in it. */
  Schema.Struct({ kind: Schema.Literal("devtools-open-url"), url: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("devtools-reload-page") }),
  Schema.Struct({ kind: Schema.Literal("devtools-search-query"), query: Schema.String }),
  /** A popup the page opened asks to be moved or resized. */
  Schema.Struct({ kind: Schema.Literal("content-bounds-updated"), bounds: Bounds }),
  /** The smallest size that shows the page without scrolling changed. */
  Schema.Struct({
    kind: Schema.Literal("preferred-size"),
    width: Schema.Finite,
    height: Schema.Finite,
  }),
  /** An input event reached the page; `type` is Electron's, such as `mouseDown` or `keyUp`. */
  Schema.Struct({ kind: Schema.Literal("input"), type: Schema.String }),
  /** A `<webview>` was attached; `nativeId` is the native id of the web contents it created. */
  Schema.Struct({ kind: Schema.Literal("webview-attached"), nativeId: Schema.Finite }),
  /** A frame, the main one or not, is about to navigate. Deciding it is `Navigation`'s. */
  Schema.Struct({
    kind: Schema.Literal("frame-will-navigate"),
    url: Schema.String,
    isMainFrame: Schema.Boolean,
    isSameDocument: Schema.Boolean,
  }),
]);
export type PageEvent = typeof PageEvent.Type;

export const DevToolsState = Schema.Struct({
  opened: Schema.Boolean,
  focused: Schema.Boolean,
  title: Schema.String,
});
export type DevToolsState = typeof DevToolsState.Type;

/** What the page is doing right now, read once. */
export const Activity = Schema.Struct({
  loading: Schema.Boolean,
  waitingForResponse: Schema.Boolean,
  crashed: Schema.Boolean,
  beingCaptured: Schema.Boolean,
  backgroundThrottling: Schema.Boolean,
});
export type Activity = typeof Activity.Type;

/** Emulates a device's screen for the page, as DevTools' device toolbar does. */
export const DeviceEmulation = Schema.Struct({
  screenPosition: Schema.Literals(["desktop", "mobile"]),
  screenSize: Extent,
  viewPosition: Point,
  /** `0` keeps the display's own scale factor. */
  deviceScaleFactor: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  viewSize: Extent,
  scale: Schema.Finite.check(Schema.isGreaterThan(0)),
});
export type DeviceEmulation = typeof DeviceEmulation.Type;

/** An editing command the focused frame runs, as a menu item or a key press would. */
export const EditCommand = Schema.Literals([
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "pasteAndMatchStyle",
  "delete",
  "selectAll",
  "unselect",
  "centerSelection",
  "scrollToTop",
  "scrollToBottom",
]);
export type EditCommand = typeof EditCommand.Type;

/** How far to move the selection's ends, in characters; a negative number moves backwards. */
export const SelectionAdjustment = Schema.Struct({
  start: Schema.optionalKey(Schema.Int),
  end: Schema.optionalKey(Schema.Int),
});
export type SelectionAdjustment = typeof SelectionAdjustment.Type;

export const PagePoint = Point;
export type PagePoint = typeof PagePoint.Type;

/** Pinch-zoom limits, as scale factors: `1` to `1` disables pinch zoom. */
export const VisualZoomLimits = Schema.Struct({
  minimum: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(1)),
  maximum: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(1)),
}).check(
  Schema.makeFilter(
    (limits) => limits.minimum <= limits.maximum || "minimum must not exceed maximum",
  ),
);
export type VisualZoomLimits = typeof VisualZoomLimits.Type;

export const ImageAnimationPolicy = Schema.Literals(["animate", "animateOnce", "noAnimation"]);
export type ImageAnimationPolicy = typeof ImageAnimationPolicy.Type;

/**
 * One rendered frame: the whole frame as a BGRA bitmap, and the rectangle that changed since the
 * frame before, in device-independent pixels.
 */
export const Frame = Schema.Struct({ bitmap: Image.Bitmap, dirty: Bounds });
export type Frame = typeof Frame.Type;

export const FrameOptions = Schema.Struct({
  /**
   * For a page that is not rendered offscreen: deliver only the rectangle that changed, as its
   * own bitmap, instead of the whole frame.
   */
  onlyDirty: Schema.optionalKey(Schema.Boolean),
});
export type FrameOptions = typeof FrameOptions.Type;

/** Frames per second for an offscreen page. */
export const FrameRate = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 240 }));
export type FrameRate = typeof FrameRate.Type;

/** How an offscreen page is rendering. */
export const Painting = Schema.Struct({
  offscreen: Schema.Boolean,
  painting: Schema.Boolean,
  frameRate: Schema.Finite,
});
export type Painting = typeof Painting.Type;

/** Files dragged out of a page, by absolute path, and the image shown under the pointer. */
export const Drag = Schema.Struct({
  files: Schema.NonEmptyArray(Schema.String.check(Schema.isMinLength(1))),
  icon: Image.Source,
});
export type Drag = typeof Drag.Type;

/** A shared worker the page started. */
export const SharedWorker = Schema.Struct({ id: Schema.String, url: Schema.String });
export type SharedWorker = typeof SharedWorker.Type;

/** A printer the system offers. */
export const Printer = Schema.Struct({
  name: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
});
export type Printer = typeof Printer.Type;

export const WebRtcIpHandlingPolicy = Schema.Literals([
  "default",
  "default_public_interface_only",
  "default_public_and_private_interfaces",
  "disable_non_proxied_udp",
]);
export type WebRtcIpHandlingPolicy = typeof WebRtcIpHandlingPolicy.Type;

/** The UDP ports WebRTC may use; both zero lifts the restriction. */
export const UdpPortRange = Schema.Struct({
  min: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 })),
  max: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 })),
}).check(Schema.makeFilter((range) => range.min <= range.max || "min must not exceed max"));
export type UdpPortRange = typeof UdpPortRange.Type;

export const WebRtc = Schema.Struct({
  ipHandlingPolicy: Schema.String,
  udpPortRange: UdpPortRange,
});
export type WebRtc = typeof WebRtc.Type;

/** One frame of the page as it is now. `parent` is the routing id of the frame that embeds it. */
export const FrameInfo = Schema.Struct({
  processId: Schema.Finite,
  routingId: Schema.Finite,
  frameTreeNodeId: Schema.Finite,
  token: Schema.String,
  osProcessId: Schema.Finite,
  isMainFrame: Schema.Boolean,
  parent: Schema.NullOr(Schema.Finite),
  url: Schema.String,
  origin: Schema.String,
  name: Schema.String,
  visibilityState: Schema.String,
});
export type FrameInfo = typeof FrameInfo.Type;

/** How a page's zoom is scoped: per origin (`default`), per page, set by the application, or off. */
export const ZoomMode = Schema.Literals(["default", "isolated", "manual", "disabled"]);
export type ZoomMode = typeof ZoomMode.Type;

/** Chromium's zoom level: `0` is 100%, and each step up or down scales by 20%. */
export const ZoomLevel = Schema.Finite.check(Schema.isBetween({ minimum: -8, maximum: 9 }));
export type ZoomLevel = typeof ZoomLevel.Type;

/** A raw IPC message a page sent with its own preload's `ipcRenderer`; `args` that are not JSON arrive as `null`. */
export const IpcMessage = Schema.Struct({
  channel: Schema.String,
  args: Schema.Array(Schema.Json),
  frame: FrameIdentity,
});
export type IpcMessage = typeof IpcMessage.Type;
