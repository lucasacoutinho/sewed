import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, Deferred, Effect, Exit, Fiber, Scope, Stream } from "effect";
import * as CloseGate from "../lib/internal/CloseGate.js";
import * as AppRuntime from "../lib/internal/AppRuntime.js";

test("close guards coalesce requests and preserve captured services until the decision", async () => {
  class Permission extends Context.Service<Permission, { readonly allowed: boolean }>()(
    "test/ClosePermission",
  ) {}
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let approved = 0;
        let decisions = 0;
        let finalized = false;
        const started = yield* Deferred.make<void>();
        const decision = yield* Deferred.make<boolean>();
        const gate = CloseGate.make(() => {
          approved++;
        });
        yield* gate
          .guard(
            Effect.gen(function* () {
              const permission = yield* Permission;
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  finalized = true;
                }),
              );
              decisions++;
              yield* Deferred.succeed(started, undefined);
              return (yield* Deferred.await(decision)) && permission.allowed;
            }),
          )
          .pipe(Effect.provideService(Permission, { allowed: true }));
        gate.request();
        gate.request();
        yield* Deferred.await(started);
        assert.equal(decisions, 1);
        assert.equal(approved, 0);
        yield* Deferred.succeed(decision, true);
        yield* Effect.sleep(5);
        assert.equal(approved, 1);
        assert.equal(finalized, true);
        yield* gate.close();
      }),
    ),
  );
});

test("denial and guard replacement do not admit an old pending request", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let approved = 0;
        let finalized = false;
        const gate = CloseGate.make(() => {
          approved++;
        });
        const scope = yield* Scope.make();
        const started = yield* Deferred.make<void>();
        yield* gate
          .guard(
            Effect.gen(function* () {
              yield* Effect.addFinalizer(() =>
                Effect.sleep(10).pipe(
                  Effect.andThen(
                    Effect.sync(() => {
                      finalized = true;
                    }),
                  ),
                ),
              );
              yield* Deferred.succeed(started, undefined);
              return yield* Effect.never;
            }),
          )
          .pipe(Scope.provide(scope));
        gate.request();
        yield* Deferred.await(started);
        const duplicate = yield* gate.guard(Effect.succeed(true)).pipe(Effect.flip);
        assert.equal(duplicate.code, "Limit");
        yield* Scope.close(scope, Exit.void);
        assert.equal(finalized, true);
        assert.equal(approved, 0);
        yield* gate.guard(Effect.succeed(false));
        gate.request();
        yield* Effect.sleep(5);
        assert.equal(approved, 0);
        yield* gate.close();
        const closed = yield* gate.guard(Effect.succeed(true)).pipe(Effect.flip);
        assert.equal(closed.code, "Closed");
      }),
    ),
  );
});

test("launch requests retain early delivery, have one consumer, and survive observer interruption", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = AppRuntime.make(() => {});
        owner.offer({ kind: "url", url: "sewed://early" });
        const first = yield* owner.launches.pipe(Stream.take(1), Stream.runCollect);
        assert.deepEqual(first, [{ kind: "url", url: "sewed://early" }]);
        const observing = yield* Deferred.make<void>();
        const stream = yield* owner.launches.pipe(
          Stream.tap(() => Deferred.succeed(observing, undefined)),
          Stream.runDrain,
          Effect.forkScoped,
        );
        owner.offer({ kind: "file", path: "/tmp/first" });
        yield* Deferred.await(observing);
        const duplicate = yield* owner.launches.pipe(Stream.runDrain, Effect.flip);
        assert.equal(duplicate.code, "Limit");
        yield* Fiber.interrupt(stream);
        owner.offer({ kind: "file", path: "/tmp/second" });
        const second = yield* owner.launches.pipe(Stream.take(1), Stream.runCollect);
        assert.deepEqual(second, [{ kind: "file", path: "/tmp/second" }]);
        yield* owner.close();
        const closed = yield* owner.launches.pipe(Stream.runDrain, Effect.flip);
        assert.equal(closed.code, "Closed");
      }),
    ),
  );
});

test("launch queues report overflow and malformed native input explicitly", async () => {
  const owner = AppRuntime.make(() => {});
  for (let index = 0; index < 129; index++) owner.offer({ kind: "url", url: `sewed://${index}` });
  const overflow = await Effect.runPromise(owner.launches.pipe(Stream.runDrain, Effect.flip));
  assert.equal(overflow.code, "Limit");
  await Effect.runPromise(owner.close());
  const invalid = AppRuntime.make(() => {});
  invalid.offer({ kind: "file", path: 12 });
  const failure = await Effect.runPromise(invalid.launches.pipe(Stream.runDrain, Effect.flip));
  assert.equal(failure.code, "Protocol");
  await Effect.runPromise(invalid.close());
});
