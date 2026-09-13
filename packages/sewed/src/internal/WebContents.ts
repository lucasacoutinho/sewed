import type { WebContents } from "electron";
import { Deferred, Effect, Schema, Stream, SubscriptionRef } from "effect";
import type { Bound } from "../Binding.ts";
import type { Entry } from "../Renderer.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import {
  DevToolsOptions,
  NavigationPolicy,
  type Responsiveness,
  type State,
} from "../WebContents.ts";
import * as UrlRule from "../UrlRule.ts";
import { mainBridge } from "./MainBridge.ts";
import * as BindingContract from "./BindingContract.ts";
import { sink } from "./Diagnostics.ts";

export const webContents = (native: WebContents) =>
  Effect.gen(function* () {
    yield* MainContext;
    const lifetime = yield* Effect.scope;
    const closed = yield* Deferred.make<void>();
    const snapshot = yield* SubscriptionRef.make<State>({ status: "idle" });
    const health = yield* SubscriptionRef.make<Responsiveness>({ status: "unknown" });
    const bridge = mainBridge(native, lifetime, yield* sink);
    let entryDocument: string | undefined;
    let destinations: readonly ((url: URL) => boolean)[] = [];
    const checkNavigation = (
      event: Electron.Event<Electron.WebContentsWillNavigateEventParams>,
    ) => {
      if (!event.isMainFrame) return;
      const url = URL.parse(event.url);
      if (
        url &&
        (UrlRule.documentKey(url) === entryDocument || destinations.some((allows) => allows(url)))
      )
        return;
      event.preventDefault();
    };
    native.setWindowOpenHandler(() => ({ action: "deny" }));
    native.on("will-navigate", checkNavigation);
    native.on("will-redirect", checkNavigation);
    let aborted: Extract<State, { status: "failed" }> | undefined;
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
        aborted = undefined;
        Effect.runSync(SubscriptionRef.set(health, { status: "unknown" }));
        update({ status: "loading", url });
      }
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
      if (native.isDestroyed()) return;
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
    const destroyed = () => {
      Deferred.doneUnsafe(closed, Effect.void);
    };
    native.on("did-start-navigation", navigation);
    native.on("did-redirect-navigation", navigation);
    native.on("did-navigate-in-page", inPage);
    native.on("did-finish-load", finished);
    native.on("did-fail-provisional-load", failed);
    native.on("did-fail-load", failed);
    native.on("did-stop-loading", stopped);
    native.on("render-process-gone", gone);
    native.on("responsive", responsive);
    native.on("unresponsive", unresponsive);
    native.once("destroyed", destroyed);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        destroyed();
        native.off("did-start-navigation", navigation);
        native.off("will-navigate", checkNavigation);
        native.off("will-redirect", checkNavigation);
        native.off("did-redirect-navigation", navigation);
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
    const operation = <A>(run: () => A) =>
      Effect.andThen(
        MainContext,
        Effect.try({
          try: () => {
            if (Deferred.isDoneUnsafe(closed) || native.isDestroyed())
              throw new SewedError({ code: "Closed", message: "Web contents is closed" });
            return run();
          },
          catch: (cause) =>
            cause instanceof SewedError
              ? cause
              : new SewedError({ code: "Native", message: "Web contents operation failed", cause }),
        }),
      );
    return {
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
      setNavigationPolicy: (policy: NavigationPolicy) =>
        operation(() => {
          const next = Schema.decodeUnknownSync(NavigationPolicy)(policy).map(UrlRule.compile);
          destinations = next;
        }),
      state: Stream.unwrap(Effect.as(MainContext, SubscriptionRef.changes(snapshot))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      ),
      responsiveness: Stream.unwrap(Effect.as(MainContext, SubscriptionRef.changes(health))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      ),
      load: (entry: Entry, options: { readonly bindings: readonly Bound[] }) =>
        Effect.gen(function* () {
          yield* MainContext;
          yield* BindingContract.validate(
            entry.bindings.map((binding) => binding.key),
            options.bindings.map((binding) => binding.slot.key),
            "Window bindings do not match the renderer entry",
          );
          yield* operation(() => {
            entryDocument = UrlRule.documentKey(entry.url);
            bridge.configure(entry.url, options.bindings);
          });
          yield* Effect.tryPromise({
            try: () => native.loadURL(entry.url.href),
            catch: (cause) =>
              new SewedError({ code: "Native", message: "Could not load renderer", cause }),
          });
        }),
      reload: operation(() => {
        native.reload();
      }),
      recover: Effect.gen(function* () {
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
        yield* operation(() => {
          native.reload();
        });
      }),
    };
  });
