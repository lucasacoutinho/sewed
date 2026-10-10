import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer, Schema, Tracer } from "effect";
import { DevToolsClient } from "effect/devtools";
import { Diagnostics } from "sewed";
import { observeAttributes, traceStore } from "../lib/tracing.js";

test("an unfinished upstream RPC span exposes its binding attributes", async () => {
  const store = traceStore(16);
  const layer = Layer.effect(
    Tracer.Tracer,
    DevToolsClient.makeTracer.pipe(
      Effect.provideService(DevToolsClient.DevToolsClient, store),
      Effect.map((tracer) => observeAttributes(tracer, store.sendUnsafe)),
    ),
  );
  await Effect.runPromise(
    Effect.sync(() => {
      const span = store.snapshot().spans.find((span) => span.name === "RpcClient.watch");
      assert.ok(span);
      assert.equal(span.outcome, "running");
      assert.equal(span.ownerId, "owner");
      assert.equal(span.binding, "watcher");
      assert.equal(span.runtime, "main");
    }).pipe(
      Effect.withSpan("RpcClient.watch", {
        attributes: { "sewed.owner.id": "owner", "sewed.binding": "watcher" },
      }),
      Effect.provide(layer),
    ),
  );
});

test("the upstream Effect tracer preserves parentage and exposes only selected metadata", async () => {
  const store = traceStore(16);
  const layer = Layer.effect(
    Tracer.Tracer,
    DevToolsClient.makeTracer.pipe(Effect.provideService(DevToolsClient.DevToolsClient, store)),
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const span = yield* Effect.currentSpan;
      span.event("checkpoint", 123n, { secret: "private event" });
      yield* Effect.fail("private failure").pipe(Effect.withSpan("child"), Effect.exit);
      return "private return";
    }).pipe(
      Effect.withSpan("parent", {
        attributes: {
          "sewed.owner.id": "owner-1",
          "sewed.binding": "work",
          "sewed.runtime": "main",
          secret: "private attribute",
        },
      }),
      Effect.provide(layer),
    ),
  );
  const result = store.snapshot();
  assert.equal(result.spans.length, 2);
  for (const span of result.spans) Schema.decodeSync(Diagnostics.TraceSpan)(span);
  const parent = result.spans.find((span) => span.name === "parent");
  const child = result.spans.find((span) => span.name === "child");
  assert.ok(parent);
  assert.ok(child);
  assert.equal(parent.ownerId, "owner-1");
  assert.equal(parent.binding, "work");
  assert.equal(parent.outcome, "success");
  assert.equal(child.outcome, "failure");
  assert.equal(child.parentId, parent.spanId);
  assert.equal(child.traceId, parent.traceId);
  assert.deepEqual(parent.events, [{ name: "checkpoint", time: "123" }]);
  assert.equal(parent.runtimeId, "main");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("span retention is bounded and reports eviction", async () => {
  const store = traceStore(2);
  const layer = Layer.effect(
    Tracer.Tracer,
    DevToolsClient.makeTracer.pipe(Effect.provideService(DevToolsClient.DevToolsClient, store)),
  );
  await Effect.runPromise(
    Effect.forEach(["first", "second", "third"], (name) =>
      Effect.void.pipe(Effect.withSpan(name)),
    ).pipe(Effect.provide(layer)),
  );
  assert.deepEqual(
    store.snapshot().spans.map((span) => span.name),
    ["second", "third"],
  );
  assert.equal(store.snapshot().evictedSpans, 1);
  assert.equal(store.health({ complete: true, dropped: 0 }).complete, false);
});

test("validated trace identifiers cannot alias another trace/span pair", () => {
  const store = traceStore(8);
  const placement = { runtime: "worker" as const, runtimeId: "worker-1", threadId: 1 };
  for (const [traceId, spanId] of [
    ["trace:part", "span"],
    ["trace", "part:span"],
  ]) {
    const span = Schema.decodeUnknownSync(Diagnostics.TraceSpan)({
      _tag: "TraceSpan",
      traceId,
      spanId,
      name: `${traceId}/${spanId}`,
      startTime: "1",
      outcome: "running",
      ...placement,
    });
    store.sendObservation(span);
  }
  store.sendObservation({
    _tag: "TraceEvent",
    traceId: "trace:part",
    spanId: "span",
    name: "first only",
    time: "2",
    ...placement,
  });
  const spans = store.snapshot().spans;
  assert.equal(spans.length, 2);
  assert.deepEqual(
    spans.map((span) => span.events.length),
    [1, 0],
  );
});

test("validated runtime and queue identifiers cannot alias another queue", () => {
  const store = traceStore(8);
  for (const [runtimeId, queueId] of [
    ["runtime\u0000part", "queue"],
    ["runtime", "part\u0000queue"],
  ]) {
    store.sendObservation(
      Schema.decodeUnknownSync(Diagnostics.QueueSample)({
        _tag: "QueueSample",
        runtime: "worker",
        threadId: 1,
        runtimeId,
        queueId,
        kind: "rpc-client",
        size: 0,
        capacity: 4,
      }),
    );
  }
  store.sendObservation({
    _tag: "QueueClosed",
    runtime: "worker",
    threadId: 1,
    runtimeId: "runtime\u0000part",
    queueId: "queue",
  });
  assert.deepEqual(
    store.health({ complete: true, dropped: 0 }).queues.map((queue) => queue.runtimeId),
    ["runtime"],
  );
});

test("forwarded spans and events join by trace and span while preserving interleaved order", () => {
  const store = traceStore(8);
  const placement = { runtime: "worker" as const, runtimeId: "worker-7", threadId: 7 };
  store.sendObservation({
    _tag: "TraceEvent",
    traceId: "trace-1",
    spanId: "span-1",
    name: "before-start",
    time: "10",
    ...placement,
  });
  store.sendObservation({
    _tag: "TraceSpan",
    traceId: "trace-1",
    spanId: "span-1",
    name: "worker operation",
    startTime: "1",
    outcome: "running",
    ...placement,
  });
  store.sendObservation({
    _tag: "TraceEvent",
    traceId: "trace-1",
    spanId: "span-1",
    name: "after-start",
    time: "20",
    ...placement,
  });
  store.sendObservation({
    _tag: "TraceSpan",
    traceId: "trace-1",
    spanId: "span-1",
    name: "worker operation",
    startTime: "1",
    endTime: "30",
    outcome: "success",
    ...placement,
  });
  const span = store.snapshot().spans[0];
  assert.ok(span);
  assert.equal(span.parentId, undefined);
  assert.equal(span.runtimeId, "worker-7");
  assert.equal(span.outcome, "success");
  assert.deepEqual(span.events, [
    { name: "before-start", time: "10" },
    { name: "after-start", time: "20" },
  ]);
});

test("health and queue observations are latest-value bounded and clear on closure", () => {
  const store = traceStore(1);
  const placement = { runtime: "utility" as const, runtimeId: "utility-1", threadId: 0 };
  store.sendObservation({ _tag: "RuntimeSample", delayMs: 1, intervalMs: 500, ...placement });
  store.sendObservation({
    _tag: "RuntimeSample",
    delayMs: 2,
    intervalMs: 500,
    ...placement,
    runtimeId: "utility-2",
  });
  store.sendObservation({
    _tag: "QueueSample",
    queueId: "rpc-a",
    kind: "rpc-server",
    size: 1,
    capacity: 4,
    ownerId: "utility-2",
    ...placement,
    runtimeId: "utility-2",
  });
  const health = store.health({ complete: true, dropped: 0 });
  assert.equal(health.runtimes.length, 1);
  assert.equal(health.queues.length, 1);
  assert.equal(health.evicted, 1);
  assert.equal(health.complete, false);

  store.consume([{ sequence: 1, event: { _tag: "RuntimeClosed", runtimeId: "utility-2" } }]);
  assert.equal(store.health({ complete: true, dropped: 0 }).runtimes.length, 0);
  assert.equal(store.health({ complete: true, dropped: 0 }).queues.length, 0);
});

test("queue closure is scoped by runtime and owner closure clears ownerless client queues", () => {
  const store = traceStore(8);
  const worker = { runtime: "worker" as const, runtimeId: "worker-1", threadId: 1 };
  const utility = { runtime: "utility" as const, runtimeId: "utility-1", threadId: 0 };
  store.sendObservation({
    _tag: "QueueSample",
    queueId: "same-id",
    kind: "rpc-client",
    size: 0,
    capacity: 4,
    ...worker,
  });
  store.sendObservation({
    _tag: "QueueSample",
    queueId: "same-id",
    kind: "rpc-client",
    size: 1,
    capacity: 4,
    ...utility,
  });
  store.sendObservation({ _tag: "QueueClosed", queueId: "same-id", ...worker });
  let queues = store.health({ complete: true, dropped: 0 }).queues;
  assert.deepEqual(
    queues.map((sample) => sample.runtimeId),
    ["utility-1"],
  );

  store.consume([
    { sequence: 1, event: { _tag: "OwnerClosed", ownerId: "utility-1", reason: "shutdown" } },
  ]);
  queues = store.health({ complete: true, dropped: 0 }).queues;
  assert.equal(queues.length, 0);
});

test("trace event drops count retained events and ended spans cannot regress", () => {
  const store = traceStore(1);
  const placement = { runtime: "worker" as const, runtimeId: "worker-1", threadId: 1 };
  store.sendObservation({
    _tag: "TraceSpan",
    traceId: "trace-1",
    spanId: "span-1",
    name: "first",
    startTime: "1",
    outcome: "running",
    ...placement,
  });
  for (let index = 0; index < 32; index++) {
    store.sendObservation({
      _tag: "TraceEvent",
      traceId: "trace-1",
      spanId: "span-1",
      name: `event-${index}`,
      time: String(index + 2),
      ...placement,
    });
  }
  store.sendObservation({
    _tag: "TraceSpan",
    traceId: "trace-1",
    spanId: "span-1",
    name: "first",
    startTime: "1",
    endTime: "40",
    outcome: "success",
    ...placement,
  });
  store.sendObservation({
    _tag: "TraceSpan",
    traceId: "trace-1",
    spanId: "span-1",
    name: "first",
    startTime: "1",
    outcome: "running",
    ...placement,
  });
  assert.equal(store.snapshot().spans[0]?.outcome, "success");
  store.sendObservation({
    _tag: "TraceSpan",
    traceId: "trace-2",
    spanId: "span-2",
    name: "second",
    startTime: "2",
    outcome: "running",
    ...placement,
  });
  const snapshot = store.snapshot();
  assert.equal(snapshot.evictedSpans, 1);
  assert.equal(snapshot.droppedTraceEvents, 32);
  assert.equal(snapshot.spans[0]?.traceId, "trace-2");
  assert.equal(snapshot.spans[0]?.outcome, "running");
});

test("diagnostic sequence gaps make health incomplete and report missing records", () => {
  const store = traceStore(8);
  const placement = { runtime: "main" as const, runtimeId: "main", threadId: 0 };
  const sample = (delayMs: number) => ({
    _tag: "RuntimeSample" as const,
    delayMs,
    intervalMs: 500,
    ...placement,
  });
  store.consume([
    { sequence: 10, event: sample(1) },
    { sequence: 12, event: sample(2) },
  ]);
  const health = store.health({ complete: true, dropped: 0 });
  assert.equal(health.dropped, 1);
  assert.equal(health.complete, false);
});

test("observation schema rejects unbounded labels and non-finite samples", () => {
  assert.throws(() =>
    Schema.decodeSync(Diagnostics.TraceSpan)({
      _tag: "TraceSpan",
      traceId: "trace",
      spanId: "span",
      name: "x".repeat(513),
      startTime: "1",
      outcome: "running",
      runtime: "main",
      runtimeId: "main",
      threadId: 0,
    }),
  );
  assert.throws(() =>
    Schema.decodeSync(Diagnostics.RuntimeSample)({
      _tag: "RuntimeSample",
      delayMs: Number.NaN,
      intervalMs: 500,
      runtime: "main",
      runtimeId: "main",
      threadId: 0,
    }),
  );
});
