import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer, Tracer } from "effect";
import { DevToolsClient } from "effect/unstable/devtools";
import type { DevToolsSchema } from "effect/unstable/devtools";
import * as Testing from "sewed/testing";
import * as DevTools from "../lib/index.js";

test("headless diagnostics preserves the existing Effect DevTools tracer in a Node runtime", async () => {
  const upstream: Array<DevToolsSchema.Span | DevToolsSchema.SpanEvent> = [];
  const upstreamLayer = Layer.effect(
    Tracer.Tracer,
    DevToolsClient.makeTracer.pipe(
      Effect.provideService(DevToolsClient.DevToolsClient, {
        sendUnsafe: (message) => upstream.push(message),
      }),
    ),
  );
  const tools = await Effect.runPromise(
    Effect.gen(function* () {
      const tools = yield* DevTools.make({ capacity: 16 });
      yield* Effect.gen(function* () {
        const span = yield* Effect.currentSpan;
        span.event("checkpoint", 123n, { private: "event payload" });
        yield* Effect.fail("private error").pipe(Effect.withSpan("child"), Effect.exit);
      }).pipe(
        Effect.withSpan("operation", {
          attributes: { "sewed.owner.id": "owner", private: "attribute" },
        }),
        Effect.provide(tools.layer),
      );
      const snapshot = yield* tools.snapshot;
      assert.equal(snapshot.diagnostics.closed, false);
      const parent = snapshot.spans.find((span) => span.name === "operation");
      const child = snapshot.spans.find((span) => span.name === "child");
      assert.ok(parent);
      assert.ok(child);
      assert.equal(parent.ownerId, "owner");
      assert.equal(child.parentId, parent.spanId);
      assert.equal(child.traceId, parent.traceId);
      assert.equal(child.outcome, "failure");
      assert.deepEqual(parent.events, [{ name: "checkpoint", time: "123" }]);
      for (const span of [parent, child]) {
        assert.ok(
          upstream.some(
            (message) =>
              message._tag === "Span" &&
              message.spanId === span.spanId &&
              message.traceId === span.traceId &&
              message.status._tag === "Ended",
          ),
        );
      }
      assert.ok(
        upstream.some(
          (message) =>
            message._tag === "SpanEvent" &&
            message.spanId === parent.spanId &&
            message.name === "checkpoint",
        ),
      );
      assert.equal(JSON.stringify(snapshot).includes("private"), false);
      return tools;
    }).pipe(Effect.provide(upstreamLayer), Effect.provide(Testing.main), Effect.scoped),
  );
  const closed = await Effect.runPromise(tools.snapshot);
  assert.equal(closed.diagnostics.closed, true);
});

test("headless capacity validation and explicitly disabled instrumentation remain bounded", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      for (const capacity of [15, 4097, Number.NaN]) {
        const error = yield* DevTools.make({ capacity }).pipe(Effect.flip);
        assert.equal(error.code, "Limit");
      }
      yield* Effect.void.pipe(Effect.provide(DevTools.layer({ enabled: false, capacity: 0 })));
    }).pipe(Effect.provide(Testing.main), Effect.scoped),
  );
});
