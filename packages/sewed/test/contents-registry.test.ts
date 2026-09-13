import assert from "node:assert/strict";
import { test } from "node:test";
import * as ContentsRegistry from "../src/internal/ContentsRegistry.ts";

test("the contents registry maps native ids to handle ids until released", () => {
  const release = ContentsRegistry.register(7, "handle-a");
  assert.equal(ContentsRegistry.handleIdOf(7), "handle-a");
  assert.equal(ContentsRegistry.handleIdOf(8), undefined);
  assert.equal(ContentsRegistry.handleIdOf(undefined), undefined);
  release();
  assert.equal(ContentsRegistry.handleIdOf(7), undefined);
  release();
});

test("a later registration for the same contents id survives an earlier release", () => {
  const first = ContentsRegistry.register(9, "old");
  const second = ContentsRegistry.register(9, "new");
  first();
  assert.equal(ContentsRegistry.handleIdOf(9), "new");
  second();
  assert.equal(ContentsRegistry.handleIdOf(9), undefined);
});
