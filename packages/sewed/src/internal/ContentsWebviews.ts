import type { WebContents } from "electron";
import { Deferred, Effect, Exit, Scope } from "effect";
import type { Stream } from "effect";
import type { Context } from "effect";
import * as Decidables from "../Decidables.ts";
import { generateInstanceId } from "../InstanceId.ts";
import { MainContext } from "../RuntimeContext.ts";
import type { SewedError } from "../SewedError.ts";
import type { Blocked } from "../WebContents.ts";
import * as ContentsDownloads from "./ContentsDownloads.ts";
import * as ContentsInput from "./ContentsInput.ts";
import * as ContentsPosture from "./ContentsPosture.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as Registry from "./DecisionRegistry.ts";
import * as Handles from "./Handles.ts";
import * as Observers from "./Observers.ts";
import { core, type Core, type Owner } from "./WebContentsCore.ts";
import * as WebRequest from "./WebRequest.ts";

/**
 * A `<webview>` a page attached, as a resource the program owns. It has what a guest view's web
 * contents has and the same posture: its navigations and redirects are denied unless a decider on
 * its `webContents` allows them, whether its own page or the host page starts them; popups and
 * downloads are denied, and it carries no bridge.
 *
 * A load the host page directs (`src`, `loadURL`, history) has no cancellable event of its own:
 * a denied one is reported and its request is cancelled before it is sent, so the webview keeps
 * the document it had.
 */
export interface Handle {
  readonly id: string;
  /** The Sewed id of the web contents whose page attached this webview. */
  readonly hostId: string | null;
  readonly webContents: Core;
  /** The navigations, redirects, popups and downloads this webview was denied. */
  readonly blocked: Stream.Stream<Blocked, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}

/**
 * The URL of the document a web contents last committed. `getURL` is no use for this: during a
 * load the browser started it already answers with the URL being loaded.
 */
const committedUrlOf = (guest: WebContents): string | undefined =>
  guest.navigationHistory.getEntryAtIndex(guest.navigationHistory.getActiveIndex())?.url;

/**
 * Owns every webview `host` attaches, for as long as each lives. `Decidables.WebContents
 * .WebviewAttach` has already allowed the attachment and locked its preferences down by the time
 * `did-attach-webview` fires; this is where the guest it created stops being a native object
 * nobody holds. `services` is the context native callbacks run their Effects with; `native` is
 * what each webview's own core needs from Electron's main-process modules.
 */
export const install = (
  host: WebContents,
  services: Context.Context<MainContext>,
  native: Pick<Owner, "imageOf" | "displayScaleFactor">,
) => {
  const attached = Observers.make<Handle>("Webview");
  const own = (guest: WebContents) =>
    Effect.gen(function* () {
      const lifetime = yield* Scope.make();
      const blocked = Observers.make<Blocked>("Blocked");
      const registry = Registry.make({
        owner: "contents",
        fallbacks: ContentsPosture.guestFallbacks(undefined),
      });
      const { contents, control } = yield* core(guest, {
        registry,
        blocked: (kind, url) => blocked.publish({ kind, url }),
        ...native,
      }).pipe(Scope.provide(lifetime));
      const id = yield* generateInstanceId();
      const unregister = ContentsRegistry.register(guest.id, id);
      const uninstallDownloads = ContentsDownloads.install(guest.session, guest.id, {
        sourceId: id,
        onBlocked: (url) => blocked.publish({ kind: "download", url }),
        decide: (offer) => registry.resolveSync(Decidables.WebContents.Download, offer),
      });
      const input = ContentsInput.install(guest, registry);
      // The host page can point the element somewhere else at any time (`src`, `loadURL`, history),
      // and such a load is the browser's own: no `will-navigate` precedes it and nothing can
      // prevent it at its start. It is asked of the same decidable a page's navigation is, and a
      // denied one is refused where it can be: its request is cancelled before it is sent. The
      // first document is the one `WebviewAttach` allowed, and a reload asks nothing.
      let refused: string | undefined;
      const onStarted = (
        event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
      ) => {
        if (!event.isMainFrame || event.isSameDocument) return;
        refused = undefined;
        if (event.initiator !== undefined && event.initiator !== null) return;
        const current = committedUrlOf(guest);
        if (current === undefined || current === "" || current === event.url) return;
        const answer = registry.resolveSync(Decidables.WebContents.Navigation, {
          url: event.url,
          kind: "navigation",
        });
        if (answer === "allow") return;
        refused = event.url;
        blocked.publish({ kind: "navigation", url: event.url });
        // A load with no request to cancel (`data:`, `about:`) is stopped instead, and not from
        // inside the event: stopping a navigation while Chromium is still announcing its start
        // takes the whole process down.
        const url = event.url;
        setImmediate(() => {
          if (refused === url && !guest.isDestroyed() && committedUrlOf(guest) !== url)
            guest.stop();
        });
      };
      const ungate = WebRequest.gate(
        guest.session,
        (request) => request.webContentsId === guest.id && request.url === refused,
      );
      guest.on("did-start-navigation", onStarted);
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(() => {
          uninstallDownloads();
          unregister();
          input.uninstall();
          guest.off("did-start-navigation", onStarted);
          ungate();
          blocked.finish();
        }),
      );
      // The element's removal is the only thing that ends a webview; the scope follows it.
      guest.once("destroyed", () => {
        Effect.runForkWith(services)(Scope.close(lifetime, Exit.void));
      });
      const handle: Handle = {
        id,
        hostId: ContentsRegistry.handleIdOf(host.id) ?? null,
        webContents: contents,
        blocked: blocked.stream,
        awaitClosed: Effect.andThen(MainContext, Deferred.await(control.closed)),
      };
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(Handles.contents.publish(id, contents, () => guest.isDestroyed())),
      );
      attached.publish(handle);
    });
  const onAttached = (_event: unknown, guest: WebContents) => {
    if (guest.isDestroyed()) return;
    Effect.runForkWith(services)(own(guest));
  };
  host.on("did-attach-webview", onAttached);
  return {
    /** The webviews this page attaches from now on, each as an owned handle. */
    webviews: attached.stream,
    release: () => {
      host.off("did-attach-webview", onAttached);
      attached.finish();
    },
  };
};
