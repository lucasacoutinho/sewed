import { Effect, Layer, Schema, Scope, Stream } from "effect";
import { Binding, Decidables, Decision, MainContext, SewedError, WebContents } from "sewed";
import { BrowserWindow, Capability, GuestView, WebContentsView } from "sewed/main";

const usage: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.gen(function* () {
  const window = yield* BrowserWindow.make({ show: false });
  const guest = yield* GuestView.make({
    navigation: ["https://*/*"],
    automation: { evaluate: true, devtools: ["Runtime.evaluate", "DOM.getDocument"] },
  });
  yield* window.attach(guest, { bounds: { x: 0, y: 0, width: 10, height: 10 } });
  yield* guest.navigate("https://example.com/");
  // The guest's navigation policy is fixed at creation now; composing further restrictions goes
  // through the same decidable every web contents shares.
  yield* guest.webContents.decide(
    Decidables.WebContents.Navigation,
    Decision.sync(() => "allow"),
  );
  const title: string = yield* guest.automation.evaluate("document.title", Schema.String);
  void title;
  yield* guest.automation.devtools("DOM.getDocument", { depth: 1 }, Schema.Unknown);
  yield* guest.blocked.pipe(Stream.take(1), Stream.runDrain);
  // A guest's downloads are decided through the same decidable every web contents shares now, not a
  // function passed to `downloads` itself; the stream carries only what a decider already accepted.
  yield* guest.webContents.decide(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "save", path: "/tmp/download" })),
  );
  yield* guest.downloads.pipe(Stream.take(1), Stream.runDrain);
  yield* guest.webContents.capture({});
  yield* guest.webContents.focus;
  yield* guest.close;
});
void usage;

const declared = Effect.gen(function* () {
  const guest = yield* GuestView.make({ navigation: [], automation: { evaluate: true } });
  // @ts-expect-error setNavigationPolicy is gone: a guest's navigation policy is fixed at creation.
  yield* guest.setNavigationPolicy([]);
  // @ts-expect-error devtools was not declared, so the member does not exist.
  yield* guest.automation.devtools("Runtime.evaluate", undefined, Schema.Unknown);
  // @ts-expect-error input was not declared, so the member does not exist.
  yield* guest.automation.input({ type: "keyDown", keyCode: "a" });
  const narrow = yield* GuestView.make({
    navigation: [],
    automation: { devtools: ["Runtime.evaluate"] },
  });
  // @ts-expect-error A method outside the declared allowlist is a type error.
  yield* narrow.automation.devtools("Runtime.callFunctionOn", undefined, Schema.Unknown);
  const plain = yield* GuestView.make({ navigation: [] });
  // @ts-expect-error No automation was declared.
  yield* plain.automation.evaluate("1", Schema.Unknown);
});
void declared;

const separation = Effect.gen(function* () {
  const guest = yield* GuestView.make({ navigation: [] });
  // @ts-expect-error A guest has no load and carries no bindings.
  yield* guest.webContents.load;
  const view = yield* WebContentsView.make();
  // @ts-expect-error A renderer view has no navigate.
  yield* view.navigate("https://example.com/");
  // @ts-expect-error A renderer view has no automation.
  view.automation;
});
void separation;

// @ts-expect-error Guest acquisition requires MainContext and Scope.
const missing: Effect.Effect<GuestView.Handle, SewedError, Scope.Scope> = GuestView.make({
  navigation: [],
});
void missing;

const inputPolicy = Effect.gen(function* () {
  const guest = yield* GuestView.make({ navigation: [], input: "block" });
  // A guest's input policy is decided through the same decidable every web contents shares now: the
  // constructed "block" default composes with whatever a decider answers, so installing one that
  // always answers "allow" overrides it.
  yield* guest.webContents.decide(
    Decidables.WebContents.Input,
    Decision.sync(() => "allow"),
  );
  // @ts-expect-error setInputPolicy is gone: a guest's input policy is fixed at construction and
  // decided further only through webContents.decide, matching setNavigationPolicy's own removal.
  yield* guest.setInputPolicy("allow");
});
void inputPolicy;

// A guest's tab is one capability, and its native Layer carries the guest and the host policy.
const hosted = Effect.gen(function* () {
  const guest = yield* GuestView.make({ navigation: [] });
  const tabNative: Layer.Layer<typeof GuestView.tab, SewedError, MainContext> = GuestView.native(
    guest,
    { navigate: true, capture: false },
  );
  const owner = yield* Capability.serve(GuestView.tab).pipe(Effect.provide(tabNative));
  const bound = Binding.to(GuestView.tab.slot, owner);
  void bound;
  // @ts-expect-error The removed hosted owner is gone; a guest has no host member.
  yield* guest.host({ navigate: true, capture: false });
  // @ts-expect-error A host policy names both gates.
  GuestView.native(guest, { navigate: true });
});
void hosted;

// An operation carries no runtime requirement: acquiring the capability is what proved it.
const tabCall = Effect.gen(function* () {
  const tab = yield* GuestView.tab;
  const state: Stream.Stream<WebContents.State, SewedError> = tab.state();
  yield* tab.navigate({ url: "https://example.com/" });
  const bytes: Effect.Effect<Uint8Array, SewedError> = tab.capture({});
  yield* bytes;
  return state;
});
void tabCall;

void Effect.gen(function* () {
  const tab = yield* GuestView.tab;
  // @ts-expect-error Capture options stay checked against their schema.
  yield* tab.capture({ rect: "all" });
});
