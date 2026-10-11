import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents as NativeContents } from "electron";
import { Deferred, Effect, Fiber, Stream } from "effect";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as ContentsFrames from "../src/internal/ContentsFrames.ts";

type Sink = (image: unknown, dirty: unknown) => void;
/** A native image with one representation at `scale`; sizes are reported per scale factor. */
const image = (width: number, height: number, scale = 1) => ({
  getScaleFactors: () => [scale],
  getSize: (factor = 1) => ({ width: width * factor, height: height * factor }),
  toBitmap: (options: { scaleFactor?: number } = {}) => {
    const factor = options.scaleFactor ?? 1;
    return Buffer.alloc(width * factor * height * factor * 4, 7);
  },
});
const dirty = { x: 0, y: 0, width: 2, height: 1 };

/** A structural web contents with Electron's single frame subscription slot. */
const fakeContents = (offscreen: boolean) => {
  const calls: unknown[][] = [];
  let subscription: Sink | undefined;
  const emitter = Object.assign(new EventEmitter(), {
    isOffscreen: () => offscreen,
    isDestroyed: () => false,
    isPainting: () => true,
    getFrameRate: () => 60,
    startPainting: () => calls.push(["startPainting"]),
    stopPainting: () => calls.push(["stopPainting"]),
    setFrameRate: (rate: number) => calls.push(["setFrameRate", rate]),
    invalidate: () => calls.push(["invalidate"]),
    beginFrameSubscription: (onlyDirty: boolean, callback: Sink) => {
      calls.push(["begin", onlyDirty]);
      subscription = callback;
    },
    endFrameSubscription: () => {
      calls.push(["end"]);
      subscription = undefined;
    },
  });
  const closed = Deferred.makeUnsafe<void>();
  const frames = ContentsFrames.make(
    // Test-only bridge: the module reads these members structurally.
    emitter as unknown as NativeContents,
    {
      closed,
      isClosed: () => false,
      closedError: () => new SewedError({ code: "Closed", message: "closed" }),
      operation: (run) =>
        Effect.try({
          try: run,
          catch: (cause) => new SewedError({ code: "Native", message: "failed", cause }),
        }),
    },
  );
  return {
    emitter,
    calls,
    frames,
    paint: (...args: [unknown, unknown]) => subscription?.(...args),
  };
};

const run = <A, E>(effect: Effect.Effect<A, E, MainContext>) =>
  Effect.runPromise(Effect.provide(effect, Testing.main));

test("an offscreen page's paints arrive as bitmaps, and the listener goes with the observer", async () => {
  const fake = fakeContents(true);
  const frames = await run(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Stream.runCollect(Stream.take(fake.frames.frames(), 2)),
      );
      while (fake.emitter.listenerCount("paint") === 0) yield* Effect.yieldNow;
      fake.emitter.emit("paint", {}, dirty, image(0, 0));
      fake.emitter.emit("paint", {}, dirty, image(2, 1));
      yield* Effect.yieldNow;
      fake.emitter.emit("paint", {}, dirty, image(2, 1, 2));
      return [...(yield* Fiber.join(fiber))];
    }),
  );
  assert.equal(frames.length, 2, "an empty image is not a frame");
  assert.deepEqual([frames[0]?.bitmap.width, frames[0]?.bitmap.height], [2, 1]);
  assert.equal(frames[0]?.bitmap.bytes.byteLength, 8);
  assert.deepEqual(
    [frames[1]?.bitmap.width, frames[1]?.bitmap.height],
    [4, 2],
    "the densest representation, in pixels",
  );
  assert.deepEqual(frames[0]?.dirty, dirty);
  assert.equal(fake.emitter.listenerCount("paint"), 0);
  assert.deepEqual(fake.calls, [], "an offscreen page needs no frame subscription");
});

test("observers of an ordinary page share one frame subscription, ended with the last", async () => {
  const fake = fakeContents(false);
  await run(
    Effect.gen(function* () {
      const first = yield* Effect.forkChild(
        Stream.runCollect(Stream.take(fake.frames.frames(), 1)),
      );
      const second = yield* Effect.forkChild(
        Stream.runCollect(Stream.take(fake.frames.frames(), 2)),
      );
      while (fake.calls.length === 0) yield* Effect.yieldNow;
      for (let turn = 0; turn < 20; turn++) yield* Effect.yieldNow;
      const mismatched = yield* Effect.flip(
        Stream.runCollect(Stream.take(fake.frames.frames({ onlyDirty: true }), 1)),
      );
      assert.equal(mismatched.code, "Protocol");
      fake.paint(image(1, 1), dirty);
      assert.equal([...(yield* Fiber.join(first))].length, 1);
      assert.deepEqual(fake.calls, [["begin", false]], "still subscribed for the second observer");
      fake.paint(image(1, 1), dirty);
      assert.equal([...(yield* Fiber.join(second))].length, 2);
    }),
  );
  assert.deepEqual(fake.calls, [["begin", false], ["end"]]);
});

test("a slow observer keeps the newest frames instead of failing", async () => {
  const fake = fakeContents(true);
  const widths = await run(
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const fiber = yield* Effect.forkChild(
        fake.frames.frames().pipe(
          Stream.tap(() => Deferred.await(gate)),
          Stream.take(2),
          Stream.runCollect,
        ),
      );
      while (fake.emitter.listenerCount("paint") === 0) yield* Effect.yieldNow;
      for (let width = 1; width <= 300; width++)
        fake.emitter.emit("paint", {}, dirty, image(width, 1));
      yield* Deferred.succeed(gate, undefined);
      return [...(yield* Fiber.join(fiber))].map((frame) => frame.bitmap.width);
    }),
  );
  assert.equal(widths.length, 2);
  assert.equal(widths[1], 300, "the newest frame survives");
});

test("offscreen controls reach the native contents with decoded input", async () => {
  const fake = fakeContents(true);
  assert.deepEqual(await run(fake.frames.painting), {
    offscreen: true,
    painting: true,
    frameRate: 60,
  });
  await run(fake.frames.setPainting(false));
  await run(fake.frames.setPainting(true));
  await run(fake.frames.setFrameRate(30));
  await run(fake.frames.invalidate);
  assert.deepEqual(fake.calls, [
    ["stopPainting"],
    ["startPainting"],
    ["setFrameRate", 30],
    ["invalidate"],
  ]);
  assert.equal((await run(Effect.flip(fake.frames.setFrameRate(0)))).code, "Protocol");
  assert.equal((await run(Effect.flip(fake.frames.setFrameRate(241)))).code, "Protocol");
});
