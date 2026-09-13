import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import { validate } from "../lib/internal/BindingContract.js";

test("binding contracts accept any order without mutating the declarations", async () => {
  const expected = Object.freeze(["second", "first"]);
  const supplied = Object.freeze(["first", "second"]);
  await Effect.runPromise(validate(expected, supplied, "Mismatch"));
  await Effect.runPromise(validate([], [], "Mismatch"));
  assert.deepEqual(expected, ["second", "first"]);
  assert.deepEqual(supplied, ["first", "second"]);
});

test("binding diagnostics report all missing, unexpected and duplicate keys", async () => {
  const error = await Effect.runPromise(
    validate(["missing", "same", "same"], ["extra", "same", "extra"], "Mismatch").pipe(Effect.flip),
  );
  assert.equal(error.code, "Protocol");
  assert.equal(
    error.message,
    "Mismatch. Missing bindings: missing. Unexpected bindings: extra. Duplicate declarations: same. Duplicate bindings: extra",
  );
  const duplicate = await Effect.runPromise(
    validate(["same"], ["same", "same"], "Mismatch").pipe(Effect.flip),
  );
  assert.equal(duplicate.message, "Mismatch. Duplicate bindings: same");
});
