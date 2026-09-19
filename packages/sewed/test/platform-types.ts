import { Effect, Scope, Stream } from "effect";
import {
  Decidables,
  Decision,
  DesktopCapturer as CaptureData,
  InAppPurchase as StoreData,
  MainContext,
  Menu,
  Renderer,
  SewedError,
  SystemPreferences as PreferencesData,
  TouchBar as TouchBarData,
} from "sewed";
import {
  BrowserWindow,
  DesktopCapturer,
  InAppPurchase,
  PushNotifications,
  Session,
  SystemPreferences,
} from "sewed/main";

declare const window: BrowserWindow.Handle;
declare const session: Session.Handle;
const entry = Renderer.entry(new URL("file:///renderer.html"), { bindings: [] });

// System preferences are queries and one change stream.
const animation: Effect.Effect<PreferencesData.Animation, SewedError, MainContext> =
  SystemPreferences.animation;
const appearance: Effect.Effect<PreferencesData.Appearance, SewedError, MainContext> =
  SystemPreferences.appearance;
const media: Effect.Effect<PreferencesData.MediaAccess, SewedError, MainContext> =
  SystemPreferences.mediaAccess("camera");
const ask: Effect.Effect<boolean, SewedError, MainContext> =
  SystemPreferences.askForMediaAccess("microphone");
const changes: Stream.Stream<PreferencesData.Change, SewedError, MainContext> =
  SystemPreferences.changes;
void animation;
void appearance;
void media;
void ask;
void changes;
// @ts-expect-error Screen access cannot be requested, only queried.
SystemPreferences.askForMediaAccess("screen");
// @ts-expect-error Preferences are main-owned.
Renderer.run(entry, SystemPreferences.animation);

// Desktop capture lists sources; the session decider chooses one, installed on the session's own
// registry through Decidables.Session.DisplayMedia — there is no dedicated setter, and no null-
// removal path: closing the decider's own scope is what removes it.
const sources: Effect.Effect<readonly CaptureData.Source[], SewedError, MainContext> =
  DesktopCapturer.sources({ types: ["screen"], thumbnailSize: { width: 64, height: 64 } });
const policy: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = session.decide(
  Decidables.Session.DisplayMedia,
  // A decider's own Effect never carries a typed failure (`Decision.async`'s signature is
  // `Effect<Answer | Pass, never, R>`), so a fallible native call such as `DesktopCapturer.sources`
  // must have its error channel emptied first — `Effect.orDie` here, matching how a synchronous
  // throw is already treated: the decidable's own restrictive `deny` fallback wins instead.
  Decision.async((request) =>
    Effect.map(DesktopCapturer.sources({ types: ["screen"] }), (found) =>
      request.userGesture && found[0] !== undefined
        ? ({ kind: "source", id: found[0].id, audio: "loopback" } satisfies CaptureData.Decision)
        : Decision.Pass,
    ).pipe(Effect.orDie),
  ),
);
void sources;
void policy;
// @ts-expect-error setDisplayMedia is gone; screen sharing is now Decidables.Session.DisplayMedia.
Session.setDisplayMedia(session, null);
// @ts-expect-error Capture source types are a closed set.
DesktopCapturer.sources({ types: ["tab"] });

// The touch bar is data on the window handle with an interaction stream.
const bar: TouchBarData.Options = {
  items: [
    { kind: "button", id: "save", label: "Save" },
    { kind: "spacer", size: "flexible" },
    { kind: "slider", id: "volume", minValue: 0, maxValue: 100, value: 50 },
    {
      kind: "popover",
      id: "more",
      label: "More",
      items: [{ kind: "segmented", id: "mode", segments: [{ label: "A" }, { label: "B" }] }],
    },
  ],
  escapeItem: { kind: "label", label: "Done" },
};
const setBar: Effect.Effect<void, SewedError, MainContext> = window.touchBar.set(bar);
const interactions: Stream.Stream<TouchBarData.Interaction, SewedError, MainContext> =
  window.touchBar.interactions;
void setBar;
void interactions;
// @ts-expect-error Touch bar item kinds are a closed set.
window.touchBar.set({ items: [{ kind: "dial", id: "x" }] });

// Share sheet and store surfaces keep main placement.
const share: Effect.Effect<void, SewedError, MainContext> = window.menu.share(
  { urls: ["https://example.com"] },
  { x: 10, y: 10 },
);
const sharing: Menu.SharingItem = { texts: ["hello"] };
const payments: Effect.Effect<boolean, SewedError, MainContext> = InAppPurchase.canMakePayments;
const products: Effect.Effect<readonly StoreData.Product[], SewedError, MainContext> =
  InAppPurchase.products(["pro"]);
const purchase: Effect.Effect<boolean, SewedError, MainContext> = InAppPurchase.purchase("pro", 2);
const transactions: Stream.Stream<readonly StoreData.Transaction[], SewedError, MainContext> =
  InAppPurchase.transactions;
const token: Effect.Effect<string, SewedError, MainContext> = PushNotifications.register;
const pushes: Stream.Stream<unknown, SewedError, MainContext> = PushNotifications.notifications;
void share;
void sharing;
void payments;
void products;
void purchase;
void transactions;
void token;
void pushes;
// @ts-expect-error Store operations are main-owned.
const storeWithoutMain: Effect.Effect<boolean, SewedError> = InAppPurchase.canMakePayments;
void storeWithoutMain;
const scopeless: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.scoped(share);
void scopeless;
