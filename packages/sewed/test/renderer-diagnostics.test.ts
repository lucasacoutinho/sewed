import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bridge } from "../src/internal/Bridge.ts";
import { forward } from "../lib/internal/RendererDiagnostics.js";

test("renderer observations have one batch in flight and a bounded waiting buffer", async () => {
  const batches: { events: unknown[]; dropped: number }[] = [];
  const acknowledgments: (() => void)[] = [];
  const bridge: Bridge = {
    hello: async () => undefined,
    open: async () => undefined,
    close: () => {},
    disconnect: () => {},
    subscribe: () => () => {},
    pathOf: () => "",
    observe: async (_session, batch) => {
      assert.ok(new TextEncoder().encode(batch).byteLength <= 256 * 1024);
      batches.push(JSON.parse(batch));
      await new Promise<void>((resolve) => acknowledgments.push(resolve));
    },
  };
  const sink = forward(bridge, "document");
  sink.emit({ _tag: "OwnerClosed", ownerId: "forged", reason: "terminated" });
  assert.equal(batches.length, 0);
  for (let index = 0; index < 1000; index++) {
    sink.emit({
      _tag: "RuntimeSample",
      runtime: "renderer",
      runtimeId: "document",
      threadId: 0,
      intervalMs: 500,
      delayMs: index,
    });
  }
  assert.equal(batches.length, 1);
  for (let index = 0; index < 5; index++) {
    acknowledgments.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(
    batches.reduce((sum, batch) => sum + batch.events.length, 0),
    257,
  );
  assert.equal(
    batches.reduce((sum, batch) => sum + batch.dropped, 0),
    743,
  );
  assert.ok(batches.every((batch) => batch.events.length <= 64));
  sink.close();
  sink.emit({
    _tag: "RuntimeSample",
    runtime: "renderer",
    runtimeId: "document",
    threadId: 0,
    intervalMs: 500,
    delayMs: 0,
  });
  assert.equal(batches.length, 5);
});
