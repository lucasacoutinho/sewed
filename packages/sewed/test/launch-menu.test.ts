import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { Menu } from "sewed";
import * as Declarations from "../src/internal/Declarations.ts";

test("a launch step is registered before readiness, and a menu item update keeps its closed set", () => {
  let registered: (() => void) | undefined;
  const native: Declarations.LaunchNative = {
    once: (_event, listener) => {
      registered = listener;
    },
  };
  let ran = 0;
  assert.equal(
    Declarations.apply([Declarations.willFinishLaunching(native, () => ran++)], {
      isReady: () => false,
    }),
    undefined,
  );
  registered?.();
  assert.equal(ran, 1);
  const update = Schema.decodeUnknownExit(Menu.ItemUpdate);
  assert.equal(update({ enabled: false, checked: true })._tag, "Success");
  assert.equal(update({ label: "" })._tag, "Failure");
});
