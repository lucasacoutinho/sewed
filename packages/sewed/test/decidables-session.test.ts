import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Session } from "electron";
import { Effect } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Testing from "../src/Testing.ts";
import * as Native from "../src/internal/Session.ts";

type PermissionCheckHandler = (
  contents: unknown,
  permission: string,
  origin: string | undefined,
  details: Record<string, unknown>,
) => boolean;
type DeviceHandler = (details: Record<string, unknown>) => boolean;
type CertificateHandler = (
  request: Record<string, unknown>,
  callback: (result: number) => void,
) => void;
type DisplayMediaHandler = (
  request: Record<string, unknown>,
  callback: (streams: unknown) => void,
) => void;

/**
 * A structural session: `internal/Session.ts` reads these members structurally at `fromNative`,
 * Electron's own class is not loadable in Node. Every helper drives the exact handler Electron would
 * call, with a fake `WebContents` standing in for the requesting document.
 */
const fakeSession = () => {
  let permissionCheck: PermissionCheckHandler | undefined;
  let deviceCheck: DeviceHandler | undefined;
  let certificateVerify: CertificateHandler | undefined;
  let displayMediaRequest: DisplayMediaHandler | undefined;
  const emitter = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
      permissionCheck = handler;
    },
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: (handler: DeviceHandler) => {
      deviceCheck = handler;
    },
    setCertificateVerifyProc: (handler: CertificateHandler) => {
      certificateVerify = handler;
    },
    setDisplayMediaRequestHandler: (handler: DisplayMediaHandler) => {
      displayMediaRequest = handler;
    },
  });
  const contents = {
    isDestroyed: () => false,
    getURL: () => "https://example.com/",
  };
  return {
    native: emitter,
    checkPermission: (permission: string, overrides: Record<string, unknown> = {}) => {
      assert.ok(permissionCheck !== undefined, "no permission check handler installed");
      return permissionCheck(contents, permission, "https://example.com", {
        isMainFrame: true,
        requestingUrl: "https://example.com/",
        ...overrides,
      });
    },
    checkDevice: (deviceType: string, overrides: Record<string, unknown> = {}) => {
      assert.ok(deviceCheck !== undefined, "no device permission handler installed");
      return deviceCheck({ deviceType, origin: "https://example.com", ...overrides });
    },
    preconnect: (preconnectUrl = "https://example.com/") => {
      const state = { prevented: false };
      emitter.emit(
        "preconnect",
        { preventDefault: () => (state.prevented = true) },
        preconnectUrl,
        false,
      );
      return state.prevented;
    },
    verifyCertificate: (overrides: Record<string, unknown> = {}) =>
      new Promise<number>((resolve) => {
        assert.ok(certificateVerify !== undefined, "no certificate verify proc installed");
        certificateVerify(
          {
            hostname: "example.com",
            certificate: {
              fingerprint: "AA:BB:CC",
              subjectName: "example.com",
              issuerName: "Example CA",
              validStart: 0,
              validExpiry: 1_000_000,
            },
            ...overrides,
          },
          resolve,
        );
      }),
    requestDisplayMedia: (overrides: Record<string, unknown> = {}) =>
      new Promise<unknown>((resolve) => {
        assert.ok(displayMediaRequest !== undefined, "no display media handler installed");
        displayMediaRequest(
          {
            securityOrigin: "https://example.com/",
            videoRequested: true,
            audioRequested: false,
            userGesture: true,
            ...overrides,
          },
          resolve,
        );
      }),
  };
};

test("with no decider installed, a permission check denies and a preconnect is allowed", () => {
  const fake = fakeSession();
  Native.fromNative(fake.native as unknown as Session);
  assert.equal(
    fake.checkPermission("notifications"),
    false,
    "internal/Session.ts:65's own initial state denied every permission before this migration",
  );
  assert.equal(
    fake.preconnect(),
    false,
    "internal/Session.ts:73-74's own initial state allowed every preconnect before this migration",
  );
});

test("two permission deciders compose restrictively, so neither can widen the other's denial", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native as unknown as Session);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(() => "allow"),
        );
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(() => "deny"),
        );
        assert.equal(
          fake.checkPermission("notifications"),
          false,
          "a denial from one decider must not be widened by an allow from another",
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("device access (hid, serial, usb) resolves through the same Permission decidable, keyed by the requesting origin", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native as unknown as Session);
  assert.equal(fake.checkDevice("hid"), false, "with no decider, device access denies too");
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(({ name }) => (name === "hid" ? "allow" : "deny")),
        );
        assert.equal(fake.checkDevice("hid"), true);
        assert.equal(fake.checkDevice("serial"), false);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("a preconnect decider that denies prevents the connection", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native as unknown as Session);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.Preconnect,
          Decision.sync(() => "deny"),
        );
        assert.equal(fake.preconnect(), true);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("a certificate decider answering trust or reject maps onto setCertificateVerifyProc's numeric callback, and no answer keeps Chromium's system verdict", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native as unknown as Session);
  const verifyWith = (answer: "trust" | "reject") =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* handle.decide(
            Decidables.Session.Certificate,
            Decision.async(() => Effect.succeed(answer)),
          );
          return yield* Effect.promise(() => fake.verifyCertificate());
        }),
      ).pipe(Effect.provide(Testing.main)),
    );
  assert.equal(await verifyWith("trust"), 0, 'preserving internal/Session.ts:122-128\'s "0 trust"');
  assert.equal(await verifyWith("reject"), -2, 'preserving its "-2 reject"');
  assert.equal(
    await fake.verifyCertificate(),
    -3,
    'with no decider installed, the fallback ("system") preserves its "-3 system"',
  );
});

test("a display-media decider that fails is denied, preserving internal/DisplayMedia.ts:41-45's own fallback-to-deny", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native as unknown as Session);
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.DisplayMedia,
          Decision.async(() => Effect.die(new Error("display media decider boom"))),
        );
        return yield* Effect.promise(() => fake.requestDisplayMedia());
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.deepEqual(result, {}, "a denied request receives no streams");
});
