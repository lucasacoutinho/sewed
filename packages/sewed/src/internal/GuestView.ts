import { WebContentsView as NativeWebContentsView, session as nativeSession } from "electron";
import { Deferred, Effect, Exit, Schema, Scope, Stream } from "effect";
import type * as Download from "../Download.ts";
import * as Public from "../GuestView.ts";
import { host as hostOwner } from "../Host.ts";
import { generateInstanceId } from "../InstanceId.ts";
import { MainContext } from "../RuntimeContext.ts";
import type { SewedError } from "../SewedError.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as GuestAutomation from "./GuestAutomation.ts";
import * as GuestDownloads from "./GuestDownloads.ts";
import * as GuestHost from "./GuestHost.ts";
import * as GuestNavigation from "./GuestNavigation.ts";
import * as Observation from "./Observation.ts";
import * as Observers from "./Observers.ts";
import * as Session from "./Session.ts";
import { register, type State, viewIdentity } from "./View.ts";
import { core, type Core, decoded, nativeError, onFreshTask } from "./WebContentsCore.ts";

export {
  Automation,
  Blocked,
  DevToolsMethod,
  DownloadDecision,
  DownloadOffer,
  EvaluateOptions,
  HostPolicy,
  InputEvent,
  KeyboardInput,
  MouseInput,
  MouseWheelInput,
  NavigationPolicy,
  Settings,
  WebRtcPolicy,
  protocol,
} from "../GuestView.ts";
export type { AutomationMembers, AutomationOf, DevToolsOf, Options } from "../GuestView.ts";

/** A guest view handle whose web contents is the shared core; see the root `Handle`. */
export type Handle<A extends Public.Automation = {}> = Public.Handle<A, Core>;

const decodeSettings = Schema.decodeUnknownSync(Public.Settings);
const webRtcOf = (policy: Public.WebRtcPolicy) =>
  policy === "publicInterfaceOnly"
    ? "default_public_interface_only"
    : policy === "disableNonProxiedUdp"
      ? "disable_non_proxied_udp"
      : "default";

/**
 * Acquires a view for a page the application does not own: no preload, no bridge, a pattern
 * navigation policy, denied popups and webviews, decider-gated downloads, and the automation
 * declared here. The view lives until the scope closes or `close` runs; it is never recreated.
 */
export const make = <const A extends Public.Automation = {}>(
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
    const blocked = Observers.make<Public.Blocked>("Blocked");
    const policy = yield* decoded("Invalid navigation policy", () =>
      GuestNavigation.make(settings.navigation),
    );
    const native = yield* Effect.try({
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
    const contents = native.webContents;
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
      const { contents: web, control } = yield* core(
        contents,
        GuestNavigation.guard(policy, blocked.publish),
      ).pipe(Scope.provide(lifetime));
      const state: State = {
        native,
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
      const fenced = GuestAutomation.make(automation, contents, control);
      const entry: GuestDownloads.Entry = {
        sourceId: id,
        onBlocked: (url) => blocked.publish({ kind: "download", url }),
        decide: undefined,
        onAccepted: () => {},
      };
      const uninstallDownloads = GuestDownloads.install(contents.session, contents.id, entry);
      // Runs first among the lifetime's finalizers: registries, downloads, debugger, then streams.
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(() => {
          entry.decide = undefined;
          uninstallDownloads();
          unregister();
          fenced.release();
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
      const downloads = <R>(
        decide: (
          offer: Public.DownloadOffer,
        ) => Effect.Effect<Public.DownloadDecision, SewedError, R>,
      ): Stream.Stream<Download.Handle, SewedError, MainContext | R> =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* MainContext;
            const context = yield* Effect.context<R>();
            if (control.isClosed()) return Stream.fail(control.closedError());
            return Observation.listen<Download.Handle>("Downloads", (offer) =>
              Effect.sync(() => {
                entry.decide = GuestDownloads.deciderSync(decide, context);
                entry.onAccepted = offer;
                return () => {
                  entry.decide = undefined;
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
        setNavigationPolicy: (next) =>
          control.operation(() => {
            policy.replace(next);
          }),
        blocked: blocked.stream,
        downloads,
        automation: fenced.automation,
        host: (hostPolicy) =>
          Effect.gen(function* () {
            yield* MainContext;
            const layer = yield* decoded("Invalid host policy", () =>
              GuestHost.handlers(hostPolicy, web, navigate),
            );
            return yield* hostOwner(Public.protocol, layer);
          }),
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
