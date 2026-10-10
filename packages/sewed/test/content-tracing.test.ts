import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Exit, Fiber, Scope } from "effect";
import { SewedError } from "../src/SewedError.ts";
import * as TracingRecording from "../src/internal/TracingRecording.ts";

const deferred = <A>() => {
  let complete: (value: A | PromiseLike<A>) => void = () => {};
  const promise = new Promise<A>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: (value: A) => complete(value) };
};

const fakeNative = (
  options: {
    readonly start?: (value: TracingRecording.NativeOptions) => Promise<void>;
    readonly stop?: (file: string) => Promise<string>;
  } = {},
) => {
  const starts: TracingRecording.NativeOptions[] = [];
  const stops: string[] = [];
  return {
    starts,
    stops,
    native: {
      startRecording: (value: TracingRecording.NativeOptions) => {
        starts.push(value);
        return options.start === undefined ? Promise.resolve() : options.start(value);
      },
      stopRecording: (file?: string) => {
        const resultFile = file ?? "";
        stops.push(resultFile);
        return options.stop === undefined ? Promise.resolve(resultFile) : options.stop(resultFile);
      },
    },
  };
};

test("a pending trace reserves the process recorder and startup failure releases it", async () => {
  const startGate = deferred<void>();
  const started = deferred<void>();
  let failFirstStart = true;
  const fake = fakeNative({
    start: () => {
      if (failFirstStart) {
        failFirstStart = false;
        throw new Error("start failed");
      }
      started.resolve(undefined);
      return startGate.promise;
    },
  });
  const recorder = TracingRecording.make(fake.native);

  const failedStart = await Effect.runPromise(
    Effect.flip(Effect.scoped(recorder.record("/tmp/failed-trace.json", {}))),
  );
  assert.equal(failedStart.code, "Native");
  assert.equal(fake.stops.length, 0);

  const pending = Effect.runPromise(Effect.scoped(recorder.record("/tmp/pending-trace.json", {})));
  await started.promise;
  const duplicate = await Effect.runPromise(
    Effect.flip(Effect.scoped(recorder.record("/tmp/duplicate-trace.json", {}))),
  );
  assert.equal(duplicate.code, "Limit");
  assert.equal(fake.starts.length, 2);

  startGate.resolve(undefined);
  await pending;
  await Effect.runPromise(Effect.scoped(recorder.record("/tmp/reacquired-trace.json", {})));
  assert.equal(fake.starts.length, 3);
  assert.deepEqual(fake.stops, ["/tmp/pending-trace.json", "/tmp/reacquired-trace.json"]);
});

test("interruption during start closes the acquired trace and releases the recorder", async () => {
  const startGate = deferred<void>();
  const started = deferred<void>();
  const fake = fakeNative({
    start: () => {
      started.resolve(undefined);
      return startGate.promise;
    },
  });
  const recorder = TracingRecording.make(fake.native);
  const fiber = Effect.runFork(Effect.scoped(recorder.record("/tmp/interrupted-trace.json", {})));
  await started.promise;

  const interruption = Effect.runPromise(Fiber.interrupt(fiber));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(fake.stops, []);

  startGate.resolve(undefined);
  await interruption;
  const exit = await Effect.runPromise(Fiber.await(fiber));
  assert.equal(Exit.isFailure(exit), true);
  assert.deepEqual(fake.stops, ["/tmp/interrupted-trace.json"]);

  await Effect.runPromise(Effect.scoped(recorder.record("/tmp/after-interruption.json", {})));
  assert.deepEqual(fake.stops, ["/tmp/interrupted-trace.json", "/tmp/after-interruption.json"]);
});

test("scope close shares an explicit stop and keeps the recorder reserved until it settles", async () => {
  const stopGate = deferred<string>();
  const stopping = deferred<void>();
  const fake = fakeNative({
    stop: (file) => {
      stopping.resolve(undefined);
      return stopGate.promise.then(() => file);
    },
  });
  const recorder = TracingRecording.make(fake.native);
  const scope = Scope.makeUnsafe();
  const handle = await Effect.runPromise(
    recorder
      .record("/tmp/shared-stop-trace.json", {})
      .pipe(Effect.provideService(Scope.Scope, scope)),
  );

  const explicitStop = Effect.runPromise(handle.stop);
  await stopping.promise;
  const secondStop = await Effect.runPromise(Effect.flip(handle.stop));
  assert.equal(secondStop.code, "Closed");

  let closed = false;
  const closing = Effect.runPromise(Scope.close(scope, Exit.void)).then(() => {
    closed = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(closed, false);

  const duplicate = await Effect.runPromise(
    Effect.flip(Effect.scoped(recorder.record("/tmp/during-stop-trace.json", {}))),
  );
  assert.equal(duplicate.code, "Limit");
  assert.equal(fake.stops.length, 1);

  stopGate.resolve("/tmp/shared-stop-trace.json");
  assert.equal(await explicitStop, "/tmp/shared-stop-trace.json");
  await closing;
  await Effect.runPromise(Effect.scoped(recorder.record("/tmp/after-stop-trace.json", {})));
  assert.deepEqual(fake.stops, ["/tmp/shared-stop-trace.json", "/tmp/after-stop-trace.json"]);
});

test("a failed native stop is typed and releases the recorder for another trace", async () => {
  let failFirstStop = true;
  const fake = fakeNative({
    stop: (file) => {
      if (failFirstStop) {
        failFirstStop = false;
        return Promise.reject(new Error("stop failed"));
      }
      return Promise.resolve(file);
    },
  });
  const recorder = TracingRecording.make(fake.native);
  const scope = Scope.makeUnsafe();
  const handle = await Effect.runPromise(
    recorder
      .record("/tmp/failed-stop-trace.json", {})
      .pipe(Effect.provideService(Scope.Scope, scope)),
  );

  const failedStop = await Effect.runPromise(Effect.flip(handle.stop));
  assert.equal(failedStop.code, "Native");
  assert.equal(failedStop.message, "Could not stop tracing");
  const cleanup = await Effect.runPromiseExit(Scope.close(scope, Exit.void));
  assert.ok(Exit.isFailure(cleanup));
  const cleanupError = Cause.squash(cleanup.cause);
  assert.ok(cleanupError instanceof SewedError && cleanupError.code === "Native");

  await Effect.runPromise(Effect.scoped(recorder.record("/tmp/after-failed-stop.json", {})));
  assert.equal(fake.starts.length, 2);
  assert.deepEqual(fake.stops, ["/tmp/failed-stop-trace.json", "/tmp/after-failed-stop.json"]);
});

test("automatic trace cleanup cannot report success when native stop rejects", async () => {
  const defect = new Error("automatic stop failed");
  const fake = fakeNative({ stop: () => Promise.reject(defect) });
  const recorder = TracingRecording.make(fake.native);
  const result = await Effect.runPromiseExit(
    Effect.scoped(recorder.record("/tmp/failed-cleanup.json", {})),
  );
  assert.ok(Exit.isFailure(result));
  const error = Cause.squash(result.cause);
  assert.ok(error instanceof SewedError && error.code === "Native");
  assert.equal(error.cause, defect);
  assert.equal(fake.stops.length, 1);
});
