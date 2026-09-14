import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { WindowControls } from "sewed";

const bounds = { x: 10, y: 20, width: 800, height: 600 };
const state = {
  bounds,
  normalBounds: bounds,
  contentBounds: { x: 10, y: 48, width: 800, height: 572 },
  visible: true,
  focused: true,
  minimized: false,
  maximized: false,
  fullScreen: false,
  title: "Sewed",
  alwaysOnTop: false,
  opacity: 1,
  resizable: true,
  movable: true,
  minimizable: true,
  maximizable: true,
  closable: true,
  fullScreenable: true,
  menuBarVisible: true,
  kiosk: false,
};

test("window state carries the content area bounds", () => {
  const decoded = Schema.decodeUnknownSync(WindowControls.State)(state);
  assert.deepEqual(decoded.contentBounds, state.contentBounds);
  const { contentBounds: _contentBounds, ...withoutContentBounds } = state;
  assert.equal(
    Schema.decodeUnknownExit(WindowControls.State)(withoutContentBounds)._tag,
    "Failure",
  );
});
