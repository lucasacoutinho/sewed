import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents as NativeContents } from "electron";
import { Deferred, Effect, Fiber, Schema, Stream } from "effect";
import { Menu } from "sewed";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as ContentsIpc from "../src/internal/ContentsIpc.ts";
import * as Declarations from "../src/internal/Declarations.ts";

const fakeContents = () => {
  const sent: unknown[][] = [];
  const emitter = Object.assign(new EventEmitter(), {
    send: (...args: unknown[]) => sent.push(["send", ...args]),
    sendToFrame: (...args: unknown[]) => sent.push(["sendToFrame", ...args]),
  });
  const { ipc } = ContentsIpc.make(
    // Test-only bridge: the module reads these members structurally.
    emitter as unknown as NativeContents,
    {
      closed: Deferred.makeUnsafe<void>(),
      isClosed: () => false,
      closedError: () => new SewedError({ code: "Closed", message: "closed" }),
      operation: (run) =>
        Effect.try({
          try: run,
          catch: (cause) => new SewedError({ code: "Native", message: "failed", cause }),
        }),
    },
  );
  return { emitter, sent, ipc };
};
const event = (frameId: number, main: boolean) => ({
  processId: 4,
  frameId,
  senderFrame: { parent: main ? null : {} },
  returnValue: undefined as unknown,
});
const run = <A, E>(effect: Effect.Effect<A, E, MainContext>) =>
  Effect.runPromise(Effect.provide(effect, Testing.main));

test("raw IPC messages arrive as JSON with the frame that sent them", async () => {
  const fake = fakeContents();
  const messages = await run(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.take(fake.ipc.messages, 2)));
      while (fake.emitter.listenerCount("ipc-message") === 0) yield* Effect.yieldNow;
      fake.emitter.emit("ipc-message", event(1, true), "ping", { n: 1 }, "text");
      fake.emitter.emit("ipc-message", event(7, false), "odd", () => {}, 2);
      return [...(yield* Fiber.join(fiber))];
    }),
  );
  assert.deepEqual(messages, [
    {
      channel: "ping",
      args: [{ n: 1 }, "text"],
      frame: { processId: 4, routingId: 1, isMainFrame: true },
    },
    { channel: "odd", args: [null, 2], frame: { processId: 4, routingId: 7, isMainFrame: false } },
  ]);
  assert.equal(fake.emitter.listenerCount("ipc-message"), 0);
});

test("sending decodes the channel and arguments, to the main frame or to one frame", async () => {
  const fake = fakeContents();
  await run(fake.ipc.send("pong", { ok: true }));
  await run(fake.ipc.sendToFrame({ processId: 4, routingId: 7 }, "pong", 1));
  assert.deepEqual(fake.sent, [
    ["send", "pong", { ok: true }],
    ["sendToFrame", [4, 7], "pong", 1],
  ]);
  assert.equal((await run(Effect.flip(fake.ipc.send("")))).code, "Protocol");
});

test("a synchronous answer is installed for a scope and answers null when it throws", async () => {
  const fake = fakeContents();
  await run(
    Effect.scoped(
      Effect.gen(function* () {
        yield* fake.ipc.answerSync((message) => {
          if (message.channel === "boom") throw new Error("boom");
          return { echo: message.args[0] ?? null };
        });
        const asked = event(1, true);
        fake.emitter.emit("ipc-message-sync", asked, "ask", "hello");
        assert.deepEqual(asked.returnValue, { echo: "hello" });
        const failed = event(1, true);
        fake.emitter.emit("ipc-message-sync", failed, "boom");
        assert.equal(failed.returnValue, null);
      }),
    ),
  );
  assert.equal(fake.emitter.listenerCount("ipc-message-sync"), 0);
});

test("a launch step is registered before readiness, and a menu item update keeps its closed set", () => {
  let registered: (() => void) | undefined;
  const native: Declarations.LaunchNative = {
    once: (_event, listener) => {
      registered = listener;
    },
  };
  let ran = 0;
  assert.equal(
    Declarations.apply([Declarations.willFinishLaunching(native, () => ran++)], {
      isReady: () => false,
    }),
    undefined,
  );
  registered?.();
  assert.equal(ran, 1);
  const update = Schema.decodeUnknownExit(Menu.ItemUpdate);
  assert.equal(update({ enabled: false, checked: true })._tag, "Success");
  assert.equal(update({ label: "" })._tag, "Failure");
});
