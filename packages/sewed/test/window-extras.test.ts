import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { WindowControls } from "sewed";

test("window controls expose the appearance commands", () => {
  const tags = [...WindowControls.protocol.requests.keys()];
  for (const tag of ["setTitle", "setAlwaysOnTop", "setOpacity", "setProgress", "flash"])
    assert.ok(tags.includes(tag), tag);
});

test("appearance schemas keep Electron's ranges", () => {
  const opacity = Schema.decodeUnknownExit(WindowControls.Opacity);
  assert.equal(opacity(0)._tag, "Success");
  assert.equal(opacity(1)._tag, "Success");
  assert.equal(opacity(1.5)._tag, "Failure");
  const progress = Schema.decodeUnknownExit(WindowControls.Progress);
  assert.equal(progress(-1)._tag, "Success");
  assert.equal(progress(2)._tag, "Failure");
  const level = Schema.decodeUnknownExit(WindowControls.AlwaysOnTopLevel);
  assert.equal(level("floating")._tag, "Success");
  assert.equal(level("top")._tag, "Failure");
  const state = Schema.decodeUnknownExit(WindowControls.State);
  assert.equal(
    state({
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      normalBounds: { x: 0, y: 0, width: 1, height: 1 },
      contentBounds: { x: 0, y: 0, width: 1, height: 1 },
      visible: true,
      focused: false,
      minimized: false,
      maximized: false,
      fullScreen: false,
    })._tag,
    "Failure",
  );
});
