import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Context, Effect } from "effect";
import { SewedError } from "../src/SewedError.ts";
import * as ContentsDownloads from "../src/internal/ContentsDownloads.ts";

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
  getState = () => "progressing" as const;
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

test("deciders run synchronously with the captured services; suspension or failure denies", () => {
  class Root extends Context.Service<Root, { readonly dir: string }>()("test/Root") {}
  const context = Context.make(Root, { dir: "/data" });
  const decide = ContentsDownloads.deciderSync(
    (offer) =>
      Effect.map(Root, ({ dir }) => ({ kind: "save" as const, path: `${dir}/${offer.filename}` })),
    context,
  );
  const offer = { url: "u", filename: "f", mimeType: "m", totalBytes: 1, sourceId: "s" };
  assert.deepEqual(decide(offer), { kind: "save", path: "/data/f" });
  const suspended = ContentsDownloads.deciderSync(
    () => Effect.delay(Effect.succeed({ kind: "save" as const, path: "/x" }), 10),
    context,
  );
  assert.deepEqual(suspended(offer), { kind: "deny" });
  const failing = ContentsDownloads.deciderSync(
    () => Effect.fail(new SewedError({ code: "Native", message: "no" })),
    context,
  );
  assert.deepEqual(failing(offer), { kind: "deny" });
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

test("the synchronous decider accepts a prompt decision with validated dialog options", () => {
  const offer = { url: "u", filename: "report.pdf", mimeType: "m", totalBytes: 1, sourceId: "w1" };
  const prompt = ContentsDownloads.deciderSync(
    () => Effect.succeed({ kind: "prompt" as const, dialog: saveAs }),
    Context.empty(),
  );
  assert.deepEqual(prompt(offer), { kind: "prompt", dialog: saveAs });
  const invalid = ContentsDownloads.deciderSync(
    () => Effect.succeed({ kind: "prompt" as const, dialog: { filters: [] } }),
    Context.empty(),
  );
  assert.deepEqual(invalid(offer), { kind: "deny" });
});
