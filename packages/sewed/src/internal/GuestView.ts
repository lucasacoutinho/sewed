import { WebContentsView as NativeWebContentsView, session as nativeSession } from "electron";
import { Deferred, Effect, Exit, Schema, Scope, Stream } from "effect";
import type * as Automation from "../Automation.ts";
import * as Decidables from "../Decidables.ts";
import * as Decision from "../Decision.ts";
import type * as Download from "../Download.ts";
import type * as WebContents from "../WebContents.ts";
import * as Public from "../GuestView.ts";
import { generateInstanceId } from "../InstanceId.ts";
import { MainContext } from "../RuntimeContext.ts";
import type { SewedError } from "../SewedError.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as ContentsAutomation from "./ContentsAutomation.ts";
import * as ContentsDownloads from "./ContentsDownloads.ts";
import * as ContentsPosture from "./ContentsPosture.ts";
import * as Registry from "./DecisionRegistry.ts";
import * as GuestInput from "./GuestInput.ts";
import * as GuestNavigation from "./GuestNavigation.ts";
import * as Observation from "./Observation.ts";
import * as Observers from "./Observers.ts";
import * as Session from "./Session.ts";
import { register, type State, viewIdentity } from "./View.ts";
import { core, type Core, decoded, nativeError, onFreshTask } from "./WebContentsCore.ts";

export { HostPolicy, InputPolicy, Settings, WebRtcPolicy, protocol, tab } from "../GuestView.ts";
export type { Options } from "../GuestView.ts";
export { native } from "./GuestHost.ts";

/** A guest view handle whose web contents is the shared core; see the root `Handle`. */
export type Handle<A extends Automation.Declaration = {}> = Public.Handle<A, Core>;

const decodeSettings = Schema.decodeUnknownSync(Public.Settings);
const webRtcOf = (policy: Public.WebRtcPolicy) =>
  policy === "publicInterfaceOnly"
    ? "default_public_interface_only"
    : policy === "disableNonProxiedUdp"
      ? "disable_non_proxied_udp"
      : "default";

/**
 * Acquires a view for a page the application does not own: no preload, no bridge, a navigation
 * policy fixed at creation (`Navigation.Rules`: URL rules or match patterns), denied webviews,
 * decider-gated popups and downloads, and the automation declared here. The view lives until the
 * scope closes or `close` runs; it is never recreated.
 */
export const make = <const A extends Automation.Declaration = {}>(
  options: Public.Options<A>,
): Effect.Effect<Handle<A>, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const { session, automation, ...rest } = options;
    const settings = yield* decoded("Invalid guest view options", () =>
      decodeSettings(automation === undefined ? rest : { ...rest, automation }),
    );
    const parent = yield* Effect.scope;
    const lifetime = yield* Scope.fork(parent);
    const closed = yield* Deferred.make<void>();
    const blocked = Observers.make<WebContents.Blocked>("Blocked");
    const policy = yield* decoded("Invalid navigation policy", () =>
      GuestNavigation.make(settings.navigation),
    );
    // The guest's own posture — see `ContentsPosture.guestFallbacks`'s own doc for why this lives in
    // its own importable module rather than inline here.
    const registry = Registry.make({
      owner: "contents",
      fallbacks: ContentsPosture.guestFallbacks(settings.input),
    });
    // The guest's own navigation policy, fixed at creation: a permanent decider on this view's own
    // registry, so will-navigate, will-redirect, and webview attaches the page starts are decided by
    // it. There is no way to loosen it later — `setNavigationPolicy` is gone, matching this wave's
    // move from a mutable single slot to a composable, install-time decision. Reuses `policy.allows`
    // rather than compiling `settings.navigation` a second time through `Decision.policy`, so the
    // guest's own `navigate` and this decider always agree on the exact same compiled rule set.
    registry.install(
      Decidables.WebContents.Navigation,
      Decision.sync((event: { readonly url: string }) => {
        const target = URL.parse(event.url);
        return target !== null && policy.allows(target) ? "allow" : "deny";
      }),
    );
    const nativeView = yield* Effect.try({
      try: () => {
        const selected =
          session === undefined ? Session.fromNative(nativeSession.defaultSession) : session;
        const view = new NativeWebContentsView({
          webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            webviewTag: false,
            session: Session.resolve(selected),
            ...(settings.backgroundThrottling === undefined
              ? {}
              : { backgroundThrottling: settings.backgroundThrottling }),
          },
        });
        if (settings.webRtc !== undefined)
          view.webContents.setWebRTCIPHandlingPolicy(webRtcOf(settings.webRtc));
        return view;
      },
      catch: (cause) => nativeError("Could not create guest view", cause),
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
    const contents = nativeView.webContents;
    let cleanupPromise: Promise<void> | undefined;
    const closeNativeContents = (): Promise<void> => {
      const existing = cleanupPromise;
      if (existing !== undefined) return existing;
      if (contents.isDestroyed()) return Promise.resolve();
      const promise = new Promise<void>((resolve, reject) => {
        const onDestroyed = () => {
          resolve();
        };
        contents.once("destroyed", onDestroyed);
        try {
          contents.close();
        } catch (cause) {
          contents.off("destroyed", onDestroyed);
          reject(cause);
        }
      });
      let tracked: Promise<void>;
      tracked = promise.catch((cause) => {
        if (cleanupPromise === tracked) cleanupPromise = undefined;
        throw cause;
      });
      cleanupPromise = tracked;
      return tracked;
    };
    yield* Scope.addFinalizer(
      lifetime,
      Effect.promise(() => closeNativeContents()),
    );

    return yield* Effect.gen(function* () {
      const { contents: web, control } = yield* core(contents, {
        registry,
        blocked: (kind, url) => blocked.publish({ kind, url }),
      }).pipe(Scope.provide(lifetime));
      const state: State = {
        native: nativeView,
        lifetime,
        isDestroyed: () => contents.isDestroyed(),
        closedFlag: false,
        scopeClosing: false,
        attachment: undefined,
      };
      const onDestroyed = () => {
        if (state.closedFlag) return;
        state.closedFlag = true;
        const attachment = state.attachment;
        if (attachment !== undefined) {
          try {
            attachment.detachNative();
          } catch {
            // The WebContents is already destroyed; the wrapper state still must be cleared.
          }
        }
        Deferred.doneUnsafe(closed, Effect.void);
        if (!state.scopeClosing) Effect.runFork(Scope.close(lifetime, Exit.void));
      };
      contents.once("destroyed", onDestroyed);
      yield* Scope.addFinalizer(
        lifetime,
        Effect.ensuring(
          Effect.sync(() => {
            state.scopeClosing = true;
            const attachment = state.attachment;
            if (attachment !== undefined) {
              try {
                attachment.detachNative();
              } catch {
                // The state is cleared in detachNative's finally block; native cleanup still runs.
              }
            }
          }),
          Effect.sync(() => {
            if (contents.isDestroyed()) contents.off("destroyed", onDestroyed);
          }),
        ),
      );
      const id = yield* generateInstanceId();
      const unregister = ContentsRegistry.register(contents.id, id);
      const fenced = ContentsAutomation.make(automation, contents, control);
      const entry: ContentsDownloads.Entry = {
        sourceId: id,
        onBlocked: (url) => blocked.publish({ kind: "download", url }),
        // Filled from the registry, not from a caller's function: any number of deciders may be
        // installed through `webContents.decide(Decidables.WebContents.Download, ...)`, and
        // `resolveSync` composes them restrictively, contributing the guest's own "deny" fallback
        // (declared above) when none answers or the winner fails to decode.
        decide: (offer) => registry.resolveSync(Decidables.WebContents.Download, offer),
        onAccepted: () => {},
      };
      const uninstallDownloads = ContentsDownloads.install(contents.session, contents.id, entry);
      const input = GuestInput.install(contents, registry);
      // Runs first among the lifetime's finalizers: registries, downloads, debugger, then streams.
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(() => {
          uninstallDownloads();
          unregister();
          fenced.release();
          input.uninstall();
          blocked.finish();
        }),
      );
      const navigate = (url: string) =>
        Effect.andThen(
          decoded("Invalid navigation URL", () => policy.check(url)),
          (target) =>
            control.asynchronous("Could not load page", () =>
              onFreshTask(() => contents.loadURL(target.href)),
            ),
        );
      const downloads: Stream.Stream<Download.Handle, SewedError, MainContext> = Stream.unwrap(
        Effect.gen(function* () {
          yield* MainContext;
          if (control.isClosed()) return Stream.fail(control.closedError());
          return Observation.listen<Download.Handle>("Downloads", (offer) =>
            Effect.sync(() => {
              entry.onAccepted = offer;
              return () => {
                entry.onAccepted = () => {};
              };
            }),
          ).pipe(Stream.interruptWhen(Deferred.await(closed)));
        }),
      );
      const handle: Handle<A> = {
        [viewIdentity]: true,
        id,
        webContents: web,
        navigate,
        blocked: blocked.stream,
        downloads,
        automation: fenced.automation,
        close: Effect.gen(function* () {
          yield* MainContext;
          yield* Effect.tryPromise({
            try: () => closeNativeContents(),
            catch: (cause) => nativeError("Could not close guest view", cause),
          });
          yield* Scope.close(lifetime, Exit.void);
        }),
        awaitClosed: Effect.andThen(MainContext, Deferred.await(closed)),
      };
      register(handle, state);
      if (contents.isDestroyed()) onDestroyed();
      return handle;
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
  });
