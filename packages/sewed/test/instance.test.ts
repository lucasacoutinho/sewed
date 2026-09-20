import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Exit, Fiber, Scope, Stream } from "effect";
import * as Instance from "../src/internal/Instance.ts";

type Listener = Parameters<Instance.Native["on"]>[1];

/** A structural stand-in for the slice of Electron's `app` the claim uses. */
const fakeNative = (primary: boolean) => {
  const calls: string[] = [];
  const listeners = new Set<Listener>();
  let requested: unknown;
  const native: Instance.Native = {
    requestSingleInstanceLock(data) {
      requested = data;
      calls.push("request");
      return primary;
    },
    releaseSingleInstanceLock() {
      calls.push("release");
    },
    on(_event, listener) {
      listeners.add(listener);
      calls.push("on");
    },
    off(_event, listener) {
      listeners.delete(listener);
      calls.push("off");
    },
  };
  return {
    native,
    calls,
    requested: () => requested,
    listeners,
    emit: (argv: string[], workingDirectory: string, additionalData: unknown) => {
      for (const listener of listeners) listener(undefined, argv, workingDirectory, additionalData);
    },
  };
};

test("a primary claim requests the lock with its decoded data and listens for second instances", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* instances.claim({ data: { source: "desktop" } });
        assert.deepEqual(fake.requested(), { source: "desktop" });
        assert.deepEqual(fake.calls, ["request", "on"]);
      }),
    ),
  );
  assert.deepEqual(fake.calls, ["request", "on", "off", "release"]);
  assert.equal(fake.listeners.size, 0);
});

test("a secondary claim fails SecondaryInstance after the lock call forwarded its arguments, and holds nothing", async () => {
  const fake = fakeNative(false);
  const instances = Instance.make(fake.native);
  const exit = await Effect.runPromiseExit(Effect.scoped(instances.claim({ data: { a: 1 } })));
  assert.ok(Exit.isFailure(exit));
  const error = await Effect.runPromise(Effect.flip(Effect.scoped(instances.claim())));
  assert.equal(error._tag, "SecondaryInstance");
  assert.deepEqual(fake.calls, ["request", "request"]);
  assert.equal(fake.listeners.size, 0);
});

test("later launches reach the stream with null for absent data, and are retained before a consumer exists", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const instance = yield* instances.claim();
        fake.emit(["app", "--open=1"], "/work", { token: "t" });
        fake.emit(["app"], "/work", undefined);
        const launches = yield* instance.launches.pipe(Stream.take(2), Stream.runCollect);
        assert.deepEqual(launches, [
          {
            arguments: ["app", "--open=1"],
            workingDirectory: "/work",
            additionalData: { token: "t" },
          },
          { arguments: ["app"], workingDirectory: "/work", additionalData: null },
        ]);
      }),
    ),
  );
});

test("the stream has one consumer at a time, and fails Closed once the claim's scope closes", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  const scope = await Effect.runPromise(Scope.make());
  const instance = await Effect.runPromise(
    instances.claim().pipe(Effect.provideService(Scope.Scope, scope)),
  );
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const observing = yield* Deferred.make<void>();
        const first = yield* instance.launches.pipe(
          Stream.tap(() => Deferred.succeed(observing, undefined)),
          Stream.runDrain,
          Effect.forkScoped,
        );
        fake.emit(["app"], "/work", null);
        yield* Deferred.await(observing);
        const duplicate = yield* instance.launches.pipe(Stream.runDrain, Effect.flip);
        assert.equal(duplicate.code, "Limit");
        yield* Fiber.interrupt(first);
      }),
    ),
  );
  await Effect.runPromise(Scope.close(scope, Exit.void));
  const closed = await Effect.runPromise(instance.launches.pipe(Stream.runDrain, Effect.flip));
  assert.equal(closed.code, "Closed");
  assert.deepEqual(fake.calls, ["request", "on", "off", "release"]);
});

test("a second concurrent claim fails Limit; a claim after release succeeds", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* instances.claim();
        const second = yield* Effect.flip(Effect.scoped(instances.claim()));
        assert.equal(second._tag, "SewedError");
        if (second._tag === "SewedError") assert.equal(second.code, "Limit");
      }),
    ),
  );
  await Effect.runPromise(Effect.scoped(instances.claim()));
  assert.deepEqual(fake.calls, [
    "request",
    "on",
    "off",
    "release",
    "request",
    "on",
    "off",
    "release",
  ]);
});

test("invalid data fails Protocol before the lock is requested, and a native throw fails Native", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  const invalid = await Effect.runPromise(
    Effect.flip(Effect.scoped(instances.claim({ data: { callback: () => {} } as never }))),
  );
  assert.equal(invalid._tag, "SewedError");
  if (invalid._tag === "SewedError") assert.equal(invalid.code, "Protocol");
  assert.deepEqual(fake.calls, []);
  const throwing = Instance.make({
    ...fake.native,
    requestSingleInstanceLock() {
      throw new Error("no lock");
    },
  });
  const failure = await Effect.runPromise(Effect.flip(Effect.scoped(throwing.claim())));
  assert.equal(failure._tag, "SewedError");
  if (failure._tag === "SewedError") assert.equal(failure.code, "Native");
});

test("a native that cannot observe second instances releases the lock, and the instance remains claimable", async () => {
  const calls: string[] = [];
  const listeners = new Set<Listener>();
  let onAttempts = 0;
  const native: Instance.Native = {
    requestSingleInstanceLock() {
      calls.push("request");
      return true;
    },
    releaseSingleInstanceLock() {
      calls.push("release");
    },
    on(_event, listener) {
      onAttempts++;
      calls.push("on");
      if (onAttempts === 1) throw new Error("cannot observe second instances");
      listeners.add(listener);
    },
    off(_event, listener) {
      listeners.delete(listener);
      calls.push("off");
    },
  };
  const instances = Instance.make(native);
  const failure = await Effect.runPromise(Effect.flip(Effect.scoped(instances.claim())));
  assert.equal(failure._tag, "SewedError");
  if (failure._tag === "SewedError") assert.equal(failure.code, "Native");
  assert.deepEqual(calls, ["request", "on", "release"]);
  assert.equal(listeners.size, 0);
  // held was reset on the failed acquire, so a later claim on the same Instance.make succeeds.
  await Effect.runPromise(Effect.scoped(instances.claim()));
  assert.deepEqual(calls, ["request", "on", "release", "request", "on", "off", "release"]);
  assert.equal(listeners.size, 0);
});

test("a native that cannot stop observing second instances still releases the lock, as the finalizer's own defect", async () => {
  const calls: string[] = [];
  const listeners = new Set<Listener>();
  const native: Instance.Native = {
    requestSingleInstanceLock() {
      calls.push("request");
      return true;
    },
    releaseSingleInstanceLock() {
      calls.push("release");
    },
    on(_event, listener) {
      listeners.add(listener);
      calls.push("on");
    },
    off(_event, listener) {
      listeners.delete(listener);
      calls.push("off");
      throw new Error("cannot stop observing second instances");
    },
  };
  const instances = Instance.make(native);
  const first = await Effect.runPromiseExit(Effect.scoped(instances.claim()));
  assert.ok(Exit.isFailure(first));
  assert.ok(Exit.hasDies(first), "a broken off() must surface as the finalizer's own defect");
  assert.deepEqual(calls, ["request", "on", "off", "release"]);
  assert.equal(listeners.size, 0);
  // held was reset despite the throw, so a later claim's acquire succeeds; its own release dies
  // the same way, which is why this is read through runPromiseExit rather than runPromise.
  const second = await Effect.runPromiseExit(Effect.scoped(instances.claim()));
  assert.ok(Exit.isFailure(second));
  assert.ok(Exit.hasDies(second));
  assert.equal(Exit.hasFails(second), false, "the acquire itself must not fail with Limit");
  assert.deepEqual(calls, ["request", "on", "off", "release", "request", "on", "off", "release"]);
  assert.equal(listeners.size, 0);
});

test("a launch over 256 KiB fails the consumer with Limit after earlier launches drain", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const instance = yield* instances.claim();
        fake.emit(["app"], "/work", null);
        fake.emit(["app"], "/work", { blob: "x".repeat(262144) });
        const collected: unknown[] = [];
        const error = yield* instance.launches.pipe(
          Stream.runForEach((launch) => Effect.sync(() => collected.push(launch))),
          Effect.flip,
        );
        assert.equal(collected.length, 1);
        assert.equal(error.code, "Limit");
      }),
    ),
  );
});
