import assert from "node:assert/strict";
import { test } from "node:test";
import { threadId } from "node:worker_threads";
import { Cause, Deferred, Effect, Fiber, Stream } from "effect";
import { Binding, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import { Clock } from "../dist/shared/bindings.js";
import { ClockProtocol } from "../dist/shared/contracts.js";
import { attempt } from "../src/shared/attempt.ts";
import { Documents, Encoding, Rejected, RecoveryProtocol } from "./recovery-protocol.ts";

const recoveryEntry = Testing.Worker.entry(
  new URL("./recovery-worker.mjs", import.meta.url),
  RecoveryProtocol,
  { bindings: [] },
);

/** @type {Effect.Effect<(typeof Encoding)["Service"]>} */
const encoding = Effect.gen(function* () {
  const entered = yield* Deferred.make();
  const release = yield* Deferred.make();
  const finalized = yield* Deferred.make();
  return { entered, release, finalized };
});

test("the application guide runs its clock in an actual scoped worker", async () => {
  const owner = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Testing.Worker.spawn(
          Testing.Worker.entry(new URL("../dist/worker/clock.js", import.meta.url), ClockProtocol, {
            bindings: [],
          }),
        );
        yield* Effect.gen(function* () {
          const clock = yield* Clock();
          const nativeThread = yield* clock.thread();
          assert.ok(nativeThread > 0);
          assert.notEqual(nativeThread, threadId);
          const ticks = yield* Stream.runCollect(clock.ticks().pipe(Stream.take(3)));
          const [first, second, third] = ticks;
          assert.ok(first !== undefined && second !== undefined && third !== undefined);
          assert.equal(second, first + 1);
          assert.equal(third, second + 1);
        }).pipe(Effect.provide(Binding.layer([Binding.to(Clock, owner)])));
        return owner;
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(await Effect.runPromise(owner.awaitExit.pipe(Effect.provide(Testing.main))), 0);
});

test("uncertain delivery does not replay a mutation that already committed", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gates = yield* encoding;
        const owner = yield* Testing.Worker.spawn(recoveryEntry);
        yield* Effect.gen(function* () {
          const documents = yield* Documents();
          const pending = yield* attempt(documents.save({ value: "hold-after-save" })).pipe(
            Effect.forkScoped,
          );
          assert.equal(yield* documents.committed(), 1);
          assert.equal(yield* documents.count(), 1);
          yield* owner.shutdown;
          assert.equal(yield* owner.awaitExit, 0);
          const outcome = yield* Fiber.join(pending);
          assert.equal(outcome.status, "uncertain");
          if (outcome.status === "uncertain") {
            assert.equal(outcome.error.code, "Unknown");
            assert.equal(outcome.error.reason, "transport/lost-after-send");
          }
        }).pipe(
          Effect.provideService(Encoding, gates),
          Effect.provide(Binding.layer([Binding.to(Documents, owner)])),
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("owner exit finalizes suspended caller encoding without fabricating a delivery guarantee", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gates = yield* encoding;
        const owner = yield* Testing.Worker.spawn(recoveryEntry);
        yield* Effect.gen(function* () {
          const documents = yield* Documents();
          const pending = yield* attempt(documents.save({ value: "hold-encode" })).pipe(
            Effect.forkScoped,
          );
          yield* Deferred.await(gates.entered);
          assert.equal(yield* documents.count(), 0);
          yield* owner.shutdown;
          assert.equal(yield* owner.awaitExit, 0);
          const error = yield* Effect.flip(Fiber.join(pending));
          assert.ok(error instanceof SewedError);
          assert.equal(error.code, "Closed");
          assert.equal(error.reason, undefined);
          yield* Deferred.await(gates.finalized);
        }).pipe(
          Effect.provideService(Encoding, gates),
          Effect.provide(Binding.layer([Binding.to(Documents, owner)])),
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("a domain refusal remains typed and leaves the owner usable", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gates = yield* encoding;
        const owner = yield* Testing.Worker.spawn(recoveryEntry);
        yield* Effect.gen(function* () {
          const documents = yield* Documents();
          const error = yield* Effect.flip(attempt(documents.save({ value: "reject" })));
          assert.ok(error instanceof Rejected);
          assert.equal(yield* documents.count(), 0);
          const outcome = yield* attempt(documents.save({ value: "accepted" }));
          assert.deepEqual(outcome, { status: "success", value: 1 });
          assert.equal(yield* documents.count(), 1);
        }).pipe(
          Effect.provideService(Encoding, gates),
          Effect.provide(Binding.layer([Binding.to(Documents, owner)])),
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("Closed without a transport guarantee cannot hide a committed side effect", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gates = yield* encoding;
        const owner = yield* Testing.Worker.spawn(recoveryEntry);
        yield* Effect.gen(function* () {
          const documents = yield* Documents();
          const error = yield* Effect.flip(attempt(documents.save({ value: "closed-after-save" })));
          assert.ok(error instanceof SewedError);
          assert.equal(error.code, "Closed");
          assert.equal(error.reason, undefined);
          assert.equal(yield* documents.count(), 1);
        }).pipe(
          Effect.provideService(Encoding, gates),
          Effect.provide(Binding.layer([Binding.to(Documents, owner)])),
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("recovery preserves interruption and waits for scoped cleanup", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make();
        let acquired = 0;
        let released = 0;
        const pending = yield* attempt(
          Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.acquireRelease(
                Effect.sync(() => acquired++),
                () => Effect.sync(() => released++),
              );
              yield* Deferred.succeed(entered, undefined);
              return yield* Effect.never;
            }),
          ),
        ).pipe(Effect.forkScoped);
        yield* Deferred.await(entered);
        yield* Fiber.interrupt(pending);
        const exit = yield* Fiber.await(pending);
        assert.equal(exit._tag, "Failure");
        if (exit._tag === "Failure") assert.ok(Cause.hasInterrupts(exit.cause));
        assert.equal(acquired, 1);
        assert.equal(released, 1);
      }),
    ),
  );
});

test("recovery does not turn a defect into a delivery outcome", async () => {
  const defect = new Error("unrecoverable");
  let acquired = 0;
  let released = 0;
  const exit = await Effect.runPromiseExit(
    attempt(
      Effect.scoped(
        Effect.gen(function* () {
          yield* Effect.acquireRelease(
            Effect.sync(() => acquired++),
            () => Effect.sync(() => released++),
          );
          return yield* Effect.die(defect);
        }),
      ),
    ),
  );
  assert.equal(exit._tag, "Failure");
  if (exit._tag === "Failure") {
    const observed = await Effect.runPromise(
      Effect.failCause(exit.cause).pipe(Effect.catchDefect(Effect.succeed)),
    );
    assert.equal(observed, defect);
  }
  assert.equal(acquired, 1);
  assert.equal(released, 1);
});
