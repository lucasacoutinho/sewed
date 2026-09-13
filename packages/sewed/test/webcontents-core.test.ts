import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents } from "electron";
import { Effect, Scope, Exit, Stream } from "effect";
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
        yield* Effect.sleep(10);
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
      yield* Effect.sleep(10);
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
      yield* Effect.sleep(10);
      assert.deepEqual(states().at(-1), { status: "loading", url: "http://host/form" });
      commit(contents, "http://host/form");
      finish(contents);
      yield* Effect.sleep(10);
      assert.deepEqual(states().at(-1), {
        status: "ready",
        url: "http://host/form",
        processId: 42,
      });
    }),
  );
});

void Scope;
void Exit;
