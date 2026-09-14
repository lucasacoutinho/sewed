import type { WebContents } from "electron";
import { Deferred, Effect, Schema, Stream } from "effect";
import type { Bound, Complete } from "../Binding.ts";
import type * as Download from "../Download.ts";
import type { Entry } from "../Renderer.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { type Blocked, NavigationPolicy } from "../WebContents.ts";
import * as UrlRule from "../UrlRule.ts";
import { mainBridge } from "./MainBridge.ts";
import * as BindingContract from "./BindingContract.ts";
import * as ContentsDownloads from "./ContentsDownloads.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import { sink } from "./Diagnostics.ts";
import * as Observation from "./Observation.ts";
import * as Observers from "./Observers.ts";
import { core, decoded, onFreshTask } from "./WebContentsCore.ts";

/** A renderer's web contents: the shared core plus the bridge, loading, and the URL-rule policy. */
export const webContents = (native: WebContents) =>
  Effect.gen(function* () {
    yield* MainContext;
    const lifetime = yield* Effect.scope;
    const bridge = mainBridge(native, lifetime, yield* sink);
    let boundDocument: string | undefined;
    let destinations: readonly ((url: URL) => boolean)[] = [];
    const blocked = Observers.make<Blocked>("Blocked");
    const { contents, control } = yield* core(native, {
      allows: (url) =>
        UrlRule.documentKey(url) === boundDocument || destinations.some((allows) => allows(url)),
      blocked: (kind, url) => blocked.publish({ kind, url }),
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
    return {
      ...contents,
      /** The windows and main-frame navigations this document's policy denied; nothing is opened. */
      blocked: blocked.stream,
      setNavigationPolicy: (policy: NavigationPolicy) =>
        Effect.andThen(
          decoded("Invalid navigation policy", () =>
            Schema.decodeUnknownSync(NavigationPolicy)(policy).map(UrlRule.compile),
          ),
          (next) =>
            control.operation(() => {
              destinations = next;
            }),
        ),
      load: <Keys extends string, const B extends readonly Bound<Keys>[]>(
        entry: Entry<Keys> & Complete<Keys, B>,
        options: { readonly bindings: B },
      ) =>
        Effect.gen(function* () {
          yield* MainContext;
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
      /**
       * Decides the downloads this document starts while the stream runs. Without a running
       * decider, Electron's own download behavior applies; the latest installed decider wins.
       */
      downloads: <R>(
        decide: (offer: Download.Offer) => Effect.Effect<Download.Decision, SewedError, R>,
      ): Stream.Stream<Download.Handle, SewedError, MainContext | R> =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* MainContext;
            const context = yield* Effect.context<R>();
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
                  decide: ContentsDownloads.deciderSync(decide, context),
                  onAccepted: offer,
                }),
              ),
            ).pipe(Stream.interruptWhen(Deferred.await(control.closed)));
          }),
        ),
    };
  });
