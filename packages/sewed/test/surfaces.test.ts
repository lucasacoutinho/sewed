import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { Clipboard, NativeTheme, Notification, PowerMonitor, SafeStorage, Shell } from "sewed";

const tags = (group: { readonly requests: ReadonlyMap<string, unknown> }) =>
  [...group.requests.keys()].sort();

test("wave-one protocols expose their documented operations", () => {
  assert.deepEqual(tags(NativeTheme.protocol), ["setSource", "state"]);
  assert.deepEqual(tags(PowerMonitor.protocol), ["events", "state"]);
  assert.deepEqual(tags(Notification.protocol), ["show"]);
  assert.deepEqual(tags(Clipboard.protocol), ["clear", "formats", "read", "write"]);
  assert.deepEqual(tags(Shell.protocol), [
    "openExternal",
    "openPath",
    "showItemInFolder",
    "trashItem",
  ]);
});

test("policies and options reject values outside their closed sets", () => {
  const decodePolicy = Schema.decodeUnknownExit(Clipboard.Policy);
  assert.equal(decodePolicy({ read: ["text"], write: [] })._tag, "Success");
  assert.equal(decodePolicy({ read: ["files"], write: [] })._tag, "Failure");
  const decodeSource = Schema.decodeUnknownExit(NativeTheme.Source);
  assert.equal(decodeSource("auto")._tag, "Failure");
  const decodeThreshold = Schema.decodeUnknownExit(PowerMonitor.IdleThreshold);
  assert.equal(decodeThreshold(0)._tag, "Failure");
  assert.equal(decodeThreshold(1.5)._tag, "Failure");
  const decodeOptions = Schema.decodeUnknownExit(Notification.Options);
  assert.equal(decodeOptions({ title: "" })._tag, "Failure");
  assert.equal(decodeOptions({ title: "Sewed", actions: [] })._tag, "Failure");
  assert.equal(decodeOptions({ title: "Sewed", urgency: "critical" })._tag, "Success");
  const decodeRules = Schema.decodeUnknownExit(Shell.Policy);
  assert.equal(decodeRules([{ kind: "origin", origin: "https://example.com" }])._tag, "Success");
  assert.equal(decodeRules([{ kind: "host", host: "example.com" }])._tag, "Failure");
});

test("sealed secrets record their version and backend", () => {
  const decode = Schema.decodeUnknownExit(SafeStorage.Sealed);
  const bytes = new Uint8Array([1, 2, 3]);
  assert.equal(decode({ version: 1, backend: "gnome_libsecret", bytes })._tag, "Success");
  assert.equal(decode({ version: 2, backend: "gnome_libsecret", bytes })._tag, "Failure");
  assert.equal(
    decode({ version: 1, backend: "gnome_libsecret", bytes: [1, 2, 3] })._tag,
    "Failure",
  );
});
