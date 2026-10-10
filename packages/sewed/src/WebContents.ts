import { Schema } from "effect";
import type { Effect, Stream } from "effect";
import * as Binary from "./Binary.ts";
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
