import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { Options } from "../src/internal/WindowOptions.ts";

const decode = Schema.decodeUnknownExit(Options);

test("window options accept a macOS title bar style and traffic light position", () => {
  const exit = decode({ titleBarStyle: "hiddenInset", trafficLightPosition: { x: 12, y: 10 } });
  assert.equal(exit._tag, "Success");
  if (exit._tag !== "Success") return;
  assert.equal(exit.value.titleBarStyle, "hiddenInset");
  assert.deepEqual(exit.value.trafficLightPosition, { x: 12, y: 10 });
});

test("window options reject an unknown title bar style and a fractional traffic light position", () => {
  assert.equal(decode({ titleBarStyle: "sideways" })._tag, "Failure");
  assert.equal(decode({ trafficLightPosition: { x: 1.5, y: 0 } })._tag, "Failure");
});
