import type { Effect, Scope, Stream } from "effect";
import type { Download, MainContext, SewedError, WebContents } from "sewed";
import type { BrowserWindow } from "sewed/main";

declare const window: BrowserWindow.Handle;
const responsiveness: Stream.Stream<WebContents.Responsiveness, never, MainContext> =
  window.webContents.responsiveness;
const recover: Effect.Effect<void, SewedError, MainContext> = window.webContents.recover;
void responsiveness;
void recover;

// @ts-expect-error Native responsiveness retains main placement.
const withoutMain: Stream.Stream<WebContents.Responsiveness> = window.webContents.responsiveness;
// @ts-expect-error Renderer recovery retains main placement.
const unsafeRecovery: Effect.Effect<void, SewedError> = window.webContents.recover;
void withoutMain;
void unsafeRecovery;

const responsive: WebContents.Responsiveness = { status: "responsive", processId: 123 };
const unresponsive: WebContents.Responsiveness = { status: "unresponsive", processId: 123 };
const unknown: WebContents.Responsiveness = { status: "unknown" };
void responsive;
void unresponsive;
void unknown;

// @ts-expect-error A native responsiveness observation identifies its process.
const unidentified: WebContents.Responsiveness = { status: "unresponsive" };
void unidentified;

// Presentation, output, and navigation extras stay on the web contents handle.
const print: Effect.Effect<void, SewedError, MainContext> = window.webContents.print({
  silent: true,
  pageSize: "A4",
  pageRanges: [{ from: 0, to: 1 }],
});
const pdf: Effect.Effect<Uint8Array, SewedError, MainContext> = window.webContents.pdf({
  landscape: true,
  pageSize: { width: 8.5, height: 11 },
});
const capture: Effect.Effect<WebContents.Capture, SewedError, MainContext> =
  window.webContents.capture({
    rect: { x: 0, y: 0, width: 10, height: 10 },
  });
// @ts-expect-error A capture answers the struct now, not bare bytes.
const captureBytes: Effect.Effect<Uint8Array, SewedError, MainContext> = window.webContents.capture(
  {},
);
const zoom: Stream.Stream<WebContents.Zoom, SewedError, MainContext> = window.webContents.zoom;
const setZoom: Effect.Effect<void, SewedError, MainContext> = window.webContents.setZoom(1.5);
const audio: Stream.Stream<WebContents.Audio, SewedError, MainContext> = window.webContents.audio;
const mute: Effect.Effect<void, SewedError, MainContext> = window.webContents.setAudioMuted(true);
const userAgent: Effect.Effect<string, SewedError, MainContext> = window.webContents.userAgent;
const history: Stream.Stream<WebContents.History, SewedError, MainContext> =
  window.webContents.history;
const back: Effect.Effect<WebContents.Settled, SewedError, MainContext> = window.webContents.back;
const go: Effect.Effect<WebContents.Settled, SewedError, MainContext> = window.webContents.go(0);
const search: Effect.Effect<WebContents.Search, SewedError, MainContext | Scope.Scope> =
  window.webContents.find("needle", { matchCase: true });
const style: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = window.webContents.style(
  "body { color: red }",
  { origin: "user" },
);
void print;
void pdf;
void capture;
void captureBytes;
void zoom;
void setZoom;
void audio;
void mute;
void userAgent;
void history;
void back;
void go;
void search;
void style;

// @ts-expect-error A search is a scoped resource.
const unscopedSearch: Effect.Effect<WebContents.Search, SewedError, MainContext> =
  window.webContents.find("needle");
void unscopedSearch;

// @ts-expect-error Inserted CSS lives in a scope.
const unscopedStyle: Effect.Effect<void, SewedError, MainContext> = window.webContents.style("");
void unscopedStyle;

// @ts-expect-error Page output retains main placement.
const pdfWithoutMain: Effect.Effect<Uint8Array, SewedError> = window.webContents.pdf();
void pdfWithoutMain;

// @ts-expect-error `back` answers the settled ready-or-failed state, not a history listing.
const backWrongShape: Effect.Effect<WebContents.History, SewedError, MainContext> =
  window.webContents.back;
void backWrongShape;

// @ts-expect-error Page sizes are a closed set of names or explicit dimensions.
window.webContents.pdf({ pageSize: "B5" });

const findResult: WebContents.FindResult = {
  activeMatchOrdinal: 1,
  matches: 3,
  selectionArea: { x: 0, y: 0, width: 1, height: 1 },
  finalUpdate: true,
};
void findResult;

// Console messages and downloads stay main-only on a renderer's web contents.
const consoleMessages: Stream.Stream<WebContents.ConsoleMessage, SewedError, MainContext> =
  window.webContents.console;
// @ts-expect-error Console observation retains main placement.
const consoleWithoutMain: Stream.Stream<WebContents.ConsoleMessage, SewedError> =
  window.webContents.console;
// Downloads are decided through Decidables.WebContents.Download now, not a function passed here.
const windowDownloads: Stream.Stream<Download.Handle, SewedError, MainContext> =
  window.webContents.downloads;
// @ts-expect-error downloads is a plain stream now; it takes no decider argument. Written with no
// reference to `Effect` (a type-only import in this file): passing it here would raise TS1361
// alongside the TS2349 this pin is about, and either alone satisfies one `@ts-expect-error`, which
// would leave this assertion passing even if `downloads` regained a call signature tomorrow.
window.webContents.downloads(() => {});
// @ts-expect-error Downloads retain main placement.
const windowDownloadsWithoutMain: Stream.Stream<Download.Handle, SewedError> =
  window.webContents.downloads;
void windowDownloadsWithoutMain;
const promptWithOptions: Download.Decision = {
  kind: "prompt",
  dialog: { title: "Save As", defaultPath: "report.pdf" },
};
const promptNative: Download.Decision = { kind: "prompt" };
// @ts-expect-error A save decision needs its path.
const saveWithoutPath: Download.Decision = { kind: "save" };
void consoleMessages;
void consoleWithoutMain;
void windowDownloads;
void promptWithOptions;
void promptNative;
void saveWithoutPath;

// A renderer window reports the windows and navigations its policy denied.
const rendererBlocked: Stream.Stream<WebContents.Blocked, SewedError, MainContext> =
  window.webContents.blocked;
const blockedPopup: WebContents.Blocked = { kind: "popup", url: "https://example.com/" };
// @ts-expect-error Blocked kinds are a closed set.
const blockedUnknown: WebContents.Blocked = { kind: "iframe", url: "https://example.com/" };
void rendererBlocked;
void blockedPopup;
void blockedUnknown;

// Termination without reload and favicon updates are main-only members of the contents core.
const terminated: Effect.Effect<void, SewedError, MainContext> = window.webContents.terminate;
const pageFavicons: Stream.Stream<readonly string[], SewedError, MainContext> =
  window.webContents.favicons;
void terminated;
void pageFavicons;

// `ready` carries the main frame's HTTP status: a number for every document, HTTP or not.
const readyState: WebContents.State = {
  status: "ready",
  url: "https://example.com/",
  processId: 123,
  httpStatus: 500,
};
const readyHttpStatus: number = readyState.status === "ready" ? readyState.httpStatus : -1;
void readyState;
void readyHttpStatus;

// @ts-expect-error `ready` always carries the main frame's HTTP status.
const readyWithoutStatus: WebContents.State = {
  status: "ready",
  url: "https://example.com/",
  processId: 123,
};
void readyWithoutStatus;

// A capture answers its pixel size and the display's scale beside its bytes.
const capturedShape: WebContents.Capture = {
  bytes: new Uint8Array([137, 80, 78, 71]),
  width: 64,
  height: 32,
  scaleFactor: 2,
};
void capturedShape;

// @ts-expect-error A capture always answers its pixel size and scale factor beside its bytes.
const capturedBytesOnly: WebContents.Capture = { bytes: new Uint8Array([137, 80, 78, 71]) };
void capturedBytesOnly;

// Page commands: a cache-bypassing reload and a stop belong to an owned document; typing text,
// saving the page, and the two flags belong to every web contents.
const reloadedFresh: Effect.Effect<void, SewedError, MainContext> =
  window.webContents.reloadIgnoringCache;
const stopped: Effect.Effect<void, SewedError, MainContext> = window.webContents.stopLoading;
const typed: Effect.Effect<void, SewedError, MainContext> = window.webContents.insertText("hello");
const saved: Effect.Effect<void, SewedError, MainContext> = window.webContents.savePage(
  "/tmp/page.mhtml",
  "MHTML",
);
const throttled: Effect.Effect<void, SewedError, MainContext> =
  window.webContents.setBackgroundThrottling(false);
const shortcuts: Effect.Effect<void, SewedError, MainContext> =
  window.webContents.setIgnoreMenuShortcuts(true);
// @ts-expect-error Save types are a closed set.
void window.webContents.savePage("/tmp/page.pdf", "PDF");
void reloadedFresh;
void stopped;
void typed;
void saved;
void throttled;
void shortcuts;

// Page members: one event stream, one-shot reads, and decoded commands.
declare const pageContents: BrowserWindow.Handle["webContents"];
const pageEvents: Stream.Stream<WebContents.PageEvent, SewedError, MainContext> =
  pageContents.events;
void pageEvents;
const pageActivity: Effect.Effect<WebContents.Activity, SewedError, MainContext> =
  pageContents.activity;
void pageActivity;
const pageDevTools: Effect.Effect<WebContents.DevToolsState, SewedError, MainContext> =
  pageContents.devTools;
void pageDevTools;
void pageContents.edit("selectAll");
// @ts-expect-error not an edit command
void pageContents.edit("destroy");
void pageContents.inspectWorker("service");
void pageContents.adjustSelection({ start: 1, end: -1 });
