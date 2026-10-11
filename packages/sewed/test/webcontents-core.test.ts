import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents } from "electron";
import { Cause, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import { core } from "../src/internal/WebContentsCore.ts";

/**
 * A fresh owner whose registry has no deciders installed, reports nothing blocked, and answers a
 * fixed display scale of 2 — standing in for the real owner's `BrowserWindow.fromWebContents`
 * lookup, so a no-`rect` capture is exercisable under Node.
 */
const freshOwner = () => ({
  registry: Registry.make({ owner: "contents" }),
  blocked: () => {},
  displayScaleFactor: () => 2,
  imageOf: () => {
    throw new Error("no image module in this test");
  },
});

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
  historyEntries: { readonly url: string; readonly title: string }[] = [];
  historyIndex = 0;
  goToIndexCalls: number[] = [];
  navigationHistory = {
    getAllEntries: () => this.historyEntries,
    getActiveIndex: () => this.historyIndex,
    canGoBack: () => this.historyIndex > 0,
    canGoForward: () => this.historyIndex < this.historyEntries.length - 1,
    goToIndex: (index: number) => {
      this.goToIndexCalls.push(index);
    },
  };
}

const start = (contents: FakeContents, url: string) => {
  contents.loadingMainFrame = true;
  contents.emit("did-start-navigation", { url, isSameDocument: false, isMainFrame: true });
};
const commit = (contents: FakeContents, url: string, httpResponseCode = 200) => {
  contents.url = url;
  contents.emit(
    "did-navigate",
    {},
    url,
    httpResponseCode,
    httpResponseCode === 200 ? "OK" : "Internal Server Error",
  );
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

const withCore = <A, E>(
  use: (
    contents: FakeContents,
    states: () => readonly { readonly status: string; readonly url?: string }[],
  ) => Effect.Effect<A, E, MainContext | Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        // Test-only bridge: the core reads these members structurally.
        const native = contents as unknown as WebContents;
        const { contents: web } = yield* core(native, freshOwner());
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
        httpStatus: 200,
      });
    }),
  );
});

test("did-navigate keeps the committed generation's HTTP status for the ready it settles", async () => {
  await withCore((contents, states) =>
    Effect.gen(function* () {
      start(contents, "http://host/error");
      commit(contents, "http://host/error", 500);
      finish(contents);
      yield* settled(() => states().at(-1)?.status === "ready");
      assert.deepEqual(states().at(-1), {
        status: "ready",
        url: "http://host/error",
        processId: 42,
        httpStatus: 500,
      });
    }),
  );
});

test("a stale did-navigate cannot change the HTTP status a newer ready reports", async () => {
  await withCore((contents, states) =>
    Effect.gen(function* () {
      // The first navigation commits with a server error, then a newer navigation supersedes it
      // before it finishes: the stale 500 must not leak into the newer document's ready state.
      start(contents, "http://host/submit");
      commit(contents, "http://host/submit", 500);
      start(contents, "http://host/form");
      finish(contents);
      yield* settled(() => states().at(-1)?.url === "http://host/form");
      assert.deepEqual(states().at(-1), { status: "loading", url: "http://host/form" });
      commit(contents, "http://host/form", 200);
      finish(contents);
      yield* settled(() => states().at(-1)?.status === "ready");
      assert.deepEqual(states().at(-1), {
        status: "ready",
        url: "http://host/form",
        processId: 42,
        httpStatus: 200,
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
        const { contents: web } = yield* core(native, freshOwner());
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

const errorOf = (exit: Exit.Exit<unknown, unknown>): SewedError | undefined => {
  if (exit._tag !== "Failure") return undefined;
  const error = Cause.squash(exit.cause);
  return error instanceof SewedError ? error : undefined;
};

const withContents = <A, E>(
  use: (
    contents: FakeContents,
    web: Effect.Success<ReturnType<typeof core>>["contents"],
  ) => Effect.Effect<A, E, MainContext | Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        // Test-only bridge: the core reads these members structurally.
        const native = contents as unknown as WebContents;
        const { contents: web } = yield* core(native, freshOwner());
        return yield* use(contents, web);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );

test("terminate crashes the renderer, reports gone, and does not reload", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      let reloads = 0;
      let crashes = 0;
      Object.assign(contents, {
        reload: () => {
          reloads += 1;
        },
        forcefullyCrashRenderer: () => {
          crashes += 1;
          contents.emit("render-process-gone", {}, { reason: "killed", exitCode: 9 });
        },
      });
      const seen: { readonly status: string }[] = [];
      yield* web.state.pipe(
        Stream.runForEach((state) => Effect.sync(() => seen.push(state))),
        Effect.forkScoped,
      );
      yield* settled(() => seen.length >= 1);
      yield* web.terminate;
      yield* settled(() => seen.some((state) => state.status === "gone"));
      assert.equal(crashes, 1);
      assert.equal(reloads, 0);
    }),
  );
});

test("capture answers the image's own pixel size and derives scale factor from the given rect's DIP width", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      // The fake renders at 2x the requested rect, the way a device-scale-factor-2 display would.
      Object.assign(contents, {
        capturePage: async (rect?: { readonly width: number; readonly height: number }) => ({
          getSize: () => ({ width: (rect?.width ?? 0) * 2, height: (rect?.height ?? 0) * 2 }),
          toPNG: () => Buffer.from([137, 80, 78, 71]),
        }),
      });
      const captured = yield* web.capture({ rect: { x: 0, y: 0, width: 32, height: 16 } });
      assert.deepEqual([...captured.bytes.subarray(0, 4)], [137, 80, 78, 71]);
      assert.equal(captured.width, 64);
      assert.equal(captured.height, 32);
      assert.equal(captured.scaleFactor, 2);
    }),
  );
});

test("capture with no rect derives scale factor from the owner, synchronously and under Node", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      Object.assign(contents, {
        capturePage: async () => ({
          getSize: () => ({ width: 64, height: 32 }),
          toPNG: () => Buffer.from([137, 80, 78, 71]),
        }),
      });
      const captured = yield* web.capture();
      assert.equal(captured.width, 64);
      assert.equal(captured.height, 32);
      assert.equal(captured.scaleFactor, 2);
    }),
  );
});

test("favicons replay the latest list and reset when a new document starts loading", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      const seen: (readonly string[])[] = [];
      yield* web.favicons.pipe(
        Stream.runForEach((list) => Effect.sync(() => seen.push(list))),
        Effect.forkScoped,
      );
      yield* settled(() => seen.length >= 1);
      contents.emit("page-favicon-updated", {}, ["https://host/icon.png"]);
      yield* settled(() => seen.length >= 2);
      start(contents, "http://host/two");
      yield* settled(() => seen.length >= 3);
      assert.deepEqual(seen, [[], ["https://host/icon.png"], []]);
      contents.emit("page-favicon-updated", {}, ["https://host/two.ico"]);
      const late = yield* web.favicons.pipe(Stream.take(1), Stream.runCollect);
      assert.deepEqual(Array.from(late), [["https://host/two.ico"]]);
    }),
  );
});

test("title mirrors page-title-updated whatever TitleUpdate answers, and resets when a new document starts loading", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      const seen: string[] = [];
      yield* web.title.pipe(
        Stream.runForEach((value) => Effect.sync(() => seen.push(value))),
        Effect.forkScoped,
      );
      yield* settled(() => seen.length >= 1);
      // The decidable's own fallback is "keep" (no decider installed) resolves here too, but this
      // event's own `preventDefault` is inert — only the BROWSER WINDOW's own `page-title-updated`
      // holds a real native title bar (`internal/Window.ts`, `WindowTitle.holdsTitle` in
      // decidables-navigation.test.ts). The mirror moves regardless of the decision either way.
      contents.emit("page-title-updated", { preventDefault: () => {} }, "Kept title");
      yield* settled(() => seen.length >= 2);
      yield* web.decide(
        Decidables.WebContents.TitleUpdate,
        Decision.sync(() => "accept"),
      );
      contents.emit("page-title-updated", { preventDefault: () => {} }, "First title");
      yield* settled(() => seen.length >= 3);
      start(contents, "http://host/two");
      yield* settled(() => seen.length >= 4);
      assert.deepEqual(seen, ["", "Kept title", "First title", ""]);
      contents.emit("page-title-updated", { preventDefault: () => {} }, "Second title");
      const late = yield* web.title.pipe(Stream.take(1), Stream.runCollect);
      assert.deepEqual(Array.from(late), ["Second title"]);
    }),
  );
});

test("current answers the same values the streams last published, read fresh rather than waited for", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      const seen: { readonly status: string }[] = [];
      yield* web.state.pipe(
        Stream.runForEach((state) => Effect.sync(() => seen.push(state))),
        Effect.forkScoped,
      );
      yield* settled(() => seen.length >= 1);
      start(contents, "http://host/one");
      commit(contents, "http://host/one");
      finish(contents);
      yield* settled(() => seen.at(-1)?.status === "ready");
      // After the navigation settles, so neither is wiped by the reset a real one would trigger.
      contents.emit("page-favicon-updated", {}, ["https://host/icon.png"]);
      yield* web.decide(
        Decidables.WebContents.TitleUpdate,
        Decision.sync(() => "accept"),
      );
      contents.emit("page-title-updated", { preventDefault: () => {} }, "A title");
      const current = yield* web.current;
      assert.deepEqual(current, {
        state: { status: "ready", url: "http://host/one", processId: 42, httpStatus: 200 },
        history: { index: 0, entries: [], canGoBack: false, canGoForward: false },
        title: "A title",
        favicons: ["https://host/icon.png"],
        zoom: { factor: 1 },
        audio: { muted: false, audible: false },
      });
      // Fresh, not cached: a change after the read moves it too, with no new subscription needed.
      contents.emit("page-favicon-updated", {}, ["https://host/two.ico"]);
      assert.deepEqual((yield* web.current).favicons, ["https://host/two.ico"]);
    }),
  );
});

const withHistory = (contents: FakeContents) => {
  contents.historyEntries = [
    { url: "http://host/one", title: "One" },
    { url: "http://host/two", title: "Two" },
  ];
  contents.historyIndex = 1;
};

test("back waits for the navigation it triggered to reach ready, and answers that state", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      withHistory(contents);
      yield* web.decide(
        Decidables.WebContents.Navigation,
        Decision.sync(() => "allow"),
      );
      const fiber = yield* Effect.forkChild(web.back);
      yield* settled(() => contents.goToIndexCalls.length >= 1);
      assert.deepEqual(contents.goToIndexCalls, [0]);
      // Not yet settled: the navigation it started has not reached a non-loading state.
      assert.equal(fiber.pollUnsafe(), undefined);
      start(contents, "http://host/one");
      assert.equal(fiber.pollUnsafe(), undefined);
      commit(contents, "http://host/one");
      finish(contents);
      const result = yield* Fiber.join(fiber);
      assert.deepEqual(result, {
        status: "ready",
        url: "http://host/one",
        processId: 42,
        httpStatus: 200,
      });
    }),
  );
});

test("back answers the failed state when the navigation it triggered fails to load", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      withHistory(contents);
      yield* web.decide(
        Decidables.WebContents.Navigation,
        Decision.sync(() => "allow"),
      );
      const fiber = yield* Effect.forkChild(web.back);
      yield* settled(() => contents.goToIndexCalls.length >= 1);
      start(contents, "http://host/one");
      contents.emit("did-fail-load", {}, -105, "ERR_NAME_NOT_RESOLVED", "http://host/one", true);
      const result = yield* Fiber.join(fiber);
      assert.deepEqual(result, {
        status: "failed",
        url: "http://host/one",
        code: -105,
        description: "ERR_NAME_NOT_RESOLVED",
      });
    }),
  );
});

test("back fails Protocol with reason history/no-entry when there is no entry to move to", async () => {
  await withContents((_contents, web) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(web.back);
      const error = errorOf(exit);
      assert.equal(error?.code, "Protocol");
      assert.equal(error?.reason, "history/no-entry");
    }),
  );
});

test("back fails Protocol with reason policy/denied when the target entry is outside the navigation policy", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      withHistory(contents);
      // No decider installed: `Decidables.WebContents.Navigation`'s own fallback is "deny".
      const exit = yield* Effect.exit(web.back);
      const error = errorOf(exit);
      assert.equal(error?.code, "Protocol");
      assert.equal(error?.reason, "policy/denied");
      assert.equal(contents.goToIndexCalls.length, 0);
    }),
  );
});

test("go naming the entry already active answers its settled state at once, without calling goToIndex", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      withHistory(contents);
      yield* web.decide(
        Decidables.WebContents.Navigation,
        Decision.sync(() => "allow"),
      );
      // Reach `ready` the ordinary way first, so the snapshot has a settled state to answer.
      start(contents, "http://host/two");
      commit(contents, "http://host/two");
      finish(contents);
      const result = yield* web.go(contents.historyIndex);
      assert.deepEqual(result, {
        status: "ready",
        url: "http://host/two",
        processId: 42,
        httpStatus: 200,
      });
      assert.equal(contents.goToIndexCalls.length, 0, "Electron's goToIndex was never called");
    }),
  );
});

test("go naming the entry already active fails Protocol when nothing has settled there yet", async () => {
  await withContents((contents, web) =>
    Effect.gen(function* () {
      withHistory(contents);
      yield* web.decide(
        Decidables.WebContents.Navigation,
        Decision.sync(() => "allow"),
      );
      // Never navigated: the snapshot is still its initial "idle", not ready or failed.
      const exit = yield* Effect.exit(web.go(contents.historyIndex));
      const error = errorOf(exit);
      assert.equal(error?.code, "Protocol");
      assert.equal(error?.reason, undefined);
      assert.equal(contents.goToIndexCalls.length, 0);
    }),
  );
});

test("SewedError's reason decodes when given and is optional when absent", () => {
  const decode = Schema.decodeUnknownSync(SewedError);
  const withReason = decode({
    _tag: "SewedError",
    code: "Protocol",
    message: "History entry does not exist",
    reason: "history/no-entry",
  });
  assert.equal(withReason.reason, "history/no-entry");
  const withoutReason = decode({ _tag: "SewedError", code: "Protocol", message: "x" });
  assert.equal(withoutReason.reason, undefined);
  assert.equal(
    Schema.decodeUnknownExit(SewedError)({
      _tag: "SewedError",
      code: "Protocol",
      message: "x",
      reason: 1,
    })._tag,
    "Failure",
  );
});
