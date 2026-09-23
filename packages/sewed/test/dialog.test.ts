import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import * as Dialog from "../src/Dialog.ts";

test("Dialog.SaveOptions.properties accepts Electron's own save flags and keeps them verbatim", () => {
  const decode = Schema.decodeUnknownExit(Dialog.SaveOptions);
  const result = decode({ properties: ["dontAddToRecent", "showHiddenFiles"] });
  assert.equal(result._tag, "Success");
  if (result._tag === "Success") {
    assert.deepEqual(result.value.properties, ["dontAddToRecent", "showHiddenFiles"]);
  }
});

test("Dialog.SaveOptions.properties is absent when the caller omits it, not defaulted at the schema", () => {
  const decode = Schema.decodeUnknownExit(Dialog.SaveOptions);
  const result = decode({});
  assert.equal(result._tag, "Success");
  if (result._tag === "Success") assert.equal(result.value.properties, undefined);
});

test("Dialog.SaveOptions.properties refuses a flag Electron's save dialog does not have", () => {
  const decode = Schema.decodeUnknownExit(Dialog.SaveOptions);
  assert.equal(decode({ properties: ["openFile"] })._tag, "Failure");
  assert.equal(decode({ properties: ["notAFlag"] })._tag, "Failure");
});

test("Dialog.OpenOptions.properties accepts Electron's own open flags on both modes", () => {
  const decode = Schema.decodeUnknownExit(Dialog.OpenOptions);
  const file = decode({ mode: "file", properties: ["showHiddenFiles"] });
  assert.equal(file._tag, "Success");
  if (file._tag === "Success") assert.deepEqual(file.value.properties, ["showHiddenFiles"]);
  const directory = decode({ mode: "directory", properties: ["promptToCreate"] });
  assert.equal(directory._tag, "Success");
  if (directory._tag === "Success")
    assert.deepEqual(directory.value.properties, ["promptToCreate"]);
});

test("Dialog.OpenOptions.properties refuses the mode and multiplicity flags OpenOptions already models structurally", () => {
  const decode = Schema.decodeUnknownExit(Dialog.OpenOptions);
  assert.equal(decode({ mode: "file", properties: ["openFile"] })._tag, "Failure");
  assert.equal(decode({ mode: "file", properties: ["openDirectory"] })._tag, "Failure");
  assert.equal(decode({ mode: "file", properties: ["multiSelections"] })._tag, "Failure");
  assert.equal(decode({ mode: "file", properties: ["notAFlag"] })._tag, "Failure");
});
