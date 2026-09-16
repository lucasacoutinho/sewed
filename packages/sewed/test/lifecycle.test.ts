import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, Deferred, Effect, Fiber, Schema, Stream } from "effect";
import * as CloseGate from "../lib/internal/CloseGate.js";
import * as Decision from "../lib/Decision.js";
import * as Registry from "../lib/internal/DecisionRegistry.js";
import * as AppRuntime from "../lib/internal/AppRuntime.js";
import { main } from "../lib/Testing.js";

const Close = Decision.decidable({
  key: "test/close-gate",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "deny"]),
  fallback: "deny",
  timing: "async",
  composition: "first",
});

test("close gates resolve through the registry, coalescing concurrent requests into one resolution, and approve only on the approving answer", async () => {
  class Permission extends Context.Service<Permission, { readonly allowed: boolean }>()(
    "test/ClosePermission",
  ) {}
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let approved = 0;
        let calls = 0;
        const started = yield* Deferred.make();
        const answer = yield* Deferred.make();
        const registry = Registry.make();
        const decide = Registry.decide(registry, { isClosed: () => false });
        yield* decide(
          Close,
          Decision.async(() =>
            Effect.gen(function* () {
              const permission = yield* Permission;
              calls++;
              yield* Deferred.succeed(started, undefined);
              const value = yield* Deferred.await(answer);
              return permission.allowed ? value : "deny";
            }),
          ),
        ).pipe(Effect.provideService(Permission, { allowed: true }), Effect.provide(main));
        const gate = CloseGate.make(
          () => {
            approved++;
          },
          registry,
          Close,
          {},
          "allow",
        );
        // Two synchronous requests before the decider even runs: only one resolution starts.
        gate.request();
        gate.request();
        yield* Deferred.await(started);
        assert.equal(calls, 1);
        assert.equal(approved, 0);
        yield* Deferred.succeed(answer, "allow");
        yield* Effect.sleep(5);
        assert.equal(approved, 1);
      }),
    ),
  );
});

test("close gates deny without approving, and a request after close does not resolve or approve", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let approved = 0;
        const registry = Registry.make();
        registry.install(
          Close,
          Decision.async(() => Effect.succeed("deny")),
        );
        const gate = CloseGate.make(
          () => {
            approved++;
          },
          registry,
          Close,
          {},
          "allow",
        );
        gate.request();
        yield* Effect.sleep(5);
        assert.equal(approved, 0);
        yield* gate.close();
        gate.request();
        yield* Effect.sleep(5);
        assert.equal(approved, 0);
      }),
    ),
  );
});

test("close gates interrupt a pending resolution on close, before it can approve", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        // "resolved" is set by the decider itself, after its sleep, with no dependency on the gate's
        // own "closed" flag — the property under test is that close() kills the fiber mid-sleep, not
        // merely that a later closed check would have refused to approve. A version of this test that
        // instead watched "approved" could not tell interruption apart from a non-interrupting close(),
        // because CloseGate's own resolution continuation also checks "closed" before approving.
        let resolved = false;
        const started = yield* Deferred.make();
        const registry = Registry.make();
        registry.install(
          Close,
          Decision.async(() =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Effect.sleep(20);
              resolved = true;
              return "allow";
            }),
          ),
        );
        const gate = CloseGate.make(() => {}, registry, Close, {}, "allow");
        gate.request();
        yield* Deferred.await(started);
        yield* gate.close();
        yield* Effect.sleep(30);
        assert.equal(resolved, false);
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
