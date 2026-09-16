import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as ContentsDownloads from "../src/internal/ContentsDownloads.ts";
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

// `Entry.decide` is filled from `Decidables.WebContents.Download`'s registry resolution now, not from
// a caller's function wrapped by a since-removed `deciderSync` — this is the exact expression
// `internal/WebContents.ts` and `internal/GuestView.ts` both wire into `Entry.decide`, proven here
// against the real dispatch `ContentsDownloads.install` drives, without needing Electron.
const resolvedDecide =
  (registry: ReturnType<typeof Registry.make>): ContentsDownloads.Entry["decide"] =>
  (offer) =>
    registry.resolveSync(Decidables.WebContents.Download, offer);

test("a decider that throws denies through the registry's own fallback, and the denial reports as a download", () => {
  const session = new EventEmitter();
  const blocked: Array<{ readonly kind: "download"; readonly url: string }> = [];
  const registry = Registry.make();
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

test("two deciders installed on the registry compose restrictively through the same dispatch", () => {
  const session = new EventEmitter();
  const accepted: unknown[] = [];
  const registry = Registry.make();
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
  const registry = Registry.make();
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
