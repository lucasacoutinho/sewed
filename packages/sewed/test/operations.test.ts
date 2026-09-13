import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { ContentTracing, NetLog, PowerSaveBlocker } from "sewed";

test("operation schemas keep their closed sets and bounds", () => {
  const kind = Schema.decodeUnknownExit(PowerSaveBlocker.Kind);
  assert.equal(kind("prevent-display-sleep")._tag, "Success");
  assert.equal(kind("prevent-everything")._tag, "Failure");
  const log = Schema.decodeUnknownExit(NetLog.Options);
  assert.equal(log({ captureMode: "everything", maxFileSize: 1024 })._tag, "Success");
  assert.equal(log({ maxFileSize: 0 })._tag, "Failure");
  const trace = Schema.decodeUnknownExit(ContentTracing.Options);
  assert.equal(trace({ included: ["*"], mode: "record-continuously" })._tag, "Success");
  assert.equal(trace({ included: [""] })._tag, "Failure");
  assert.equal(trace({ bufferKb: -1 })._tag, "Failure");
});
