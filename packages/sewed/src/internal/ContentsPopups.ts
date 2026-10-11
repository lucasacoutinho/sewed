import { BrowserWindow, screen, type WebContents } from "electron";
import { Deferred, Effect, Exit, Scope } from "effect";
import type { Context, Stream } from "effect";
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
import { nativeImageOf } from "./ImageSource.ts";
import * as Observers from "./Observers.ts";
import { core, type Core } from "./WebContentsCore.ts";
import * as Window from "./Window.ts";

/**
 * The window a page opened with `window.open`, once `Decidables.WebContents.Popup` allowed it, as
 * a resource the program owns. The library builds the window itself, so there is never a moment
 * it exists unowned: it is sandboxed and isolated with no preload and no bridge, whatever its
 * opener had, and it has a guest's posture. Its navigations and redirects are denied unless a
 * decider on its `webContents` allows them, and downloads and further popups are denied.
 *
 * It closes when the person closes it, when its page calls `window.close()`, when `close` runs, or
 * when the web contents that opened it close: a popup does not outlive what vouched for it.
 */
export interface Handle {
  readonly id: string;
  /** The Sewed id of the owner of the web contents whose page opened this window. */
  readonly openerId: string | null;
  readonly webContents: Core;
  /** The navigations, redirects, popups and downloads this window was denied. */
  readonly blocked: Stream.Stream<Blocked, SewedError, MainContext>;
  /** The windows this one's page opens in turn, when a decider on it allows them. */
  readonly popups: Stream.Stream<Handle, SewedError, MainContext>;
  readonly close: Effect.Effect<void, never, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}

/** What an owner hands its core so an allowed popup is built owned, and what it publishes. */
export interface Installed {
  /** Electron's `createWindow`: builds the popup's window and answers its web contents. */
  readonly create: (options: Electron.BrowserWindowConstructorOptions, url: string) => WebContents;
  readonly popups: Stream.Stream<Handle, SewedError, MainContext>;
  /** Closes every popup still open and ends the stream. */
  readonly release: () => void;
}

/**
 * Owns every popup `opener` is allowed to open. `services` is the context native callbacks run
 * their Effects with.
 */
export const install = (opener: WebContents, services: Context.Context<MainContext>): Installed => {
  const opened = Observers.make<Handle>("Popup");
  const live = new Set<BrowserWindow>();
  const own = (window: BrowserWindow, url: string) =>
    Effect.gen(function* () {
      const guest = window.webContents;
      // The document the popup was opened for is the one `Popup` allowed; it loads without being
      // asked of `Navigation` again. Everything after its first document is asked.
      let first: string | undefined = URL.parse(url)?.href;
      guest.once("did-navigate", () => {
        first = undefined;
      });
      const lifetime = yield* Scope.make();
      const blocked = Observers.make<Blocked>("Blocked");
      const registry = Registry.make({
        owner: "contents",
        fallbacks: ContentsPosture.guestFallbacks(undefined),
      });
      const nested = install(guest, services);
      const { contents, control } = yield* core(guest, {
        registry,
        blocked: (kind, url) => blocked.publish({ kind, url }),
        imageOf: nativeImageOf,
        displayScaleFactor: () =>
          window.isDestroyed()
            ? screen.getPrimaryDisplay().scaleFactor
            : screen.getDisplayMatching(window.getBounds()).scaleFactor,
        popup: nested.create,
        allows: (target) => first !== undefined && target.href === first,
      }).pipe(Scope.provide(lifetime));
      const id = yield* generateInstanceId();
      const unregister = ContentsRegistry.register(guest.id, id);
      const uninstallDownloads = ContentsDownloads.install(guest.session, guest.id, {
        sourceId: id,
        onBlocked: (url) => blocked.publish({ kind: "download", url }),
        decide: (offer) => registry.resolveSync(Decidables.WebContents.Download, offer),
      });
      const input = ContentsInput.install(guest, registry);
      const handle: Handle = {
        id,
        openerId: ContentsRegistry.handleIdOf(opener.id) ?? null,
        webContents: contents,
        blocked: blocked.stream,
        popups: nested.popups,
        close: Effect.andThen(
          MainContext,
          Effect.sync(() => {
            if (!window.isDestroyed()) window.destroy();
          }),
        ),
        awaitClosed: Effect.andThen(MainContext, Deferred.await(control.closed)),
      };
      Window.register(handle, window);
      const unpublish = Handles.contents.publish(id, contents, () => guest.isDestroyed());
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(() => {
          live.delete(window);
          nested.release();
          uninstallDownloads();
          unregister();
          unpublish();
          input.uninstall();
          blocked.finish();
        }),
      );
      const end = () => {
        Effect.runForkWith(services)(Scope.close(lifetime, Exit.void));
      };
      if (window.isDestroyed()) end();
      else window.once("closed", end);
      opened.publish(handle);
    });
  return {
    create: (options, url) => {
      // Built from what Electron prepared for this popup, which carries the web contents it must
      // use, with the opener's preload and privileges taken out.
      const { preload: _preload, ...inherited } = options.webPreferences ?? {};
      const window = new BrowserWindow({
        ...options,
        webPreferences: {
          ...inherited,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          nodeIntegrationInSubFrames: false,
          webSecurity: true,
          webviewTag: false,
        },
      });
      live.add(window);
      Effect.runForkWith(services)(own(window, url));
      return window.webContents;
    },
    popups: opened.stream,
    release: () => {
      for (const window of [...live]) if (!window.isDestroyed()) window.destroy();
      live.clear();
      opened.finish();
    },
  };
};
