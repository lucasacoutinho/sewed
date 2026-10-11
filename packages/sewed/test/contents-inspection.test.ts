import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebContents as NativeContents } from "electron";
import { Effect, Schema } from "effect";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as WebContents from "../src/WebContents.ts";
import * as ContentsInspection from "../src/internal/ContentsInspection.ts";

const frame = (routingId: number, parent: { routingId: number } | null, url: string) => ({
  processId: 9,
  routingId,
  frameTreeNodeId: routingId + 100,
  frameToken: `token-${routingId}`,
  osProcessId: 4242,
  parent,
  url,
  origin: new URL(url).origin,
  name: parent === null ? "" : "child",
  visibilityState: "visible",
});

/** A structural web contents: the module reads these members, and each command records its call. */
const fakeContents = () => {
  const calls: unknown[][] = [];
  const main = {
    ...frame(1, null, "https://example.com/"),
    framesInSubtree: [] as unknown[],
    collectJavaScriptCallStack: () => Promise.resolve("at stalled (app.js:1:1)"),
  };
  const child = frame(2, main, "https://example.com/frame");
  main.framesInSubtree = [main, child];
  const native = {
    mainFrame: main,
    getProcessId: () => 9,
    getAllSharedWorkers: () => [{ id: "w1", url: "https://example.com/worker.js" }],
    inspectSharedWorkerById: (id: string) => calls.push(["inspect", id]),
    getOrCreateDevToolsTargetId: () => "target-1",
    addWorkSpace: (path: string) => calls.push(["add", path]),
    removeWorkSpace: (path: string) => calls.push(["remove", path]),
    getPrintersAsync: () =>
      Promise.resolve([{ name: "p", displayName: "Printer", description: "Laser", options: {} }]),
    getWebRTCIPHandlingPolicy: () => "default",
    getWebRTCUDPPortRange: () => ({ min: 0, max: 0 }),
    setWebRTCIPHandlingPolicy: (policy: string) => calls.push(["policy", policy]),
    setWebRTCUDPPortRange: (range: unknown) => calls.push(["range", range]),
    opener: child,
    focusedFrame: null,
    hostWebContents: null,
    devToolsWebContents: { id: 77 },
    getZoomLevel: () => 1,
    setZoomLevel: (level: number) => calls.push(["zoomLevel", level]),
    getZoomMode: () => "default",
    setZoomMode: (mode: string) => calls.push(["zoomMode", mode]),
    isCaretBrowsingEnabled: () => false,
    setCaretBrowsingEnabled: (enabled: boolean) => calls.push(["caret", enabled]),
  };
  const members = ContentsInspection.make(
    // Test-only bridge: the module reads these members structurally.
    native as unknown as NativeContents,
    {
      operation: (run) =>
        Effect.try({
          try: run,
          catch: (cause) => new SewedError({ code: "Native", message: "failed", cause }),
        }),
      asynchronous: (message, run) =>
        Effect.tryPromise({
          try: run,
          catch: (cause) => new SewedError({ code: "Native", message, cause }),
        }),
    },
  );
  return { calls, members };
};

const run = <A, E>(effect: Effect.Effect<A, E, MainContext>) =>
  Effect.runPromise(Effect.provide(effect, Testing.main));
const refused = async (effect: Effect.Effect<unknown, SewedError, MainContext>) =>
  (await run(Effect.flip(effect))).code;

test("the frame tree is copied out as plain data, the main frame first", async () => {
  const { members } = fakeContents();
  const tree = await run(members.frameTree);
  for (const entry of tree) Schema.decodeSync(WebContents.FrameInfo)(entry);
  assert.deepEqual(
    tree.map((entry) => [entry.routingId, entry.isMainFrame, entry.parent, entry.url]),
    [
      [1, true, null, "https://example.com/"],
      [2, false, 1, "https://example.com/frame"],
    ],
  );
  assert.equal(tree[0]?.token, "token-1");
});

test("inspection reads answer plain data", async () => {
  const { members } = fakeContents();
  assert.equal(await run(members.rendererProcessId), 9);
  assert.deepEqual(await run(members.sharedWorkers), [
    { id: "w1", url: "https://example.com/worker.js" },
  ]);
  assert.equal(await run(members.devToolsTargetId), "target-1");
  assert.deepEqual(await run(members.printers), [
    { name: "p", displayName: "Printer", description: "Laser" },
  ]);
  assert.deepEqual(await run(members.webRtc), {
    ipHandlingPolicy: "default",
    udpPortRange: { min: 0, max: 0 },
  });
  assert.equal(await run(members.caretBrowsing), false);
});

test("inspection commands decode their input before Electron sees it", async () => {
  const { calls, members } = fakeContents();
  await run(members.inspectSharedWorker("w1"));
  await run(members.addDevToolsWorkspace("/src/app"));
  await run(members.removeDevToolsWorkspace("/src/app"));
  await run(members.setWebRtcIpHandlingPolicy("disable_non_proxied_udp"));
  await run(members.setWebRtcUdpPortRange({ min: 10000, max: 10100 }));
  await run(members.setCaretBrowsing(true));
  assert.deepEqual(calls, [
    ["inspect", "w1"],
    ["add", "/src/app"],
    ["remove", "/src/app"],
    ["policy", "disable_non_proxied_udp"],
    ["range", { min: 10000, max: 10100 }],
    ["caret", true],
  ]);
  assert.equal(await refused(members.addDevToolsWorkspace("src/app")), "Protocol");
  assert.equal(await refused(members.inspectSharedWorker("")), "Protocol");
  // @ts-expect-error not a WebRTC policy
  assert.equal(await refused(members.setWebRtcIpHandlingPolicy("off")), "Protocol");
  assert.equal(await refused(members.setWebRtcUdpPortRange({ min: 2, max: 1 })), "Protocol");
  assert.equal(await refused(members.setWebRtcUdpPortRange({ min: 0, max: 70000 })), "Protocol");
  assert.equal(calls.length, 6, "nothing refused reached Electron");
});

test("relations and zoom are read as data and set through decoders", async () => {
  const { calls, members } = fakeContents();
  assert.equal((await run(members.opener))?.routingId, 2);
  assert.equal(await run(members.focusedFrame), null);
  assert.equal(await run(members.hostId), null);
  assert.equal(await run(members.devToolsContentsId), 77);
  assert.equal(await run(members.collectJavaScriptCallStack), "at stalled (app.js:1:1)");
  assert.equal(await run(members.zoomLevel), 1);
  assert.equal(await run(members.zoomMode), "default");
  await run(members.setZoomLevel(-2));
  await run(members.setZoomMode("manual"));
  assert.deepEqual(calls, [
    ["zoomLevel", -2],
    ["zoomMode", "manual"],
  ]);
  assert.equal(await refused(members.setZoomLevel(40)), "Protocol");
  // @ts-expect-error not a zoom mode
  assert.equal(await refused(members.setZoomMode("page")), "Protocol");
});
