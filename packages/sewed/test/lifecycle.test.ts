import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, Deferred, Effect, Fiber, Schema, Stream } from "effect";
import * as CloseGate from "../lib/internal/CloseGate.js";
import * as Decidables from "../lib/Decidables.js";
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
        let calls = 0;
        const registry = Registry.make();
        registry.install(
          Close,
          Decision.async(() => {
            calls++;
            return Effect.succeed("deny");
          }),
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
        assert.equal(calls, 1);
        yield* gate.close();
        // A request after close must not resolve at all, not merely fail to approve — a gate that
        // kept forking fibers here would run a consumer's decider whose installing scope already
        // closed. "calls" is the direct witness of that; "approved" alone cannot tell the two apart,
        // since this decider's own answer ("deny") could never have approved either way.
        gate.request();
        yield* Effect.sleep(5);
        assert.equal(approved, 0);
        assert.equal(calls, 1, "a request after close must not resolve");
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

// Captures the default logger's own console output around one call, rather than providing a Logger
// through Effect.provide: request()'s pipeline runs on a fiber Effect.runFork starts with the default
// runtime, not with whatever context the calling test's own Effect graph carries, so no Effect.provide
// around test code can reach it. Bounded to one test by the finally block; node --test gives each test
// file its own process regardless.
const captureConsole = async (body: () => Promise<void>): Promise<readonly string[]> => {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const record = (...args: readonly unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.log = record;
  console.error = record;
  try {
    await body();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return lines;
};

test("a throwing approve() is logged, not swallowed", async () => {
  const registry = Registry.make();
  registry.install(
    Close,
    Decision.async(() => Effect.succeed("allow")),
  );
  const lines = await captureConsole(async () => {
    const gate = CloseGate.make(
      () => {
        throw new Error("approve boom");
      },
      registry,
      Close,
      {},
      "allow",
    );
    gate.request();
    await Effect.runPromise(Effect.sleep(20));
  });
  const joined = lines.join("\n");
  assert.ok(joined.includes("Close gate failed; request denied"), joined);
  assert.ok(joined.includes("approve boom"), joined);
});

test("closing a gate mid-resolution logs nothing: interruption does not reach the failure report", async () => {
  const registry = Registry.make();
  const started = Effect.runSync(Deferred.make<void>());
  registry.install(
    Close,
    Decision.async(() =>
      Effect.gen(function* () {
        yield* Deferred.succeed(started, undefined);
        return yield* Effect.never;
      }),
    ),
  );
  const lines = await captureConsole(async () => {
    let approved = 0;
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
    await Effect.runPromise(Deferred.await(started));
    await Effect.runPromise(gate.close());
    await Effect.runPromise(Effect.sleep(20));
    assert.equal(approved, 0);
  });
  assert.deepEqual(lines, [], lines.join("\n"));
});

// ADV8, through the real production door: fix round 3's registry fix (resolveSync/resolveAsync now
// pass listFor(decidable) instead of `entries.get(decidable) ?? []`) closes a cold-list variant of the
// same widening probe B pinned. `App.Quit`'s own shape — restrictive, fallback "allow" — is what makes
// this observable through a gate at all: a resolution reaching CloseGate's fallback because a decider
// was missed looks exactly like "nothing is installed", which is indistinguishable from a real
// approval unless the fallback and the installed decider's answer disagree.
const QuitLike = Decision.decidable({
  key: "test/adv8-quit-like",
  event: Schema.Struct({}),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow",
  timing: "async",
  composition: "restrictive",
  order: ["deny", "allow"],
});

test("ADV8: a decider installed immediately after request(), on a decidable that has never had one before, is still consulted", async () => {
  // Warm: this decidable's entry list already exists (something was installed and removed earlier),
  // so the gate's call-time resolveAsync() and the resolution's own lazy read are the same array
  // either way. This half is the control — it must pass regardless of the fix.
  const warmRegistry = Registry.make();
  const removeNoop = warmRegistry.install(
    QuitLike,
    Decision.sync(() => Decision.Pass),
  );
  removeNoop();
  let warmApproved = 0;
  let warmDenyCalls = 0;
  const warmGate = CloseGate.make(
    () => {
      warmApproved++;
    },
    warmRegistry,
    QuitLike,
    {},
    "allow",
  );
  warmGate.request();
  warmRegistry.install(
    QuitLike,
    Decision.async(() => {
      warmDenyCalls += 1;
      return Effect.succeed("deny");
    }),
  );
  await Effect.runPromise(Effect.sleep(20));
  assert.equal(warmDenyCalls, 1, "warm: the installed deny decider must be consulted");
  assert.equal(warmApproved, 0, "warm: a deny decider must keep the gate from approving");

  // Cold: this registry has never had a decider installed for QuitLike before request() is called.
  // Before the fix, request()'s own call to resolveAsync() captured a disconnected empty array at
  // that moment, and the decider installed a line later landed in a different array the resolution's
  // lazy snapshot never saw.
  const coldRegistry = Registry.make();
  let coldApproved = 0;
  let coldDenyCalls = 0;
  const coldGate = CloseGate.make(
    () => {
      coldApproved++;
    },
    coldRegistry,
    QuitLike,
    {},
    "allow",
  );
  coldGate.request();
  coldRegistry.install(
    QuitLike,
    Decision.async(() => {
      coldDenyCalls += 1;
      return Effect.succeed("deny");
    }),
  );
  await Effect.runPromise(Effect.sleep(20));
  assert.equal(coldDenyCalls, 1, "cold: the installed deny decider must still be consulted");
  // On App.Quit, whose approve() requests application shutdown, this is the difference between the
  // application quitting and staying open while an installed "deny" decider was never asked.
  assert.equal(
    coldApproved,
    0,
    "cold: a deny decider installed right after request() must not be missed",
  );
});

test("the application gate is wired to App.Quit: no decider approves, a deny decider does not", async () => {
  let approved = 0;
  const owner = AppRuntime.make(() => {
    approved++;
  });
  owner.gate.request();
  await Effect.runPromise(Effect.sleep(10));
  assert.equal(approved, 1, "App.Quit's allow fallback must approve when nothing is installed");
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Registry.decide(owner.registry, { isClosed: owner.isClosed })(
          Decidables.App.Quit,
          Decision.async(() => Effect.succeed("deny")),
        );
        owner.gate.request();
        yield* Effect.sleep(10);
        assert.equal(approved, 1, "a deny decider must keep the application running");
      }).pipe(Effect.provide(main)),
    ),
  );
  await Effect.runPromise(owner.close());
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
