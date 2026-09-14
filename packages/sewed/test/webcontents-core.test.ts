import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents } from "electron";
import { Effect, Exit, Fiber, Scope, Stream } from "effect";
import * as Testing from "../src/Testing.ts";
import { core } from "../src/internal/WebContentsCore.ts";

class FakeContents extends EventEmitter {
  url = "";
  loadingMainFrame = false;
  setWindowOpenHandler = () => {};
  isDestroyed = () => false;
  getOSProcessId = () => 42;
  getURL = () => this.url;
  isLoadingMainFrame = () => this.loadingMainFrame;
  getZoomFactor = () => 1;
  isAudioMuted = () => false;
  isCurrentlyAudible = () => false;
  navigationHistory = {
    getAllEntries: () => [],
    getActiveIndex: () => 0,
    canGoBack: () => false,
    canGoForward: () => false,
  };
}

const start = (contents: FakeContents, url: string) => {
  contents.loadingMainFrame = true;
  contents.emit("did-start-navigation", { url, isSameDocument: false, isMainFrame: true });
};
const commit = (contents: FakeContents, url: string) => {
  contents.url = url;
  contents.emit("did-navigate", {}, url, 200, "OK");
};
const finish = (contents: FakeContents) => {
  contents.loadingMainFrame = false;
  contents.emit("did-finish-load");
};

const settled = (done: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 200 && !done(); attempt++) yield* Effect.sleep(5);
    assert.ok(done(), "the observer did not settle in time");
  });

const withCore = <A>(
  use: (
    contents: FakeContents,
    states: () => readonly { readonly status: string; readonly url?: string }[],
  ) => Effect.Effect<A, unknown, unknown>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        // Test-only bridge: the core reads these members structurally.
        const native = contents as unknown as WebContents;
        const { contents: web } = yield* core(native, { allows: () => true });
        const seen: { readonly status: string; readonly url?: string }[] = [];
        yield* web.state.pipe(
          Stream.runForEach((state) => Effect.sync(() => seen.push(state))),
          Effect.forkScoped,
        );
        yield* settled(() => seen.length >= 1);
        return yield* use(contents, () => seen);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );

test("a load is ready once its own navigation has committed and finished", async () => {
  await withCore((contents, states) =>
    Effect.gen(function* () {
      start(contents, "http://host/one");
      commit(contents, "http://host/one");
      finish(contents);
      yield* settled(() => states().length >= 3);
      assert.deepEqual(
        states().map((state) => [state.status, state.url]),
        [
          ["idle", undefined],
          ["loading", "http://host/one"],
          ["ready", "http://host/one"],
        ],
      );
    }),
  );
});

test("a stale document finishing after a newer navigation started does not mark it ready", async () => {
  await withCore((contents, states) =>
    Effect.gen(function* () {
      start(contents, "http://host/submit");
      contents.emit("did-fail-load", {}, -20, "ERR_BLOCKED_BY_CLIENT", "http://host/submit", true);
      commit(contents, "http://host/submit");
      start(contents, "http://host/form");
      finish(contents);
      yield* settled(() => states().at(-1)?.url === "http://host/form");
      assert.deepEqual(states().at(-1), { status: "loading", url: "http://host/form" });
      commit(contents, "http://host/form");
      finish(contents);
      yield* settled(() => states().at(-1)?.status === "ready");
      assert.deepEqual(states().at(-1), {
        status: "ready",
        url: "http://host/form",
        processId: 42,
      });
    }),
  );
});

test("console messages stream with their level, text, line, and source until the observer ends", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        // Test-only bridge: the core reads these members structurally.
        const native = contents as unknown as WebContents;
        const { contents: web } = yield* core(native, { allows: () => true });
        const seen: unknown[] = [];
        const observer = yield* web.console.pipe(
          Stream.runForEach((message) => Effect.sync(() => seen.push(message))),
          Effect.forkScoped,
        );
        yield* settled(() => contents.listenerCount("console-message") > 0);
        contents.emit("console-message", {
          level: "warning",
          message: "careful",
          lineNumber: 7,
          sourceId: "http://host/app.js",
        });
        yield* settled(() => seen.length === 1);
        assert.deepEqual(seen, [
          { level: "warning", message: "careful", lineNumber: 7, sourceId: "http://host/app.js" },
        ]);
        yield* Fiber.interrupt(observer);
        assert.equal(contents.listenerCount("console-message"), 0);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

void Scope;
void Exit;
