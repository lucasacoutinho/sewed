import { isAbsolute } from "node:path";
import type { WebContents } from "electron";
import { Deferred, Effect, Schema, Stream, SubscriptionRef } from "effect";
import * as Decidables from "../Decidables.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as ContentsFrames from "./ContentsFrames.ts";
import * as ContentsPage from "./ContentsPage.ts";
import * as Registry from "./DecisionRegistry.ts";
import { decoded, protocolError } from "./ProtocolError.ts";
import {
  type Audio,
  CaptureOptions,
  type ConsoleMessage,
  DevToolsOptions,
  FindOptions,
  type FindResult,
  FindStop,
  FindText,
  type History,
  PdfOptions,
  PrintOptions,
  type Responsiveness,
  SaveType,
  type Search,
  type Settled,
  type Snapshot,
  type State,
  StyleOptions,
  type Zoom,
  ZoomFactor,
} from "../WebContents.ts";
import * as Observation from "./Observation.ts";
import * as Observers from "./Observers.ts";

/**
 * What `core` consults instead of a single hard-coded guard: the owner's own decision registry, the
 * stream that reports what a decider (or the owner's own pre-decider allowance) denied, an optional
 * pre-decider allowance of its own, and the display scale a capture with no `rect` reports.
 *
 * `allows`, when given, is checked before any decider runs and is what a plain web contents' bound
 * entry document uses — `internal/WebContents.ts`'s own allowance, so `load` and same-document
 * History moves need no decider. A guest view has no entry document and omits it entirely, so every
 * navigation it starts is decided purely through `Decidables.WebContents.Navigation`.
 *
 * `displayScaleFactor` answers the scale of the display showing whatever window composites this
 * owner's `native` contents. `core` stays free of `electron` value imports at module scope so its
 * fake-native tests keep running outside Electron; the owner is a main module with a static
 * `electron` import already (`internal/WebContents.ts` for a window's own contents and a pane's,
 * `internal/GuestView.ts` for a guest's), so it is the one that resolves
 * `BrowserWindow.fromWebContents(native)` and the matching display's, or the primary display's when
 * there is no owner window, `scaleFactor` — synchronously, unlike the dynamic `import("electron")`
 * this replaced.
 */
export interface Owner {
  readonly registry: Registry.Registry<"contents">;
  readonly blocked: (kind: "navigation" | "redirect" | "popup" | "webview", url: string) => void;
  readonly allows?: (url: URL) => boolean;
  readonly displayScaleFactor: () => number;
  /**
   * Whether a browser window's own `page-title-updated` listener asks
   * `Decidables.WebContents.TitleUpdate` for these contents. A browser window's own contents set
   * it: Electron emits the window's event for the same title change, and only that event's
   * `preventDefault` holds the native title, so the window asks and the contents do not ask again.
   * Guests and panes leave it unset and ask on the contents' own event.
   */
  readonly windowDecidesTitle?: boolean;
}

/** The closed state and the error-mapping helpers a composer builds its own operations with. */
export interface Control {
  readonly closed: Deferred.Deferred<void>;
  readonly isClosed: () => boolean;
  readonly closedError: () => SewedError;
  readonly operation: <A>(run: () => A) => Effect.Effect<A, SewedError, MainContext>;
  readonly asynchronous: <A>(
    message: string,
    run: () => Promise<A>,
  ) => Effect.Effect<A, SewedError, MainContext>;
}

const decodePrint = Schema.decodeUnknownSync(PrintOptions);
const decodePdf = Schema.decodeUnknownSync(PdfOptions);
const decodeCapture = Schema.decodeUnknownSync(CaptureOptions);
const decodeZoomFactor = Schema.decodeUnknownSync(ZoomFactor);
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeString = Schema.decodeUnknownSync(Schema.String);
const decodeSaveType = Schema.decodeUnknownSync(SaveType);
const decodeFindText = Schema.decodeUnknownSync(FindText);
const decodeFindOptions = Schema.decodeUnknownSync(FindOptions);
const decodeFindStop = Schema.decodeUnknownSync(FindStop);
const decodeStyleOptions = Schema.decodeUnknownSync(StyleOptions);
const decodeIndex = Schema.decodeUnknownSync(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)));

export { decoded, protocolError };
export const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

/**
 * Starts a navigation on a fresh task. A state update published from a Chromium callback can
 * resume the waiting fiber on that callback's stack, and `loadURL` from there deadlocks Electron.
 */
export const onFreshTask = <A>(run: () => Promise<A>): Promise<A> =>
  new Promise<void>((resolve) => setImmediate(resolve)).then(run);

/**
 * The ratio between a capture's pixel width and the DIP width of the area it captured.
 *
 * A `rect` fixes that DIP width exactly, so the ratio is read straight from it. Without a `rect`,
 * `capturePage` captures whatever `native` renders full-bleed on its own — the whole window for a
 * window's own contents, or just a guest's or an attached pane's own bounds — and neither of
 * those DIP sizes reaches `core`, which only ever holds the raw `WebContents`; the owner's own
 * `displayScaleFactor` answers the ratio instead, from the display showing whatever composites
 * `native` (see `Owner`'s own doc).
 */
const captureScaleFactor = (
  owner: Owner,
  rect: { readonly width: number } | undefined,
  pixelWidth: number,
): number =>
  rect !== undefined && rect.width > 0 ? pixelWidth / rect.width : owner.displayScaleFactor();

/** The operations every web contents shares; the owner's decision registry decides where the page may go. */
export const core = (native: WebContents, owner: Owner) =>
  Effect.gen(function* () {
    // Native callbacks run their Effects with the services this program was given.
    const surrounding = yield* Effect.context<never>();
    yield* MainContext;
    const closed = yield* Deferred.make<void>();
    const snapshot = yield* SubscriptionRef.make<State>({ status: "idle" });
    const health = yield* SubscriptionRef.make<Responsiveness>({ status: "unknown" });
    const favicons = yield* SubscriptionRef.make<readonly string[]>([]);
    const title = yield* SubscriptionRef.make<string>("");
    // Checked before any decider runs: the owner's own pre-decider allowance (a plain web contents'
    // bound entry document) short-circuits without consulting the registry at all. A URL the
    // allowance does not cover falls through to `Decidables.WebContents.Navigation`.
    const allowedByPolicy = (url: string, kind: "navigation" | "redirect"): boolean => {
      const parsed = URL.parse(url);
      if (parsed !== null && owner.allows?.(parsed) === true) return true;
      return (
        owner.registry.resolveSync(Decidables.WebContents.Navigation, { url, kind }) === "allow"
      );
    };
    const checkNavigation =
      (kind: "navigation" | "redirect") =>
      (event: Electron.Event<Electron.WebContentsWillNavigateEventParams>) => {
        if (!event.isMainFrame) return;
        if (allowedByPolicy(event.url, kind)) return;
        event.preventDefault();
        owner.blocked(kind, event.url);
      };
    const willNavigate = checkNavigation("navigation");
    const willRedirect = checkNavigation("redirect");
    // Unconditional, not policy-decided: nothing in the spec catalog makes webview attachment a
    // decidable, and the shipped documentation (README.md, docs/api.md, docs/guest-views.md) says
    // webviews are denied by design. The "webview" literal stays on Navigation's event schema for
    // the day a Webview decidable is added; until then nothing ever resolves it with that kind.
    const willAttachWebview = (
      event: Electron.Event,
      _preferences: Electron.WebPreferences,
      params: Record<string, string>,
    ) => {
      event.preventDefault();
      owner.blocked("webview", params.src ?? "");
    };
    native.setWindowOpenHandler((details) => {
      const answer = owner.registry.resolveSync(Decidables.WebContents.Popup, { url: details.url });
      // Allowing popups at all is the spec's intent — Popup replaces a fixed denial — but what an
      // allowed popup's own window *is* stays unanswered here. `{ action: "allow" }` carries no
      // `overrideBrowserWindowOptions`, and nothing handles `did-create-window`: the resulting
      // BrowserWindow has no `core` installed (its own navigations, popups, webviews, title updates
      // and unloads are ungated), no ContentsRegistry entry (so it cannot appear on any `blocked`
      // stream and has no Sewed id), no owning Effect scope, and Electron-derived `webPreferences`
      // rather than anything Sewed chose. The fallback is "deny", so this is opt-in; governing the
      // window an allowed popup creates is not covered by any step of this redesign, and it is
      // recorded as an open item in the spec. See docs/api.md.
      if (answer === "allow") return { action: "allow" };
      owner.blocked("popup", details.url);
      return { action: "deny" };
    });
    const titleUpdated = (_event: Electron.Event, pageTitle: string) => {
      // A guest's or a pane's decider is asked here. For a browser window's own contents the
      // window's listener asks instead (`internal/Window.ts`), once per change: preventing this
      // event leaves the native title to change (see `docs/window-controls.md`). The stream always
      // mirrors the page's own title, whatever the decision — a decider exists to gate the native
      // title, not to gate this library's own observation of it.
      if (owner.windowDecidesTitle !== true)
        owner.registry.resolveSync(Decidables.WebContents.TitleUpdate, { title: pageTitle });
      Effect.runSyncWith(surrounding)(SubscriptionRef.set(title, pageTitle));
    };
    const willPreventUnload = (event: Electron.Event) => {
      const answer = owner.registry.resolveSync(Decidables.WebContents.Unload, {
        url: native.getURL(),
      });
      if (answer === "override") event.preventDefault();
    };
    native.on("will-navigate", willNavigate);
    native.on("will-redirect", willRedirect);
    native.on("will-attach-webview", willAttachWebview);
    native.on("page-title-updated", titleUpdated);
    native.on("will-prevent-unload", willPreventUnload);
    let aborted: Extract<State, { status: "failed" }> | undefined;
    // A stale document can finish loading after a newer navigation started; only the current
    // navigation's commit lets did-finish-load settle the ready state.
    let generation = 0;
    let committed = 0;
    const update = (state: State) => {
      Effect.runSyncWith(surrounding)(SubscriptionRef.set(snapshot, state));
    };
    // `travel` waits on this deferred for the navigation it started: `finished`, `failed`,
    // `stopped`, and `inPage` (a same-document move) each settle it when the state they publish is
    // the first non-loading one after the history move began. Only one travel is tracked at a
    // time — a second `back`/`forward`/`go` while one is still pending supersedes it.
    let pendingTravel: Deferred.Deferred<Settled, SewedError> | undefined;
    const settleTravel = (state: Settled) => {
      const pending = pendingTravel;
      if (pending === undefined) return;
      pendingTravel = undefined;
      Deferred.doneUnsafe(pending, Effect.succeed(state));
    };
    const failTravel = (error: SewedError) => {
      const pending = pendingTravel;
      if (pending === undefined) return;
      pendingTravel = undefined;
      Deferred.doneUnsafe(pending, Effect.fail(error));
    };
    const responsiveness = (status: "responsive" | "unresponsive") => {
      if (native.isDestroyed()) return;
      const processId = native.getOSProcessId();
      const observation: Responsiveness =
        processId > 0 ? { status, processId } : { status: "unknown" };
      Effect.runSyncWith(surrounding)(SubscriptionRef.set(health, observation));
    };
    const responsive = () => responsiveness("responsive");
    const unresponsive = () => responsiveness("unresponsive");
    const navigation = ({
      url,
      isSameDocument,
      isMainFrame,
    }: Electron.WebContentsDidStartNavigationEventParams) => {
      if (isMainFrame && !isSameDocument) {
        generation += 1;
        aborted = undefined;
        Effect.runSyncWith(surrounding)(SubscriptionRef.set(favicons, []));
        Effect.runSyncWith(surrounding)(SubscriptionRef.set(title, ""));
        Effect.runSyncWith(surrounding)(SubscriptionRef.set(health, { status: "unknown" }));
        update({ status: "loading", url });
      }
    };
    // The status is paired with `committed` in the same call, so a stale event's status can
    // never outlive the generation it belongs to: whichever `did-navigate` last set `committed`
    // is the one `finished` reads back.
    let httpStatus = 200;
    const navigated = (_event: Electron.Event, _url: string, httpResponseCode: number) => {
      committed = generation;
      httpStatus = httpResponseCode;
    };
    const inPage = (_event: Electron.Event, url: string, mainFrame: boolean) => {
      if (!mainFrame) return;
      let settledState: Settled | undefined;
      Effect.runSyncWith(surrounding)(
        SubscriptionRef.update(snapshot, (state): State => {
          if (state.status !== "ready") return state;
          const next: Settled = { ...state, url };
          settledState = next;
          return next;
        }),
      );
      if (settledState !== undefined) settleTravel(settledState);
    };
    const finished = () => {
      if (native.isDestroyed() || committed !== generation) return;
      aborted = undefined;
      responsive();
      let settledState: Settled | undefined;
      Effect.runSyncWith(surrounding)(
        SubscriptionRef.update(snapshot, (state): State => {
          if (state.status !== "loading") return state;
          const next: Settled = {
            status: "ready",
            url: native.getURL(),
            processId: native.getOSProcessId(),
            httpStatus,
          };
          settledState = next;
          return next;
        }),
      );
      if (settledState !== undefined) settleTravel(settledState);
    };
    const failed = (
      _event: Electron.Event,
      code: number,
      description: string,
      url: string,
      mainFrame: boolean,
    ) => {
      if (!mainFrame) return;
      if (code === -3) {
        // A replacement may still finish successfully; settle ERR_ABORTED when loading stops.
        aborted = { status: "failed", url, code, description };
        return;
      }
      let settledState: Settled | undefined;
      Effect.runSyncWith(surrounding)(
        SubscriptionRef.update(snapshot, (state): State => {
          if (state.status !== "loading" || state.url !== url) return state;
          const next: Settled = { status: "failed", url, code, description };
          settledState = next;
          return next;
        }),
      );
      if (settledState !== undefined) settleTravel(settledState);
    };
    const stopped = () => {
      if (native.isDestroyed() || native.isLoadingMainFrame()) return;
      let settledState: Settled | undefined;
      Effect.runSyncWith(surrounding)(
        SubscriptionRef.update(snapshot, (state): State => {
          if (state.status !== "loading") return state;
          const next: Settled =
            aborted?.url === state.url
              ? aborted
              : { status: "failed", url: state.url, code: -2, description: "ERR_FAILED" };
          settledState = next;
          return next;
        }),
      );
      aborted = undefined;
      if (settledState !== undefined) settleTravel(settledState);
    };
    const gone = (
      _event: Electron.Event,
      { reason, exitCode }: Electron.RenderProcessGoneDetails,
    ) => {
      Effect.runSyncWith(surrounding)(SubscriptionRef.set(health, { status: "unknown" }));
      update({ status: "gone", reason, exitCode });
      failTravel(nativeError("Web contents crashed before the navigation settled", { reason }));
    };
    const faviconsUpdated = (_event: Electron.Event, urls: string[]) => {
      Effect.runSyncWith(surrounding)(SubscriptionRef.set(favicons, [...urls]));
    };
    const destroyed = () => {
      Deferred.doneUnsafe(closed, Effect.void);
      // `closedError` is defined later in this same setup, below the operations it guards; this
      // handler is only ever invoked after setup finishes, but it constructs its own error rather
      // than close over a binding not yet initialized this early in the function's own source order.
      failTravel(new SewedError({ code: "Closed", message: "Web contents is closed" }));
    };
    native.on("did-start-navigation", navigation);
    native.on("page-favicon-updated", faviconsUpdated);
    native.on("did-redirect-navigation", navigation);
    native.on("did-navigate", navigated);
    native.on("did-navigate-in-page", inPage);
    native.on("did-finish-load", finished);
    native.on("did-fail-provisional-load", failed);
    native.on("did-fail-load", failed);
    native.on("did-stop-loading", stopped);
    native.on("render-process-gone", gone);
    native.on("responsive", responsive);
    native.on("unresponsive", unresponsive);
    native.once("destroyed", destroyed);

    const zoom = yield* SubscriptionRef.make<Zoom>({ factor: native.getZoomFactor() });
    const readZoom = () => {
      if (native.isDestroyed()) return;
      Effect.runSyncWith(surrounding)(
        SubscriptionRef.set(zoom, { factor: native.getZoomFactor() }),
      );
    };
    // Chromium applies wheel and keyboard zoom after emitting the event; read on the next turn.
    const zoomChanged = () => {
      setImmediate(readZoom);
    };
    const audio = yield* SubscriptionRef.make<Audio>({
      muted: native.isAudioMuted(),
      audible: native.isCurrentlyAudible(),
    });
    const readAudio = () => {
      if (native.isDestroyed()) return;
      Effect.runSyncWith(surrounding)(
        SubscriptionRef.set(audio, {
          muted: native.isAudioMuted(),
          audible: native.isCurrentlyAudible(),
        }),
      );
    };
    const readHistoryUnsafe = (): History => {
      const entries = native.navigationHistory
        .getAllEntries()
        .map(({ url, title }) => ({ url, title }));
      return {
        index: native.navigationHistory.getActiveIndex(),
        entries,
        canGoBack: native.navigationHistory.canGoBack(),
        canGoForward: native.navigationHistory.canGoForward(),
      };
    };
    const history = yield* SubscriptionRef.make<History>(readHistoryUnsafe());
    const readHistory = () => {
      if (native.isDestroyed()) return;
      Effect.runSyncWith(surrounding)(SubscriptionRef.set(history, readHistoryUnsafe()));
    };
    interface ActiveSearch {
      readonly ids: Set<number>;
      readonly observers: ReturnType<typeof Observers.make<FindResult>>;
      handle: Search | undefined;
    }
    let activeSearch: ActiveSearch | undefined;
    const finishSearch = (search: ActiveSearch) => {
      if (search.observers.finished) return;
      search.observers.finish();
      if (activeSearch === search) activeSearch = undefined;
    };
    const found = (_event: Electron.Event, result: Electron.Result) => {
      const search = activeSearch;
      if (search === undefined || !search.ids.has(result.requestId)) return;
      const value: FindResult = {
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        selectionArea: result.selectionArea,
        finalUpdate: result.finalUpdate,
      };
      search.observers.publish(value);
    };
    native.on("zoom-changed", zoomChanged);
    native.on("audio-state-changed", readAudio);
    native.on("media-started-playing", readAudio);
    native.on("media-paused", readAudio);
    native.on("did-navigate", readHistory);
    native.on("did-navigate-in-page", readHistory);
    native.on("page-title-updated", readHistory);
    native.on("did-finish-load", readHistory);
    native.on("found-in-page", found);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        destroyed();
        if (activeSearch !== undefined) finishSearch(activeSearch);
        native.off("zoom-changed", zoomChanged);
        native.off("audio-state-changed", readAudio);
        native.off("media-started-playing", readAudio);
        native.off("media-paused", readAudio);
        native.off("did-navigate", readHistory);
        native.off("did-navigate-in-page", readHistory);
        native.off("page-title-updated", readHistory);
        native.off("did-finish-load", readHistory);
        native.off("found-in-page", found);
        native.off("did-start-navigation", navigation);
        native.off("page-favicon-updated", faviconsUpdated);
        native.off("will-navigate", willNavigate);
        native.off("will-redirect", willRedirect);
        native.off("will-attach-webview", willAttachWebview);
        native.off("page-title-updated", titleUpdated);
        native.off("will-prevent-unload", willPreventUnload);
        native.off("did-redirect-navigation", navigation);
        native.off("did-navigate", navigated);
        native.off("did-navigate-in-page", inPage);
        native.off("did-finish-load", finished);
        native.off("did-fail-provisional-load", failed);
        native.off("did-fail-load", failed);
        native.off("did-stop-loading", stopped);
        native.off("render-process-gone", gone);
        native.off("responsive", responsive);
        native.off("unresponsive", unresponsive);
        native.off("destroyed", destroyed);
      }),
    );
    const isClosed = () => Deferred.isDoneUnsafe(closed) || native.isDestroyed();
    const closedError = () => new SewedError({ code: "Closed", message: "Web contents is closed" });
    const operation = <A>(run: () => A) =>
      Effect.andThen(
        MainContext,
        Effect.try({
          try: () => {
            if (isClosed()) throw closedError();
            return run();
          },
          catch: (cause) =>
            cause instanceof SewedError
              ? cause
              : nativeError("Web contents operation failed", cause),
        }),
      );
    const asynchronous = <A>(message: string, run: () => Promise<A>) =>
      Effect.andThen(
        MainContext,
        Effect.suspend(() =>
          isClosed()
            ? Effect.fail(closedError())
            : Effect.tryPromise({
                try: run,
                catch: (cause) =>
                  cause instanceof SewedError ? cause : nativeError(message, cause),
              }),
        ),
      );
    const observe = <A>(ref: SubscriptionRef.SubscriptionRef<A>) =>
      Stream.unwrap(Effect.as(MainContext, SubscriptionRef.changes(ref))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      );
    // History navigations bypass will-navigate, so the policy is applied before Electron moves.
    // `goToIndex` itself answers nothing: the deferred it sets up is settled by whichever of
    // `finished`, `failed`, `stopped`, or `inPage` (a same-document move) next reports a
    // non-loading state, so the Effect answers only once that move has actually reached it.
    const travel = (offset: number | { readonly index: number }) =>
      Effect.andThen(
        operation(() => {
          const current = readHistoryUnsafe();
          const index = typeof offset === "number" ? current.index + offset : offset.index;
          const entry = current.entries[index];
          if (entry === undefined)
            throw protocolError("History entry does not exist", undefined, "history/no-entry");
          if (!allowedByPolicy(entry.url, "navigation"))
            throw protocolError(
              "History entry is outside the navigation policy",
              undefined,
              "policy/denied",
            );
          // Electron's own `goToIndex` emits nothing at all for the entry already active (probed
          // on 44.3.0: zero events in 1.5s) — it is not a slow navigation to wait out, it is one
          // Electron never starts, so a `go` naming the current index would otherwise register a
          // travel nothing ever settles. Answering the already-settled snapshot directly, without
          // calling `goToIndex`, is what this one entry needs; every other index still travels.
          if (index === current.index) {
            const state = Effect.runSyncWith(surrounding)(SubscriptionRef.get(snapshot));
            const settled = Deferred.makeUnsafe<Settled, SewedError>();
            Deferred.doneUnsafe(
              settled,
              state.status === "ready" || state.status === "failed"
                ? Effect.succeed(state)
                : Effect.fail(
                    protocolError("The active history entry has nothing settled yet to answer"),
                  ),
            );
            return settled;
          }
          // A still-pending travel is superseded rather than left to hang: this history move
          // replaces whichever one Electron was already mid-flight on.
          if (pendingTravel !== undefined)
            failTravel(protocolError("History move was superseded by another"));
          const deferred = Deferred.makeUnsafe<Settled, SewedError>();
          pendingTravel = deferred;
          native.navigationHistory.goToIndex(index);
          return deferred;
        }),
        (deferred) => Deferred.await(deferred),
      );
    const find = (text: string, options: FindOptions = {}) =>
      Effect.gen(function* () {
        yield* MainContext;
        const query = yield* decoded("Invalid find text", () => decodeFindText(text));
        const settings = yield* decoded("Invalid find options", () => decodeFindOptions(options));
        const search: ActiveSearch = {
          ids: new Set(),
          observers: Observers.make<FindResult>("Search", { replayLatest: true }),
          handle: undefined,
        };
        // Electron's findNext flag starts a new session when true and advances one when false.
        const request = (newSession: boolean, forward: boolean | undefined) =>
          operation(() => {
            if (search.observers.finished) throw closedError();
            search.ids.add(
              native.findInPage(query, {
                findNext: newSession,
                ...(forward === undefined ? {} : { forward }),
                ...(settings.matchCase === undefined ? {} : { matchCase: settings.matchCase }),
              }),
            );
          });
        const stopNative = (action: FindStop) => {
          if (!native.isDestroyed()) native.stopFindInPage(action);
        };
        yield* Effect.acquireRelease(
          Effect.gen(function* () {
            const previous = activeSearch;
            if (previous !== undefined) finishSearch(previous);
            activeSearch = search;
            yield* request(true, settings.forward).pipe(
              Effect.onError(() => Effect.sync(() => finishSearch(search))),
            );
          }),
          () =>
            Effect.sync(() => {
              if (search.observers.finished) return;
              try {
                if (activeSearch === search) stopNative("clearSelection");
              } finally {
                finishSearch(search);
              }
            }),
        );
        const results = search.observers.stream;
        const handle: Search = {
          results,
          next: (forward = true) => request(false, forward),
          stop: (action = "clearSelection") =>
            Effect.andThen(
              decoded("Invalid find stop action", () => decodeFindStop(action)),
              (value) =>
                operation(() => {
                  if (search.observers.finished) throw closedError();
                  try {
                    stopNative(value);
                  } finally {
                    finishSearch(search);
                  }
                }),
            ),
        };
        search.handle = handle;
        return handle;
      });
    const withSearch = <A>(run: (search: Search) => Effect.Effect<A, SewedError, MainContext>) =>
      Effect.suspend(() =>
        activeSearch?.handle === undefined
          ? Effect.fail(protocolError("No search is active"))
          : run(activeSearch.handle),
      );
    const terminate = Effect.gen(function* () {
      const processId = yield* operation(() => native.getOSProcessId());
      if (processId > 0) {
        yield* Effect.callback<void, SewedError>((resume) => {
          const cleanup = () => {
            native.off("render-process-gone", terminated);
            native.off("destroyed", ownerClosed);
          };
          const terminated = () => {
            cleanup();
            resume(Effect.void);
          };
          const ownerClosed = () => {
            cleanup();
            resume(
              Effect.fail(new SewedError({ code: "Closed", message: "Web contents is closed" })),
            );
          };
          if (native.isDestroyed() || Deferred.isDoneUnsafe(closed)) {
            ownerClosed();
            return;
          }
          native.once("render-process-gone", terminated);
          native.once("destroyed", ownerClosed);
          try {
            native.forcefullyCrashRenderer();
          } catch (cause) {
            cleanup();
            resume(
              Effect.fail(
                new SewedError({
                  code: "Native",
                  message: "Could not terminate renderer",
                  cause,
                }),
              ),
            );
          }
          return Effect.sync(cleanup);
        });
      }
    });
    const control: Control = { closed, isClosed, closedError, operation, asynchronous };
    const contents = {
      ...ContentsPage.make(native, control),
      ...ContentsFrames.make(native, control),
      print: (options: PrintOptions = {}) =>
        Effect.andThen(
          decoded("Invalid print options", () => decodePrint(options)),
          (settings) =>
            Effect.andThen(
              operation(() => settings),
              (value) =>
                Effect.callback<void, SewedError>((resume) => {
                  try {
                    const { pageRanges, margins, ...rest } = value;
                    native.print(
                      {
                        ...rest,
                        ...(pageRanges === undefined
                          ? {}
                          : { pageRanges: pageRanges.map((range) => ({ ...range })) }),
                        ...(margins === undefined ? {} : { margins: { ...margins } }),
                      },
                      (success, failureReason) => {
                        resume(
                          success
                            ? Effect.void
                            : Effect.fail(nativeError("Print failed", failureReason)),
                        );
                      },
                    );
                  } catch (cause) {
                    resume(Effect.fail(nativeError("Could not print", cause)));
                  }
                }),
            ),
        ),
      pdf: (options: PdfOptions = {}) =>
        Effect.andThen(
          decoded("Invalid PDF options", () => decodePdf(options)),
          (settings) =>
            asynchronous("Could not render PDF", async () => {
              const bytes = await native.printToPDF({
                ...settings,
                ...(settings.margins === undefined ? {} : { margins: { ...settings.margins } }),
              });
              return new Uint8Array(bytes);
            }),
        ),
      capture: (options: CaptureOptions = {}) =>
        Effect.andThen(
          decoded("Invalid capture options", () => decodeCapture(options)),
          (settings) =>
            asynchronous("Could not capture page", async () => {
              const { rect, ...rest } = settings;
              const image = await native.capturePage(
                rect === undefined ? undefined : { ...rect },
                rest,
              );
              const { width, height } = image.getSize();
              return {
                bytes: new Uint8Array(image.toPNG()),
                width,
                height,
                scaleFactor: captureScaleFactor(owner, rect, width),
              };
            }),
        ),
      zoom: observe(zoom),
      setZoom: (factor: number) =>
        Effect.andThen(
          decoded("Invalid zoom factor", () => decodeZoomFactor(factor)),
          (value) =>
            operation(() => {
              native.setZoomFactor(value);
              readZoom();
            }),
        ),
      audio: observe(audio),
      setAudioMuted: (muted: boolean) =>
        Effect.andThen(
          decoded("Invalid audio mute flag", () => decodeBoolean(muted)),
          (value) =>
            operation(() => {
              native.setAudioMuted(value);
              readAudio();
            }),
        ),
      userAgent: operation(() => native.getUserAgent()),
      setUserAgent: (userAgent: string) =>
        Effect.andThen(
          decoded("Invalid user agent", () => decodeString(userAgent)),
          (value) =>
            operation(() => {
              native.setUserAgent(value);
            }),
        ),
      /** Types `text` at the focused element, as if the user had. */
      insertText: (text: string) =>
        Effect.andThen(
          decoded("Invalid text", () => decodeString(text)),
          (value) => asynchronous("Could not insert text", () => native.insertText(value)),
        ),
      /**
       * Saves the current document to an absolute path: its HTML alone, the HTML beside a
       * directory of its resources, or one MHTML archive.
       */
      savePage: (path: string, type: SaveType = "HTMLOnly") =>
        Effect.andThen(
          decoded("Invalid page save request", () => {
            if (!isAbsolute(path)) throw protocolError("Page save path must be absolute");
            return [path, decodeSaveType(type)] as const;
          }),
          ([target, kind]) =>
            asynchronous("Could not save page", () => native.savePage(target, kind)),
        ),
      /** Whether the page keeps full timers and animation speed while it is not visible. */
      setBackgroundThrottling: (allowed: boolean) =>
        Effect.andThen(
          decoded("Invalid background throttling flag", () => decodeBoolean(allowed)),
          (value) =>
            operation(() => {
              native.setBackgroundThrottling(value);
            }),
        ),
      /** While set, key presses reach the page without triggering application menu accelerators. */
      setIgnoreMenuShortcuts: (ignore: boolean) =>
        Effect.andThen(
          decoded("Invalid menu shortcut flag", () => decodeBoolean(ignore)),
          (value) =>
            operation(() => {
              native.setIgnoreMenuShortcuts(value);
            }),
        ),
      find,
      /** Advances the active search; `Protocol` when none is active. */
      findNext: (forward = true) => withSearch((search) => search.next(forward)),
      stopFind: (action: FindStop = "clearSelection") =>
        withSearch((search) => search.stop(action)),
      /** Inserts CSS for the current document until the scope closes; a navigation drops it earlier. */
      style: (css: string, options: StyleOptions = {}) =>
        Effect.gen(function* () {
          yield* MainContext;
          const text = yield* decoded("Invalid style sheet", () => decodeString(css));
          const settings = yield* decoded("Invalid style options", () =>
            decodeStyleOptions(options),
          );
          yield* Effect.acquireRelease(
            asynchronous("Could not insert CSS", () =>
              native.insertCSS(
                text,
                settings.origin === undefined ? {} : { cssOrigin: settings.origin },
              ),
            ),
            (key) =>
              Effect.ignore(
                Effect.tryPromise(() =>
                  native.isDestroyed() ? Promise.resolve() : native.removeInsertedCSS(key),
                ),
              ),
          );
        }),
      history: observe(history),
      back: travel(-1),
      forward: travel(1),
      go: (index: number) =>
        Effect.andThen(
          decoded("Invalid history index", () => decodeIndex(index)),
          (value) => travel({ index: value }),
        ),
      /**
       * Removes one history entry by index. The active entry cannot be removed, and neither can
       * an index the history does not have; both fail with `Protocol`.
       */
      removeHistoryEntry: (index: number) =>
        Effect.andThen(
          decoded("Invalid history index", () => decodeIndex(index)),
          (value) =>
            operation(() => {
              if (!native.navigationHistory.removeEntryAtIndex(value))
                throw protocolError(
                  "History entry does not exist or is the active one",
                  undefined,
                  "history/no-entry",
                );
              readHistory();
            }),
        ),
      clearHistory: operation(() => {
        native.navigationHistory.clear();
        readHistory();
      }),
      openDevTools: (options: DevToolsOptions = {}) =>
        operation(() => {
          native.openDevTools({
            mode: "detach",
            ...Schema.decodeSync(DevToolsOptions)(options),
          });
        }),
      closeDevTools: operation(() => {
        native.closeDevTools();
      }),
      focus: operation(() => {
        native.focus();
      }),
      console: Observation.listen<ConsoleMessage>("Console", (offer) =>
        Effect.sync(() => {
          const listener = (event: Electron.Event<Electron.WebContentsConsoleMessageEventParams>) =>
            offer({
              level: event.level,
              message: event.message,
              lineNumber: event.lineNumber,
              sourceId: event.sourceId,
            });
          native.on("console-message", listener);
          return () => {
            native.off("console-message", listener);
          };
        }),
      ).pipe(Stream.interruptWhen(Deferred.await(closed))),
      state: Stream.unwrap(Effect.as(MainContext, SubscriptionRef.changes(snapshot))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      ),
      responsiveness: Stream.unwrap(Effect.as(MainContext, SubscriptionRef.changes(health))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      ),
      favicons: Stream.unwrap(Effect.as(MainContext, SubscriptionRef.changes(favicons))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      ),
      title: Stream.unwrap(Effect.as(MainContext, SubscriptionRef.changes(title))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      ),
      // The one-shot read behind the six streams above, mirroring `internal/Window.ts`'s own
      // `current`: a fresh read of each SubscriptionRef, not a wait for the next change.
      current: operation((): Snapshot => ({
        state: Effect.runSyncWith(surrounding)(SubscriptionRef.get(snapshot)),
        history: Effect.runSyncWith(surrounding)(SubscriptionRef.get(history)),
        title: Effect.runSyncWith(surrounding)(SubscriptionRef.get(title)),
        favicons: Effect.runSyncWith(surrounding)(SubscriptionRef.get(favicons)),
        zoom: Effect.runSyncWith(surrounding)(SubscriptionRef.get(zoom)),
        audio: Effect.runSyncWith(surrounding)(SubscriptionRef.get(audio)),
      })),
      terminate,
      recover: Effect.andThen(
        terminate,
        operation(() => {
          native.reload();
        }),
      ),
      /**
       * Installs a decider for one of `Decidables.WebContents`'s decidables against this contents'
       * own registry, for the caller's scope. Any number of deciders may be installed, and the
       * decidable's own composition decides among them.
       */
      decide: Registry.decide(owner.registry, { isClosed }),
    };
    return { contents, control };
  });

export type Core = Effect.Success<ReturnType<typeof core>>["contents"];
