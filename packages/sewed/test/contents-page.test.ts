import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents as NativeContents } from "electron";
import { Deferred, Effect, Fiber, Schema, Stream } from "effect";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as WebContents from "../src/WebContents.ts";
import * as ContentsPage from "../src/internal/ContentsPage.ts";

/**
 * A structural web contents: `ContentsPage.make` reads these members, and Electron's own class is
 * not loadable in Node. Every command records its call.
 */
const fakeContents = () => {
  const calls: unknown[][] = [];
  const command =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const emitter = Object.assign(new EventEmitter(), {
    isLoading: () => true,
    isWaitingForResponse: () => false,
    isCrashed: () => false,
    isBeingCaptured: () => false,
    getBackgroundThrottling: () => true,
    isDevToolsOpened: () => true,
    isDevToolsFocused: () => false,
    getDevToolsTitle: () => "Inspector",
    toggleDevTools: command("toggleDevTools"),
    setDevToolsTitle: command("setDevToolsTitle"),
    inspectElement: command("inspectElement"),
    inspectServiceWorker: command("inspectServiceWorker"),
    inspectSharedWorker: command("inspectSharedWorker"),
    enableDeviceEmulation: command("enableDeviceEmulation"),
    disableDeviceEmulation: command("disableDeviceEmulation"),
    copy: command("copy"),
    scrollToTop: command("scrollToTop"),
    replace: command("replace"),
    replaceMisspelling: command("replaceMisspelling"),
    adjustSelection: command("adjustSelection"),
    copyImageAt: command("copyImageAt"),
    setVisualZoomLevelLimits: (minimum: number, maximum: number) => {
      calls.push(["setVisualZoomLevelLimits", minimum, maximum]);
      return Promise.resolve();
    },
    setImageAnimationPolicy: command("setImageAnimationPolicy"),
    takeHeapSnapshot: (path: string) => {
      calls.push(["takeHeapSnapshot", path]);
      return Promise.resolve();
    },
  });
  const closed = Deferred.makeUnsafe<void>();
  const page = ContentsPage.make(
    // Test-only bridge: the module reads these members structurally.
    emitter as unknown as NativeContents,
    {
      closed,
      operation: (run) =>
        Effect.try({
          try: run,
          catch: (cause) =>
            cause instanceof SewedError
              ? cause
              : new SewedError({ code: "Native", message: "failed", cause }),
        }),
      asynchronous: (message, run) =>
        Effect.tryPromise({
          try: run,
          catch: (cause) => new SewedError({ code: "Native", message, cause }),
        }),
    },
  );
  return { emitter, calls, page, closed };
};

const run = <A, E>(effect: Effect.Effect<A, E, MainContext>) =>
  Effect.runPromise(Effect.provide(effect, Testing.main));
const refused = async (effect: Effect.Effect<unknown, SewedError, MainContext>) =>
  (await run(Effect.flip(effect))).code;

test("page events are projected from the native events while a stream runs", async () => {
  const fake = fakeContents();
  const events = await run(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.take(fake.page.events, 9)));
      while (fake.emitter.listenerCount("context-menu") === 0) yield* Effect.yieldNow;
      fake.emitter.emit(
        "context-menu",
        {},
        {
          x: 4,
          y: 5,
          pageURL: "https://example.com/",
          frameURL: "",
          linkURL: "https://example.com/next",
          linkText: "next",
          srcURL: "",
          mediaType: "none",
          hasImageContents: false,
          isEditable: true,
          selectionText: "teh",
          misspelledWord: "teh",
          dictionarySuggestions: ["the"],
          menuSourceType: "mouse",
          editFlags: {
            canUndo: false,
            canRedo: false,
            canCut: true,
            canCopy: true,
            canPaste: true,
            canDelete: true,
            canSelectAll: true,
            canEditRichly: false,
          },
          frame: null,
        },
      );
      fake.emitter.emit("cursor-changed", {}, "pointer");
      fake.emitter.emit("update-target-url", {}, "https://example.com/next");
      fake.emitter.emit("did-change-theme-color", {}, null);
      fake.emitter.emit("enter-html-full-screen", {});
      fake.emitter.emit("preload-error", {}, "/app/preload.js", new Error("boom"));
      fake.emitter.emit("frame-created", {}, { frame: null });
      fake.emitter.emit(
        "frame-created",
        {},
        {
          frame: { processId: 7, routingId: 3, parent: {}, url: "https://example.com/frame" },
        },
      );
      fake.emitter.emit(
        "did-frame-navigate",
        {},
        "https://example.com/frame",
        200,
        "OK",
        false,
        7,
        3,
      );
      fake.emitter.emit("devtools-opened", {});
      return yield* Fiber.join(fiber);
    }),
  );
  const list = [...events];
  for (const event of list) Schema.decodeSync(WebContents.PageEvent)(event);
  assert.deepEqual(
    list.map((event) => event.kind),
    [
      "context-menu",
      "cursor",
      "target-url",
      "theme-color",
      "html-full-screen",
      "preload-error",
      "frame",
      "frame",
      "devtools",
    ],
    "a created frame that is already gone is dropped",
  );
  const menu = list[0];
  assert.ok(menu?.kind === "context-menu");
  assert.equal(menu.linkUrl, "https://example.com/next");
  assert.deepEqual(menu.dictionarySuggestions, ["the"]);
  assert.equal("canEditRichly" in menu.editFlags, false, "only the copied flags travel");
  assert.deepEqual(list[6], {
    kind: "frame",
    change: "created",
    frame: { processId: 7, routingId: 3, isMainFrame: false },
    url: "https://example.com/frame",
  });
  assert.deepEqual(list[7], {
    kind: "frame",
    change: "navigated",
    frame: { processId: 7, routingId: 3, isMainFrame: false },
    url: "https://example.com/frame",
    httpStatus: 200,
  });
  assert.equal(fake.emitter.listenerCount("context-menu"), 0, "the observer released");
});

test("activity and DevTools state are read from the native contents", async () => {
  const fake = fakeContents();
  assert.deepEqual(await run(fake.page.activity), {
    loading: true,
    waitingForResponse: false,
    crashed: false,
    beingCaptured: false,
    backgroundThrottling: true,
  });
  assert.deepEqual(await run(fake.page.devTools), {
    opened: true,
    focused: false,
    title: "Inspector",
  });
});

test("page commands reach the native contents with decoded input", async () => {
  const fake = fakeContents();
  const emulation: WebContents.DeviceEmulation = {
    screenPosition: "mobile",
    screenSize: { width: 390, height: 844 },
    viewPosition: { x: 0, y: 0 },
    deviceScaleFactor: 3,
    viewSize: { width: 390, height: 844 },
    scale: 1,
  };
  await run(fake.page.enableDeviceEmulation(emulation));
  await run(fake.page.disableDeviceEmulation);
  await run(fake.page.edit("copy"));
  await run(fake.page.edit("scrollToTop"));
  await run(fake.page.replace(""));
  await run(fake.page.replaceMisspelling("the"));
  await run(fake.page.adjustSelection({ start: -1 }));
  await run(fake.page.copyImageAt({ x: 1, y: 2 }));
  await run(fake.page.inspectElement({ x: 3, y: 4 }));
  await run(fake.page.inspectWorker("shared"));
  await run(fake.page.setDevToolsTitle("Sewed"));
  await run(fake.page.toggleDevTools);
  await run(fake.page.setVisualZoomLimits({ minimum: 1, maximum: 3 }));
  await run(fake.page.setImageAnimationPolicy("noAnimation"));
  await run(fake.page.takeHeapSnapshot("/tmp/page.heapsnapshot"));
  assert.deepEqual(fake.calls, [
    ["enableDeviceEmulation", emulation],
    ["disableDeviceEmulation"],
    ["copy"],
    ["scrollToTop"],
    ["replace", ""],
    ["replaceMisspelling", "the"],
    ["adjustSelection", { start: -1 }],
    ["copyImageAt", 1, 2],
    ["inspectElement", 3, 4],
    ["inspectSharedWorker"],
    ["setDevToolsTitle", "Sewed"],
    ["toggleDevTools"],
    ["setVisualZoomLevelLimits", 1, 3],
    ["setImageAnimationPolicy", "noAnimation"],
    ["takeHeapSnapshot", "/tmp/page.heapsnapshot"],
  ]);
});

test("invalid page command input is refused before it reaches Electron", async () => {
  const fake = fakeContents();
  // @ts-expect-error not an edit command
  assert.equal(await refused(fake.page.edit("destroy")), "Protocol");
  assert.equal(await refused(fake.page.replaceMisspelling("")), "Protocol");
  assert.equal(await refused(fake.page.copyImageAt({ x: 0.5, y: 0 })), "Protocol");
  assert.equal(
    await refused(fake.page.setVisualZoomLimits({ minimum: 3, maximum: 1 })),
    "Protocol",
  );
  assert.equal(await refused(fake.page.takeHeapSnapshot("page.heapsnapshot")), "Protocol");
  assert.equal(
    await refused(
      fake.page.enableDeviceEmulation({
        screenPosition: "mobile",
        screenSize: { width: -1, height: 1 },
        viewPosition: { x: 0, y: 0 },
        deviceScaleFactor: 0,
        viewSize: { width: 1, height: 1 },
        scale: 1,
      }),
    ),
    "Protocol",
  );
  // @ts-expect-error not a worker kind
  assert.equal(await refused(fake.page.inspectWorker("dedicated")), "Protocol");
  assert.deepEqual(fake.calls, []);
});
