import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import * as GuestInput from "../src/internal/GuestInput.ts";

const event = () => {
  const state = { prevented: false };
  return { state, value: { preventDefault: () => (state.prevented = true) } };
};

test("a blocking input policy prevents keyboard and mouse events until it allows them again", () => {
  const contents = new EventEmitter();
  const gate = GuestInput.install(contents, "block");
  const key = event();
  const mouse = event();
  contents.emit("before-input-event", key.value, { type: "keyDown", key: "a" });
  contents.emit("before-mouse-event", mouse.value, { type: "mouseDown", x: 1, y: 1 });
  assert.equal(key.state.prevented, true);
  assert.equal(mouse.state.prevented, true);
  gate.set("allow");
  const allowedKey = event();
  const allowedMouse = event();
  contents.emit("before-input-event", allowedKey.value, { type: "keyDown", key: "a" });
  contents.emit("before-mouse-event", allowedMouse.value, { type: "mouseDown", x: 1, y: 1 });
  assert.equal(allowedKey.state.prevented, false);
  assert.equal(allowedMouse.state.prevented, false);
});

test("uninstalling the input gate removes both listeners", () => {
  const contents = new EventEmitter();
  const gate = GuestInput.install(contents, "allow");
  assert.equal(contents.listenerCount("before-input-event"), 1);
  assert.equal(contents.listenerCount("before-mouse-event"), 1);
  gate.uninstall();
  assert.equal(contents.listenerCount("before-input-event"), 0);
  assert.equal(contents.listenerCount("before-mouse-event"), 0);
});
