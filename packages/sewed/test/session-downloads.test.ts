import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { test } from "node:test";
import { Effect } from "effect";
import type { MainContext } from "../src/RuntimeContext.ts";
import * as Testing from "../src/Testing.ts";
import * as SessionDownloads from "../src/internal/SessionDownloads.ts";

class FakeItem extends EventEmitter {
  constructor(readonly savePath: string) {
    super();
  }
  resumed = false;
  getReceivedBytes = () => 5;
  getTotalBytes = () => 10;
  getPercentComplete = () => 50;
  getCurrentBytesPerSecond = () => 0;
  canResume = () => true;
  isPaused = () => false;
  getState = () => "interrupted" as const;
  getSavePath = () => this.savePath;
  getStartTime = () => 100;
  getEndTime = () => 0;
  getETag = () => '"v1"';
  getLastModifiedTime = () => "Mon, 01 Jan 2024 00:00:00 GMT";
  getInitiatorOrigin = () => "https://example.com";
  pause = () => {};
  resume = () => {
    this.resumed = true;
  };
  cancel = () => {};
}

const target = path.resolve("/downloads/big.iso");
const run = <A, E>(effect: Effect.Effect<A, E, MainContext>) =>
  Effect.runPromise(Effect.provide(effect, Testing.main));

/** A session that announces the recreated download the way Electron does: with no web contents. */
const fakeSession = (announce: (emitter: EventEmitter, item: FakeItem) => void) => {
  const created: unknown[] = [];
  const item = new FakeItem(target);
  const emitter = Object.assign(new EventEmitter(), {
    createInterruptedDownload: (options: unknown) => {
      created.push(options);
      announce(emitter, item);
    },
  });
  return { emitter, created, item };
};

test("a resumed download is adopted from the session's own announcement", async () => {
  const fake = fakeSession((emitter, item) => {
    emitter.emit("will-download", {}, new FakeItem(path.resolve("/downloads/other")), null);
    emitter.emit("will-download", {}, new FakeItem(target), { id: 7 });
    emitter.emit("will-download", {}, item, null);
  });
  const handle = await run(
    SessionDownloads.resume(fake.emitter, {
      path: target,
      urlChain: ["https://example.com/big.iso"],
      offset: 5,
      length: 10,
      eTag: '"v1"',
    }),
  );
  assert.deepEqual(fake.created, [
    {
      path: target,
      urlChain: ["https://example.com/big.iso"],
      offset: 5,
      length: 10,
      eTag: '"v1"',
    },
  ]);
  assert.equal(fake.emitter.listenerCount("will-download"), 0, "the one-shot listener is gone");
  const details = await run(handle.details);
  assert.equal(details.savePath, target);
  assert.equal(details.eTag, '"v1"');
  await run(handle.resume);
  assert.equal(fake.item.resumed, true, "the adopted item is the one saved at the path");
});

test("an invalid interrupted download is refused before Electron sees it", async () => {
  const fake = fakeSession(() => {});
  const refused = async (options: Parameters<typeof SessionDownloads.resume>[1]) =>
    (await run(Effect.flip(SessionDownloads.resume(fake.emitter, options)))).code;
  const valid = {
    path: target,
    urlChain: ["https://example.com/a"] as const,
    offset: 0,
    length: 1,
  };
  assert.equal(await refused({ ...valid, path: "relative.iso" }), "Protocol");
  // @ts-expect-error a URL chain names at least one URL
  assert.equal(await refused({ ...valid, urlChain: [] }), "Protocol");
  assert.equal(await refused({ ...valid, offset: -1 }), "Protocol");
  assert.deepEqual(fake.created, []);
});

test("a session that refuses the download fails Native and leaves no listener", async () => {
  const emitter = Object.assign(new EventEmitter(), {
    createInterruptedDownload: () => {
      throw new Error("no such file");
    },
  });
  const failure = await run(
    Effect.flip(
      SessionDownloads.resume(emitter, {
        path: target,
        urlChain: ["https://example.com/a"],
        offset: 0,
        length: 1,
      }),
    ),
  );
  assert.equal(failure.code, "Native");
  assert.equal(emitter.listenerCount("will-download"), 0);
});
