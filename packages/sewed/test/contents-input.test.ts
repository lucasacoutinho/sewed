import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Effect } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Testing from "../src/Testing.ts";
import * as ContentsInput from "../src/internal/ContentsInput.ts";
import * as ContentsPosture from "../src/internal/ContentsPosture.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

const event = () => {
  const state = { prevented: false };
  return { state, value: { preventDefault: () => (state.prevented = true) } };
};

/** A guest's own registry, built the way `internal/GuestView.ts` builds it. */
const guestRegistry = (input?: "allow" | "block") =>
  Registry.make({ owner: "contents", fallbacks: ContentsPosture.guestFallbacks(input) });

/**
 * A window's own registry, built the way `internal/WebContents.ts` builds it: the renderer posture
 * plus this module's own input hook over `native`. That file cannot be imported by this suite — it
 * reaches `electron` for a value through `internal/MainBridge.ts` — so what is proven here is the
 * wiring rather than the one line that hands over the real contents, which the playground's
 * `verify:windows` fixture proves live. Which of this module's two entry points each owner calls
 * stays unproven for the same reason `ContentsPosture`'s own doc records.
 */
const windowRegistry = (contents: ContentsInput.Contents) => {
  const registry: Registry.Registry<"contents"> = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
    hooks: [ContentsInput.hook(contents, () => registry)],
  });
  return registry;
};

test("a decider that answers block prevents keyboard and mouse events, until it is removed", () => {
  const contents = new EventEmitter();
  const registry = guestRegistry();
  const remove = registry.install(
    Decidables.WebContents.Input,
    Decision.sync(() => "block"),
  );
  const gate = ContentsInput.install(contents, registry);
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
  const registry = guestRegistry();
  const gate = ContentsInput.install(contents, registry);
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
  const registry = guestRegistry("block");
  const gate = ContentsInput.install(contents, registry);
  const key = event();
  contents.emit("before-input-event", key.value, { type: "keyDown", key: "a" });
  assert.equal(key.state.prevented, true);
  gate.uninstall();
});

test("the gate resolves each native event with its own kind, so a decider can block one and not the other", () => {
  const contents = new EventEmitter();
  const registry = guestRegistry();
  registry.install(
    Decidables.WebContents.Input,
    Decision.sync((input: { readonly kind: "key" | "mouse" }) =>
      input.kind === "mouse" ? "block" : "allow",
    ),
  );
  const gate = ContentsInput.install(contents, registry);
  const key = event();
  const mouse = event();
  contents.emit("before-input-event", key.value, { type: "keyDown", key: "a" });
  contents.emit("before-mouse-event", mouse.value, { type: "mouseDown", x: 1, y: 1 });
  assert.equal(key.state.prevented, false);
  assert.equal(mouse.state.prevented, true);
  gate.uninstall();
});

test("a guest keeps both listeners from construction, with no decider ever installed", () => {
  const contents = new EventEmitter();
  const registry = guestRegistry();
  const gate = ContentsInput.install(contents, registry);
  // Unconditional for a guest, and it has to be: `input: "block"` is a posture with no decider
  // behind it, so a guest that waited for one would let every keystroke through until one arrived.
  assert.equal(contents.listenerCount("before-input-event"), 1);
  assert.equal(contents.listenerCount("before-mouse-event"), 1);
  gate.uninstall();
  assert.equal(contents.listenerCount("before-input-event"), 0);
  assert.equal(contents.listenerCount("before-mouse-event"), 0);
});

test("a window's contents carries no input listener until a decider is installed, and loses it with the last one", async () => {
  const contents = new EventEmitter();
  const registry = windowRegistry(contents);
  assert.equal(
    contents.listenerCount("before-input-event"),
    0,
    "a window with no input decider pays nothing per key event",
  );
  assert.equal(contents.listenerCount("before-mouse-event"), 0);
  let consulted = 0;
  const key = event();
  const mouse = event();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Registry.decide(registry, { isClosed: () => false })(
          Decidables.WebContents.Input,
          Decision.sync(() => {
            consulted += 1;
            return "block";
          }),
        );
        assert.equal(contents.listenerCount("before-input-event"), 1, "the first decider attaches");
        assert.equal(contents.listenerCount("before-mouse-event"), 1);
        contents.emit("before-input-event", key.value, { type: "keyDown", key: "a" });
        contents.emit("before-mouse-event", mouse.value, { type: "mouseDown", x: 1, y: 1 });
        assert.equal(consulted, 2, "both native events consult the decider");
        assert.equal(key.state.prevented, true);
        assert.equal(mouse.state.prevented, true);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(
    contents.listenerCount("before-input-event"),
    0,
    "closing the installing scope removes the listener the first install attached",
  );
  assert.equal(contents.listenerCount("before-mouse-event"), 0);
  const after = event();
  contents.emit("before-input-event", after.value, { type: "keyDown", key: "a" });
  assert.equal(after.state.prevented, false);
  assert.equal(consulted, 2, "a key event after the scope closed consults nothing");
});

test("a second decider on a window's contents does not attach a second pair of listeners", () => {
  const contents = new EventEmitter();
  const registry = windowRegistry(contents);
  const removeFirst = registry.install(
    Decidables.WebContents.Input,
    Decision.sync(() => Decision.Pass),
  );
  const removeSecond = registry.install(
    Decidables.WebContents.Input,
    Decision.sync(() => "block"),
  );
  assert.equal(contents.listenerCount("before-input-event"), 1);
  assert.equal(contents.listenerCount("before-mouse-event"), 1);
  removeFirst();
  const blocked = event();
  contents.emit("before-input-event", blocked.value, { type: "keyDown", key: "a" });
  assert.equal(blocked.state.prevented, true, "the surviving decider still blocks");
  assert.equal(contents.listenerCount("before-input-event"), 1);
  removeSecond();
  assert.equal(contents.listenerCount("before-input-event"), 0);
  assert.equal(contents.listenerCount("before-mouse-event"), 0);
});
