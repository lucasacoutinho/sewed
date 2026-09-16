import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import * as Decision from "../src/Decision.ts";
import { SewedError } from "../src/SewedError.ts";

test("a restrictive decidable without an order fails Protocol at declaration", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "test/no-order",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "sync",
        composition: "restrictive",
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});
