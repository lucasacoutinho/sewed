import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as ContentsDownloads from "../src/internal/ContentsDownloads.ts";
import * as ContentsPosture from "../src/internal/ContentsPosture.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

class FakeItem extends EventEmitter {
  savePath = "";
  dialogOptions: unknown = undefined;
  cancelled = false;
  getURL = () => "https://example.com/report.pdf";
  getFilename = () => "report.pdf";
  getMimeType = () => "application/pdf";
  getTotalBytes = () => 42;
  getReceivedBytes = () => 0;
  getPercentComplete = () => 0;
  getCurrentBytesPerSecond = () => 0;
  canResume = () => false;
  isPaused = () => false;
  getState = () => "progressing";
  setSavePath = (path: string) => {
    this.savePath = path;
  };
  setSaveDialogOptions = (options: unknown) => {
    this.dialogOptions = options;
  };
  pause = () => {};
  resume = () => {};
  cancel = () => {
    this.cancelled = true;
  };
}

const fire = (session: EventEmitter, contentsId: number, item: FakeItem) => {
  let prevented = false;
  session.emit(
    "will-download",
    {
      preventDefault: () => {
        prevented = true;
      },
    },
    item,
    { id: contentsId },
  );
  return prevented;
};

test("a guest without a decider denies and reports the download", () => {
  const session = new EventEmitter();
  const blocked: string[] = [];
  const release = ContentsDownloads.install(session, 5, {
    sourceId: "g1",
    onBlocked: (url) => blocked.push(url),
    decide: undefined,
    onAccepted: () => assert.fail("accepted"),
  });
  assert.equal(fire(session, 5, new FakeItem()), true);
  assert.equal(fire(session, 6, new FakeItem()), false);
  assert.deepEqual(blocked, ["https://example.com/report.pdf"]);
  release();
  assert.equal(session.listenerCount("will-download"), 0);
});

test("a save decision sets the path and offers an adopted handle", () => {
  const session = new EventEmitter();
  const accepted: unknown[] = [];
  const entry: ContentsDownloads.Entry = {
    sourceId: "g1",
    onBlocked: () => assert.fail("blocked"),
    decide: undefined,
    onAccepted: (handle) => accepted.push(handle),
  };
  const release = ContentsDownloads.install(session, 5, entry);
  entry.decide = (offer) => ({ kind: "save", path: `/tmp/${offer.filename}` });
  const item = new FakeItem();
  assert.equal(fire(session, 5, item), false);
  assert.equal(item.savePath, "/tmp/report.pdf");
  assert.equal(accepted.length, 1);
  release();
});

test("a deny decision prevents the download and reports it", () => {
  const session = new EventEmitter();
  const blocked: string[] = [];
  const entry: ContentsDownloads.Entry = {
    sourceId: "g1",
    onBlocked: (url) => blocked.push(url),
    decide: () => ({ kind: "deny" }),
    onAccepted: () => assert.fail("accepted"),
  };
  const release = ContentsDownloads.install(session, 5, entry);
  assert.equal(fire(session, 5, new FakeItem()), true);
  assert.deepEqual(blocked, ["https://example.com/report.pdf"]);
  release();
});

test("two guests on one session share one listener", () => {
  const session = new EventEmitter();
  const seen: string[] = [];
  const entryFor = (sourceId: string): ContentsDownloads.Entry => ({
    sourceId,
    onBlocked: () => seen.push(sourceId),
    decide: undefined,
    onAccepted: () => {},
  });
  const releaseA = ContentsDownloads.install(session, 1, entryFor("a"));
  const releaseB = ContentsDownloads.install(session, 2, entryFor("b"));
  assert.equal(session.listenerCount("will-download"), 1);
  fire(session, 2, new FakeItem());
  fire(session, 1, new FakeItem());
  assert.deepEqual(seen, ["b", "a"]);
  releaseA();
  assert.equal(session.listenerCount("will-download"), 1);
  releaseB();
  assert.equal(session.listenerCount("will-download"), 0);
});

// Each subscription to a window's `downloads` calls `install` again for the *same* contents
// (`internal/WebContents.ts`), so two subscribers register twice against one id. Registering by id
// alone meant the second replaced the first and its own end removed the native listener out from
// under it: a download the decider denied then proceeded, with a subscriber still listening and
// nothing reported to `blocked`.
test("a second subscriber to one contents does not take governance away from the first when it ends", () => {
  const session = new EventEmitter();
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "deny" })),
  );
  const blocked: string[] = [];
  const subscribe = () =>
    ContentsDownloads.install(session, 5, {
      sourceId: "w1",
      onBlocked: (url) => blocked.push(url),
      decide: resolvedDecide(registry),
      onAccepted: () => assert.fail("a denied download must not be accepted"),
    });
  const endFirst = subscribe();
  const endSecond = subscribe();
  assert.equal(session.listenerCount("will-download"), 1, "two subscribers share one listener");
  assert.equal(fire(session, 5, new FakeItem()), true);
  assert.deepEqual(blocked, ["https://example.com/report.pdf"], "one download, reported once");
  endSecond();
  assert.equal(
    session.listenerCount("will-download"),
    1,
    "the listener stays while a subscriber remains",
  );
  assert.equal(fire(session, 5, new FakeItem()), true, "the remaining subscriber still governs");
  endFirst();
  assert.equal(session.listenerCount("will-download"), 0, "the last subscriber takes it with it");
  assert.equal(fire(session, 5, new FakeItem()), false);
  assert.equal(blocked.length, 2);
});

test("an accepted download reaches every subscriber to the same contents, as one handle", () => {
  const session = new EventEmitter();
  const accepted: unknown[] = [];
  const subscribe = () =>
    ContentsDownloads.install(session, 5, {
      sourceId: "w1",
      onBlocked: () => assert.fail("blocked"),
      decide: () => ({ kind: "save", path: "/tmp/report.pdf" }),
      onAccepted: (handle) => accepted.push(handle),
    });
  const endFirst = subscribe();
  const endSecond = subscribe();
  const item = new FakeItem();
  assert.equal(fire(session, 5, item), false);
  assert.equal(item.savePath, "/tmp/report.pdf");
  assert.equal(accepted.length, 2, "both subscribers are offered the download");
  assert.equal(accepted[0], accepted[1], "the item is adopted once, so both see one handle");
  endSecond();
  endFirst();
});

// A guest's shape, which is the window's with one entry more: `internal/GuestView.ts` registers its
// own entry at construction — that one governs and publishes `blocked` whether or not anything is
// subscribed — and each `downloads` subscription registers beside it, receiving only. The guest used
// to keep a single `onAccepted` slot that each subscription overwrote and each ending subscription
// reset, so after any overlap the survivor received nothing again, permanently, and an accepted
// download ran with nobody holding its handle.
test("a guest's own entry keeps governing while its subscriptions come and go", () => {
  const session = new EventEmitter();
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.guestFallbacks(undefined),
  });
  const blocked: string[] = [];
  const governing: ContentsDownloads.Entry = {
    sourceId: "g1",
    onBlocked: (url) => blocked.push(url),
    decide: resolvedDecide(registry),
    onAccepted: () => {},
  };
  ContentsDownloads.install(session, 5, governing);
  const received: Record<"first" | "second", unknown[]> = { first: [], second: [] };
  const subscribe = (who: "first" | "second") =>
    ContentsDownloads.install(session, 5, {
      ...governing,
      onAccepted: (handle) => received[who].push(handle),
    });

  // Denied by the guest's own posture, with subscribers present and no decider installed.
  const endFirst = subscribe("first");
  const endSecond = subscribe("second");
  assert.equal(fire(session, 5, new FakeItem()), true);
  assert.deepEqual(blocked, ["https://example.com/report.pdf"], "one download, reported once");

  const removeDecider = registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "save", path: "/tmp/report.pdf" })),
  );
  assert.equal(fire(session, 5, new FakeItem()), false);
  assert.equal(received.first.length, 1, "both subscribers receive while both are subscribed");
  assert.equal(received.second.length, 1);
  endSecond();
  assert.equal(fire(session, 5, new FakeItem()), false);
  assert.equal(received.first.length, 2, "ending one subscription must not silence the other");
  assert.equal(received.second.length, 1);
  endFirst();
  // The guest's own entry outlives every subscription, so the listener is still installed and the
  // download is still decided; nobody is left to receive the handle.
  assert.equal(fire(session, 5, new FakeItem()), false);
  assert.equal(received.first.length, 2);
  assert.equal(session.listenerCount("will-download"), 1, "the guest's own entry holds it");
  removeDecider();
  assert.equal(
    fire(session, 5, new FakeItem()),
    true,
    "with every subscription ended, the guest's own posture still denies",
  );
  assert.deepEqual(blocked, ["https://example.com/report.pdf", "https://example.com/report.pdf"]);
});

// `Entry.decide` is filled from `Decidables.WebContents.Download`'s registry resolution now, not from
// a caller's function wrapped by a since-removed `deciderSync` — this is the exact expression
// `internal/WebContents.ts` and `internal/GuestView.ts` both wire into `Entry.decide`, proven here
// against the real dispatch `ContentsDownloads.install` drives, without needing Electron.
const resolvedDecide =
  (registry: Registry.Resolver<"contents">): ContentsDownloads.Entry["decide"] =>
  (offer) =>
    registry.resolveSync(Decidables.WebContents.Download, offer);

// Both owners' registries are built from `ContentsPosture`, the way `internal/GuestView.ts` and
// `internal/WebContents.ts` build their own: a bare `Registry.make({ owner: "contents" })` is a
// posture no production contents has, and building these on one is how a broken download decider
// came to reach a window's save dialog while every test still passed.
test("a decider that throws denies a guest's download, and the denial reports as a download", () => {
  const session = new EventEmitter();
  const blocked: Array<{ readonly kind: "download"; readonly url: string }> = [];
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.guestFallbacks(undefined),
  });
  registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  const release = ContentsDownloads.install(session, 5, {
    sourceId: "g1",
    // The exact shape `internal/WebContents.ts` and `internal/GuestView.ts` publish to `blocked`.
    onBlocked: (url) => blocked.push({ kind: "download", url }),
    decide: resolvedDecide(registry),
    onAccepted: () => assert.fail("accepted"),
  });
  assert.equal(fire(session, 5, new FakeItem()), true);
  assert.deepEqual(blocked, [{ kind: "download", url: "https://example.com/report.pdf" }]);
  release();
});

// The same broken decider on the other posture, through the same native dispatch. A window's own
// registry overrides the download fallback to `prompt`, so nobody objecting hands the item to
// Electron's save dialog — but a decider that threw decided nothing, and `Download`'s declared
// failure denies on both owners. Without that declaration this download is accepted and saved.
test("a decider that throws denies a window's download too, where nobody objecting would prompt", () => {
  const session = new EventEmitter();
  const blocked: string[] = [];
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  const release = ContentsDownloads.install(session, 5, {
    sourceId: "w1",
    onBlocked: (url) => blocked.push(url),
    decide: resolvedDecide(registry),
    onAccepted: () => assert.fail("a broken download decider must not reach the save dialog"),
  });
  const item = new FakeItem();
  assert.equal(fire(session, 5, item), true);
  assert.equal(item.dialogOptions, undefined);
  assert.deepEqual(blocked, ["https://example.com/report.pdf"]);
  release();
});

test("two deciders installed on the registry compose restrictively through the same dispatch", () => {
  const session = new EventEmitter();
  const accepted: unknown[] = [];
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  // Installed in the order the least restrictive answer would win under "the latest decider wins",
  // which restrictive composition never does: "prompt" outranks "save" regardless of install order.
  registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "save", path: "/tmp/x" })),
  );
  registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  const entry: ContentsDownloads.Entry = {
    sourceId: "w1",
    onBlocked: () => assert.fail("blocked"),
    decide: resolvedDecide(registry),
    onAccepted: (handle) => accepted.push(handle),
  };
  const release = ContentsDownloads.install(session, 5, entry);
  const item = new FakeItem();
  assert.equal(fire(session, 5, item), false);
  assert.equal(item.dialogOptions, undefined);
  assert.equal(item.savePath, "");
  assert.equal(accepted.length, 1);
  release();
});

const saveAs = {
  title: "Save As",
  defaultPath: "report.pdf",
  filters: [{ name: "PDF Document", extensions: ["pdf"] }],
};

test("a prompt decision applies its save dialog options and offers an adopted handle", () => {
  const session = new EventEmitter();
  const accepted: unknown[] = [];
  const release = ContentsDownloads.install(session, 5, {
    sourceId: "w1",
    onBlocked: () => assert.fail("blocked"),
    decide: () => ({ kind: "prompt", dialog: saveAs }),
    onAccepted: (handle) => accepted.push(handle),
  });
  const item = new FakeItem();
  assert.equal(fire(session, 5, item), false);
  assert.deepEqual(item.dialogOptions, saveAs);
  assert.equal(item.savePath, "");
  assert.equal(accepted.length, 1);
  release();
});

test("a prompt decision without options leaves Electron's own save dialog", () => {
  const session = new EventEmitter();
  const accepted: unknown[] = [];
  const release = ContentsDownloads.install(session, 5, {
    sourceId: "w1",
    onBlocked: () => assert.fail("blocked"),
    decide: () => ({ kind: "prompt" }),
    onAccepted: (handle) => accepted.push(handle),
  });
  const item = new FakeItem();
  assert.equal(fire(session, 5, item), false);
  assert.equal(item.dialogOptions, undefined);
  assert.equal(item.savePath, "");
  assert.equal(accepted.length, 1);
  release();
});

test("the registry denies rather than propagate a decider's off-schema dialog options", () => {
  const session = new EventEmitter();
  const blocked: string[] = [];
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  registry.install(
    Decidables.WebContents.Download,
    // `filters` is a non-empty array in `Dialog.SaveOptions`; an empty one is off-schema, the same
    // way a decider that throws is — the registry's own resolution denies rather than let it reach
    // `ContentsDownloads`'s own dialog handling at all.
    Decision.sync(() => ({ kind: "prompt", dialog: { filters: [] } })),
  );
  const release = ContentsDownloads.install(session, 5, {
    sourceId: "w1",
    onBlocked: (url) => blocked.push(url),
    decide: resolvedDecide(registry),
    onAccepted: () => assert.fail("accepted"),
  });
  assert.equal(fire(session, 5, new FakeItem()), true);
  assert.deepEqual(blocked, ["https://example.com/report.pdf"]);
  release();
});
