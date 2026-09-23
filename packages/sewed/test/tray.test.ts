import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import * as Tray from "../src/Tray.ts";

test("Tray.Options.icon is Image.Source: a path or already-encoded bytes", () => {
  const decode = Schema.decodeUnknownExit(Tray.Options);
  assert.equal(decode({ icon: "./tray.png" })._tag, "Success");
  assert.equal(decode({ icon: new Uint8Array([137, 80, 78, 71]) })._tag, "Success");
  assert.equal(decode({ icon: 42 })._tag, "Failure");
  assert.equal(decode({})._tag, "Failure");
});

test("Tray.Options.template is an optional boolean, applying only alongside an icon", () => {
  const decode = Schema.decodeUnknownExit(Tray.Options);
  const withTemplate = decode({ icon: "./tray.png", template: true });
  assert.equal(withTemplate._tag, "Success");
  if (withTemplate._tag === "Success") assert.equal(withTemplate.value.template, true);
  const withoutTemplate = decode({ icon: "./tray.png" });
  assert.equal(withoutTemplate._tag, "Success");
  if (withoutTemplate._tag === "Success") assert.equal(withoutTemplate.value.template, undefined);
  assert.equal(decode({ icon: "./tray.png", template: "yes" })._tag, "Failure");
});
