import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BrowserWindow, screen, type WebContents } from "electron";
import { Deferred, Effect, Stream } from "effect";
import type { Bound, Complete } from "../Binding.ts";
import * as Decidables from "../Decidables.ts";
import type * as Download from "../Download.ts";
import type { Entry } from "../Renderer.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { Blocked } from "../WebContents.ts";
import * as UrlRule from "../UrlRule.ts";
import { mainBridge } from "./MainBridge.ts";
import * as BindingContract from "./BindingContract.ts";
import * as ContentsDownloads from "./ContentsDownloads.ts";
import * as ContentsInput from "./ContentsInput.ts";
import * as ContentsPosture from "./ContentsPosture.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as Registry from "./DecisionRegistry.ts";
import { sink } from "./Diagnostics.ts";
import * as Observation from "./Observation.ts";
import * as Observers from "./Observers.ts";
import { core, onFreshTask } from "./WebContentsCore.ts";

/** A renderer's web contents: the shared core plus the bridge, loading, and the bound-document allowance. */
export const webContents = (native: WebContents) =>
  Effect.gen(function* () {
    yield* MainContext;
    const lifetime = yield* Effect.scope;
    const bridge = mainBridge(native, lifetime, yield* sink);
    let boundDocument: string | undefined;
    const blocked = Observers.make<Blocked>("Blocked");
    // This document's own posture — see `ContentsPosture.rendererFallbacks`'s own doc for why this
    // lives in its own importable module rather than inline here — and its input gate, which exists
    // only while an input decider does (`ContentsInput.hook`). The hook's thunk reads `registry`
    // after `make` has returned, which is why the annotation is here: the reference is inside its
    // own initializer.
    const registry: Registry.Registry<"contents"> = Registry.make({
      owner: "contents",
      fallbacks: ContentsPosture.rendererFallbacks(),
      hooks: [ContentsInput.hook(native, () => registry)],
    });
    const { contents, control } = yield* core(native, {
      registry,
      allows: (url) => UrlRule.documentKey(url) === boundDocument,
      blocked: (kind, url) => blocked.publish({ kind, url }),
      displayScaleFactor: () => {
        const window = BrowserWindow.fromWebContents(native);
        return window === null
          ? screen.getPrimaryDisplay().scaleFactor
          : screen.getDisplayMatching(window.getBounds()).scaleFactor;
      },
    });
    // The bound document moved with the History API; a reload of that URL stays allowed.
    const inPage = (_event: Electron.Event, url: string, mainFrame: boolean) => {
      if (!mainFrame) return;
      const document = URL.parse(url);
      if (document) boundDocument = UrlRule.documentKey(document);
    };
    native.on("did-navigate-in-page", inPage);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        native.off("did-navigate-in-page", inPage);
        blocked.finish();
      }),
    );
    /**
     * The downloads this document starts and `Decidables.WebContents.Download` accepted, decided
     * through this document's own registry (whose fallback prompts rather than denies — see its
     * declaration above) rather than a function passed here. Subscribing is what engages the native
     * listener, same as before: with nothing ever subscribed, Electron's own download behavior
     * applies, and `decide(Decidables.WebContents.Download, …)` alone does nothing at all — installing
     * a decider is not enough here the way it is for every other decidable in this catalog, and unlike
     * a guest view, whose own posture governs from construction whether or not anything is subscribed
     * to its `downloads`. A denial is not reported on `blocked` either while nothing is subscribed,
     * since nothing runs the native listener that would produce one. `sourceId`'s lookup stays lazy
     * for the same reason it always has — `internal/Window.ts` and `internal/WebContentsView.ts`
     * register this contents' id with `ContentsRegistry` at different points relative to calling
     * `webContents`, and only by the time a caller can reach this stream at all has either finished
     * doing so.
     */
    const downloads: Stream.Stream<Download.Handle, SewedError, MainContext> = Stream.unwrap(
      Effect.gen(function* () {
        yield* MainContext;
        if (control.isClosed()) return Stream.fail(control.closedError());
        const sourceId = ContentsRegistry.handleIdOf(native.id);
        if (sourceId === undefined)
          return Stream.fail(
            new SewedError({ code: "Closed", message: "Web contents has no Sewed owner" }),
          );
        return Observation.listen<Download.Handle>("Downloads", (offer) =>
          Effect.sync(() =>
            ContentsDownloads.install(native.session, native.id, {
              sourceId,
              onBlocked: (url) => blocked.publish({ kind: "download", url }),
              decide: (download) => registry.resolveSync(Decidables.WebContents.Download, download),
              onAccepted: offer,
            }),
          ),
        ).pipe(Stream.interruptWhen(Deferred.await(control.closed)));
      }),
    );
    return {
      ...contents,
      /**
       * The webviews and main-frame navigations this document's policy denied, and the popups
       * denied with no decider installed to allow them; an allowed popup opens and is not reported
       * here.
       */
      blocked: blocked.stream,
      load: <Keys extends string, const B extends readonly Bound<Keys>[]>(
        entry: Entry<Keys> & Complete<Keys, B>,
        options: { readonly bindings: B },
      ) =>
        Effect.gen(function* () {
          yield* MainContext;
          // A `file:` document must exist, and be a file rather than a directory, before the
          // bridge is configured or Electron navigates to it; every other scheme is Electron's
          // own problem to report through `loadURL`. `fileURLToPath` itself throws for some
          // well-formed URLs (an encoded slash, on this platform) — that throw fails `Protocol`
          // with its own message, kept as the cause, distinct from "not found" so a consumer does
          // not mistake a URL it could not even read as a path for one that read as a path that
          // does not exist.
          if (entry.url.protocol === "file:") {
            const path = yield* Effect.try({
              try: () => fileURLToPath(entry.url),
              catch: (cause) =>
                new SewedError({
                  code: "Protocol",
                  message: `Local document URL could not be read as a path: ${entry.url}`,
                  cause,
                }),
            });
            let stats: ReturnType<typeof statSync> | undefined;
            try {
              stats = statSync(path);
            } catch {
              stats = undefined;
            }
            if (stats === undefined)
              return yield* Effect.fail(
                new SewedError({ code: "Protocol", message: `Local document not found: ${path}` }),
              );
            if (!stats.isFile())
              return yield* Effect.fail(
                new SewedError({
                  code: "Protocol",
                  message: `Local document is not a file: ${path}`,
                }),
              );
          }
          yield* BindingContract.validate(
            entry.bindings.map((binding) => binding.key),
            options.bindings.map((binding) => binding.slot.key),
            "Window bindings do not match the renderer entry",
          );
          yield* control.operation(() => {
            boundDocument = UrlRule.documentKey(entry.url);
            bridge.configure(entry.url, options.bindings);
          });
          yield* Effect.tryPromise({
            try: () => onFreshTask(() => native.loadURL(entry.url.href)),
            catch: (cause) =>
              new SewedError({ code: "Native", message: "Could not load renderer", cause }),
          });
        }),
      reload: control.operation(() => {
        native.reload();
      }),
      downloads,
    };
  });
