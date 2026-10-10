import assert from "node:assert/strict";
import { test } from "node:test";
import { decodePartition, partitionKey } from "../src/internal/Session.ts";

// `Session.fromPartition` itself calls Electron's own `session.fromPartition` at module scope
// (`sewed/main` only, real Electron required), so it stays outside plain-Node coverage the way it
// always has; `partitionKey` is the pure computation `fromPartition` hands that call, and it is
// exercised directly here — Electron-free, no fake native needed.

test("hashed mapping (the default) derives sewed-v1-<sha256>, unprefixed for a memory partition", () => {
  const key = partitionKey({ kind: "memory", name: "jaspace" });
  assert.match(key, /^sewed-v1-[0-9a-f]{64}$/);
});

test("hashed mapping is persist:-prefixed for a persistent partition", () => {
  const key = partitionKey({ kind: "persistent", name: "jaspace" });
  assert.match(key, /^persist:sewed-v1-[0-9a-f]{64}$/);
});

test('omitting "mapping" and naming it "hashed" produce the identical key', () => {
  const omitted = partitionKey({ kind: "persistent", name: "jaspace" });
  const named = partitionKey({ kind: "persistent", name: "jaspace", mapping: "hashed" });
  assert.equal(omitted, named);
});

test('mapping: "raw" hands the name through verbatim, persist:-prefixed for a persistent partition', () => {
  assert.equal(
    partitionKey({ kind: "persistent", name: "jaspace", mapping: "raw" }),
    "persist:jaspace",
  );
  assert.equal(partitionKey({ kind: "memory", name: "jaspace", mapping: "raw" }), "jaspace");
});

test('mapping: "raw" and the default hashed mapping never collide for the same name', () => {
  const raw = partitionKey({ kind: "persistent", name: "jaspace", mapping: "raw" });
  const hashed = partitionKey({ kind: "persistent", name: "jaspace" });
  assert.notEqual(raw, hashed);
});

test('mapping: "raw" rejects a memory name with Electron\'s persistent prefix', () => {
  assert.throws(() => decodePartition({ kind: "memory", name: "persist:guest", mapping: "raw" }));
  assert.doesNotThrow(() => decodePartition({ kind: "memory", name: "guest", mapping: "raw" }));
});

test("the hashed key is stable across calls and sensitive to case", () => {
  const lower = partitionKey({ kind: "persistent", name: "work" });
  const upper = partitionKey({ kind: "persistent", name: "Work" });
  assert.equal(partitionKey({ kind: "persistent", name: "work" }), lower);
  assert.notEqual(lower, upper);
});
