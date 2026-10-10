import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { SewedError } from "../lib/index.js";

const codec = Schema.toCodecJson(SewedError);

test("native error causes encode as diagnostics while local errors retain their cause", () => {
  const cause = new Error("native failure", { cause: new Error("underlying failure") });
  const error = new SewedError({ code: "Native", message: "operation failed", cause });
  assert.equal(error.cause, cause);
  const encoded = Schema.encodeSync(codec)(error);
  const decoded = Schema.decodeUnknownSync(codec)(encoded);
  assert.ok(decoded instanceof SewedError);
  assert.equal(decoded.code, "Native");
  assert.deepEqual(decoded.cause, {
    name: "Error",
    message: "native failure",
    cause: { name: "Error", message: "underlying failure" },
  });
  assert.equal(JSON.stringify(encoded).includes("stack"), false);
});

test("structured transport diagnostics preserve their code and reason through repeated forwarding", () => {
  const cause = {
    _tag: "SewedError",
    code: "Protocol",
    message: "invalid packet",
    reason: "transport/invalid-packet",
    details: { received: [1, true, null] },
  };
  const error = new SewedError({
    code: "Unknown",
    message: "owner disconnected",
    reason: "transport/lost-after-send",
    cause,
  });
  const roundTrip = (value: SewedError) =>
    Schema.decodeUnknownSync(codec)(Schema.encodeSync(codec)(value));
  const forwarded = roundTrip(roundTrip(error));
  assert.equal(forwarded.code, error.code);
  assert.equal(forwarded.reason, error.reason);
  assert.deepEqual(forwarded.cause, cause);
});
