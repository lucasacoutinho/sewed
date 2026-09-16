import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as GuestInput from "../src/internal/GuestInput.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

const event = () => {
  const state = { prevented: false };
  return { state, value: { preventDefault: () => (state.prevented = true) } };
};

test("a decider that answers block prevents keyboard and mouse events, until it is removed", () => {
  const contents = new EventEmitter();
  const registry = Registry.make();
  const remove = registry.install(
    Decidables.WebContents.Input,
    Decision.sync(() => "block"),
  );
  const gate = GuestInput.install(contents, registry);
  const key = event();
  const mouse = event();
  contents.emit("before-input-event", key.value, { type: "keyDown", key: "a" });
  contents.emit("before-mouse-event", mouse.value, { type: "mouseDown", x: 1, y: 1 });
  assert.equal(key.state.prevented, true);
  assert.equal(mouse.state.prevented, true);
  remove();
  const allowedKey = event();
  const allowedMouse = event();
  contents.emit("before-input-event", allowedKey.value, { type: "keyDown", key: "a" });
  contents.emit("before-mouse-event", allowedMouse.value, { type: "mouseDown", x: 1, y: 1 });
  assert.equal(allowedKey.state.prevented, false);
  assert.equal(allowedMouse.state.prevented, false);
  gate.uninstall();
});

test("with no decider installed, the decidable's own fallback allows input", () => {
  const contents = new EventEmitter();
  const registry = Registry.make();
  const gate = GuestInput.install(contents, registry);
  const key = event();
  const mouse = event();
  contents.emit("before-input-event", key.value, { type: "keyDown", key: "a" });
  contents.emit("before-mouse-event", mouse.value, { type: "mouseDown", x: 1, y: 1 });
  assert.equal(key.state.prevented, false);
  assert.equal(mouse.state.prevented, false);
  gate.uninstall();
});

test("a per-owner fallback override blocks input with no decider installed", () => {
  const contents = new EventEmitter();
  const registry = Registry.make({
    fallbacks: [Registry.fallback(Decidables.WebContents.Input, "block")],
  });
  const gate = GuestInput.install(contents, registry);
  const key = event();
  contents.emit("before-input-event", key.value, { type: "keyDown", key: "a" });
  assert.equal(key.state.prevented, true);
  gate.uninstall();
});

test("the gate resolves each native event with its own kind, so a decider can block one and not the other", () => {
  const contents = new EventEmitter();
  const registry = Registry.make();
  registry.install(
    Decidables.WebContents.Input,
    Decision.sync((input: { readonly kind: "key" | "mouse" }) =>
      input.kind === "mouse" ? "block" : "allow",
    ),
  );
  const gate = GuestInput.install(contents, registry);
  const key = event();
  const mouse = event();
  contents.emit("before-input-event", key.value, { type: "keyDown", key: "a" });
  contents.emit("before-mouse-event", mouse.value, { type: "mouseDown", x: 1, y: 1 });
  assert.equal(key.state.prevented, false);
  assert.equal(mouse.state.prevented, true);
  gate.uninstall();
});

test("uninstalling the input gate removes both listeners", () => {
  const contents = new EventEmitter();
  const registry = Registry.make();
  const gate = GuestInput.install(contents, registry);
  assert.equal(contents.listenerCount("before-input-event"), 1);
  assert.equal(contents.listenerCount("before-mouse-event"), 1);
  gate.uninstall();
  assert.equal(contents.listenerCount("before-input-event"), 0);
  assert.equal(contents.listenerCount("before-mouse-event"), 0);
});
