import type { WebContents } from "electron";
import { Deferred, Effect, Schema, Stream, SubscriptionRef } from "effect";
import * as Decidables from "../Decidables.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Registry from "./DecisionRegistry.ts";
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
  type Search,
  type State,
  StyleOptions,
  type Zoom,
  ZoomFactor,
} from "../WebContents.ts";
import * as Observation from "./Observation.ts";
import * as Observers from "./Observers.ts";

/**
 * What `core` consults instead of a single hard-coded guard: the owner's own decision registry, the
 * stream that reports what a decider (or the owner's own pre-decider allowance) denied, and an
 * optional pre-decider allowance of its own.
 *
 * `allows`, when given, is checked before any decider runs and is what a plain web contents' bound
 * entry document uses — `internal/WebContents.ts`'s own allowance, so `load` and same-document
 * History moves need no decider. A guest view has no entry document and omits it entirely, so every
 * navigation it starts is decided purely through `Decidables.WebContents.Navigation`.
 */
export interface Owner {
  readonly registry: ReturnType<typeof Registry.make>;
  readonly blocked: (kind: "navigation" | "redirect" | "popup" | "webview", url: string) => void;
  readonly allows?: (url: URL) => boolean;
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
const decodeFindText = Schema.decodeUnknownSync(FindText);
const decodeFindOptions = Schema.decodeUnknownSync(FindOptions);
const decodeFindStop = Schema.decodeUnknownSync(FindStop);
const decodeStyleOptions = Schema.decodeUnknownSync(StyleOptions);
const decodeIndex = Schema.decodeUnknownSync(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)));

export const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
export const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
export const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });

/**
 * Starts a navigation on a fresh task. A state update published from a Chromium callback can
 * resume the waiting fiber on that callback's stack, and `loadURL` from there deadlocks Electron.
 */
export const onFreshTask = <A>(run: () => Promise<A>): Promise<A> =>
  new Promise<void>((resolve) => setImmediate(resolve)).then(run);

/** The operations every web contents shares; the owner's decision registry decides where the page may go. */
export const core = (native: WebContents, owner: Owner) =>
  Effect.gen(function* () {
    yield* MainContext;
    const closed = yield* Deferred.make<void>();
    const snapshot = yield* SubscriptionRef.make<State>({ status: "idle" });
    const health = yield* SubscriptionRef.make<Responsiveness>({ status: "unknown" });
    const favicons = yield* SubscriptionRef.make<readonly string[]>([]);
    // Checked before any decider runs: the owner's own pre-decider allowance (a plain web contents'
    // bound entry document) short-circuits without consulting the registry at all. A URL the
    // allowance does not cover falls through to `Decidables.WebContents.Navigation`.
    const allowedByPolicy = (url: string, kind: "navigation" | "redirect" | "webview"): boolean => {
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
      if (answer === "allow") return { action: "allow" };
      owner.blocked("popup", details.url);
      return { action: "deny" };
    });
    const titleUpdated = (event: Electron.Event, title: string) => {
      const answer = owner.registry.resolveSync(Decidables.WebContents.TitleUpdate, { title });
      if (answer === "keep") event.preventDefault();
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
      Effect.runSync(SubscriptionRef.set(snapshot, state));
    };
    const responsiveness = (status: "responsive" | "unresponsive") => {
      if (native.isDestroyed()) return;
      const processId = native.getOSProcessId();
      const observation: Responsiveness =
        processId > 0 ? { status, processId } : { status: "unknown" };
      Effect.runSync(SubscriptionRef.set(health, observation));
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
        Effect.runSync(SubscriptionRef.set(favicons, []));
        Effect.runSync(SubscriptionRef.set(health, { status: "unknown" }));
        update({ status: "loading", url });
      }
    };
    const navigated = () => {
      committed = generation;
    };
    const inPage = (_event: Electron.Event, url: string, mainFrame: boolean) => {
      if (!mainFrame) return;
      Effect.runSync(
        SubscriptionRef.update(snapshot, (state): State =>
          state.status === "ready" ? { ...state, url } : state,
        ),
      );
    };
    const finished = () => {
      if (native.isDestroyed() || committed !== generation) return;
      aborted = undefined;
      responsive();
      Effect.runSync(
        SubscriptionRef.update(snapshot, (state): State =>
          state.status === "loading"
            ? { status: "ready", url: native.getURL(), processId: native.getOSProcessId() }
            : state,
        ),
      );
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
      Effect.runSync(
        SubscriptionRef.update(snapshot, (state): State =>
          state.status === "loading" && state.url === url
            ? { status: "failed", url, code, description }
            : state,
        ),
      );
    };
    const stopped = () => {
      if (native.isDestroyed() || native.isLoadingMainFrame()) return;
      Effect.runSync(
        SubscriptionRef.update(snapshot, (state): State => {
          if (state.status !== "loading") return state;
          return aborted?.url === state.url
            ? aborted
            : { status: "failed", url: state.url, code: -2, description: "ERR_FAILED" };
        }),
      );
      aborted = undefined;
    };
    const gone = (
      _event: Electron.Event,
      { reason, exitCode }: Electron.RenderProcessGoneDetails,
    ) => {
      Effect.runSync(SubscriptionRef.set(health, { status: "unknown" }));
      update({ status: "gone", reason, exitCode });
    };
    const faviconsUpdated = (_event: Electron.Event, urls: string[]) => {
      Effect.runSync(SubscriptionRef.set(favicons, [...urls]));
    };
    const destroyed = () => {
      Deferred.doneUnsafe(closed, Effect.void);
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
      Effect.runSync(SubscriptionRef.set(zoom, { factor: native.getZoomFactor() }));
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
      Effect.runSync(
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
      Effect.runSync(SubscriptionRef.set(history, readHistoryUnsafe()));
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
    const travel = (offset: number | { readonly index: number }) =>
      operation(() => {
        const current = readHistoryUnsafe();
        const index = typeof offset === "number" ? current.index + offset : offset.index;
        const entry = current.entries[index];
        if (entry === undefined) throw protocolError("History entry does not exist");
        if (!allowedByPolicy(entry.url, "navigation"))
          throw protocolError("History entry is outside the navigation policy");
        native.navigationHistory.goToIndex(index);
      });
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
    const contents = {
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
              return new Uint8Array(image.toPNG());
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
      clearHistory: operation(() => {
        native.navigationHistory.clear();
        readHistory();
      }),
      openDevTools: (options: DevToolsOptions = {}) =>
        operation(() => {
          native.openDevTools({
            mode: "detach",
            ...Schema.decodeUnknownSync(DevToolsOptions)(options),
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
    const control: Control = { closed, isClosed, closedError, operation, asynchronous };
    return { contents, control };
  });

export type Core = Effect.Success<ReturnType<typeof core>>["contents"];
