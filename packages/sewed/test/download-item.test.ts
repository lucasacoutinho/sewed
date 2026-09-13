import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Cause, Effect, Stream } from "effect";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import { adopt } from "../src/internal/DownloadItem.ts";

class FakeItem extends EventEmitter {
  received = 0;
  paused = false;
  state: "progressing" | "completed" | "cancelled" | "interrupted" = "progressing";
  getReceivedBytes = () => this.received;
  getTotalBytes = () => 10;
  getPercentComplete = () => this.received * 10;
  getCurrentBytesPerSecond = () => 1;
  canResume = () => true;
  isPaused = () => this.paused;
  getState = () => this.state;
  pause = () => {
    this.paused = true;
  };
  resume = () => {
    this.paused = false;
  };
  cancel = () => {
    this.state = "cancelled";
    this.emit("done", {}, "cancelled");
  };
}

const run = <A, E>(effect: Effect.Effect<A, E, unknown>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Testing.main)));

test("an adopted item reports progress and its terminal outcome", async () => {
  const item = new FakeItem();
  const handle = adopt(item);
  const first = await run(handle.snapshot);
  assert.equal(first.status, "active");
  item.received = 5;
  item.emit("updated", {}, "progressing");
  const collected = run(handle.progress.pipe(Stream.take(2), Stream.runCollect));
  await new Promise((resolve) => setTimeout(resolve, 10));
  item.received = 10;
  item.state = "completed";
  item.emit("done", {}, "completed");
  const states = [...(await collected)];
  assert.deepEqual(
    states.map((state) => state.status),
    ["active", "terminal"],
  );
  assert.equal(states[0]?.receivedBytes, 5);
  assert.deepEqual(await run(handle.awaitDone), { kind: "completed" });
  assert.equal(item.listenerCount("updated"), 0);
});

test("cancel ends an adopted item and later operations fail Closed", async () => {
  const item = new FakeItem();
  const handle = adopt(item);
  await run(handle.cancel);
  assert.deepEqual(await run(handle.awaitDone), { kind: "cancelled" });
  const exit = await Effect.runPromiseExit(handle.pause.pipe(Effect.provide(Testing.main)));
  assert.equal(exit._tag, "Failure");
  if (exit._tag === "Failure") {
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof SewedError);
    assert.equal(error.code, "Closed");
  }
  const late = [...(await run(handle.progress.pipe(Stream.runCollect)))];
  assert.deepEqual(
    late.map((state) => state.status),
    ["terminal"],
  );
});

test("pause and resume drive the item and publish its paused flag", async () => {
  const item = new FakeItem();
  const handle = adopt(item);
  await run(handle.pause);
  assert.equal((await run(handle.snapshot)).paused, true);
  await run(handle.resume);
  assert.equal((await run(handle.snapshot)).paused, false);
});
