import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Session } from "electron";
import * as Native from "../src/internal/Session.ts";

const fakeSession = () =>
  Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: () => {},
  });

const preconnectPrevented = (session: EventEmitter) => {
  const state = { prevented: false };
  session.emit(
    "preconnect",
    { preventDefault: () => (state.prevented = true) },
    "https://example.com/",
    true,
  );
  return state.prevented;
};

test("sessions allow preconnect until a policy disables it", () => {
  const fake = fakeSession();
  // Test-only bridge: the adapter reads these members structurally.
  const handle = Native.fromNative(fake as unknown as Session);
  assert.equal(preconnectPrevented(fake), false);
  Native.setPreconnect(handle, false);
  assert.equal(preconnectPrevented(fake), true);
  Native.setPreconnect(handle, true);
  assert.equal(preconnectPrevented(fake), false);
});
