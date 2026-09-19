import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Session } from "electron";
import { Effect, Exit, Scope } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Testing from "../src/Testing.ts";
import * as Native from "../src/internal/Session.ts";

const fakeSession = () =>
  Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: () => {},
    setCertificateVerifyProc: () => {},
    setDisplayMediaRequestHandler: () => {},
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

test("sessions allow preconnect with no decider installed, and a decider's own scope governs it", async () => {
  const fake = fakeSession();
  // Test-only bridge: the adapter reads these members structurally.
  const handle = Native.fromNative(fake as unknown as Session);
  assert.equal(preconnectPrevented(fake), false, "the decidable's own fallback allows it");
  const scope = await Effect.runPromise(Scope.make());
  await Effect.runPromise(
    handle
      .decide(
        Decidables.Session.Preconnect,
        Decision.sync(() => "deny"),
      )
      .pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  assert.equal(preconnectPrevented(fake), true, "an installed deny decider prevents it");
  await Effect.runPromise(Scope.close(scope, Exit.void));
  assert.equal(
    preconnectPrevented(fake),
    false,
    "closing the decider's own scope removes it, restoring the fallback",
  );
});
