import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { DesktopCapturer, Menu, SystemPreferences, TouchBar } from "sewed";

test("touch bars require unique item ids across nested items", () => {
  const decode = Schema.decodeUnknownExit(TouchBar.Options);
  assert.equal(
    decode({
      items: [
        { kind: "button", id: "a" },
        { kind: "group", items: [{ kind: "slider", id: "b" }] },
      ],
    })._tag,
    "Success",
  );
  assert.equal(
    decode({
      items: [
        { kind: "button", id: "a" },
        { kind: "popover", id: "p", items: [{ kind: "button", id: "a" }] },
      ],
    })._tag,
    "Failure",
  );
  assert.equal(decode({ items: [{ kind: "button", id: "" }] })._tag, "Failure");
  assert.equal(decode({ items: [{ kind: "segmented", id: "s", segments: [] }] })._tag, "Failure");
});

test("capture and sharing schemas keep their closed sets", () => {
  const decision = Schema.decodeUnknownExit(DesktopCapturer.Decision);
  assert.equal(decision({ kind: "source", id: "screen:0:0", audio: "loopback" })._tag, "Success");
  assert.equal(decision({ kind: "source", id: "" })._tag, "Failure");
  assert.equal(decision({ kind: "tab" })._tag, "Failure");
  const options = Schema.decodeUnknownExit(DesktopCapturer.Options);
  assert.equal(options({ types: [] })._tag, "Failure");
  const sharing = Schema.decodeUnknownExit(Menu.SharingItem);
  assert.equal(sharing({ texts: ["x"] })._tag, "Success");
  assert.equal(sharing({ texts: [] })._tag, "Failure");
  assert.equal(sharing({})._tag, "Failure");
  const kind = Schema.decodeUnknownExit(SystemPreferences.MediaKind);
  assert.equal(kind("screen")._tag, "Success");
  assert.equal(kind("keyboard")._tag, "Failure");
});
