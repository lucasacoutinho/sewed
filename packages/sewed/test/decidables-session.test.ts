import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Session } from "electron";
import { Effect, Exit, Scope } from "effect";
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
type PermissionRequestHandler = (
  contents: unknown,
  permission: string,
  callback: (granted: boolean) => void,
  details: Record<string, unknown>,
) => void;
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
 *
 * `setCertificateVerifyProc`/`setDisplayMediaRequestHandler` accept `null` too, and record it as
 * "uninstalled": the certificate proc and the display-media handler now exist only while a
 * `Session.Certificate`/`Session.DisplayMedia` decider does, installed and cleared by a hook rather
 * than at acquisition — `hasCertificateProc`/`hasDisplayMediaHandler` expose that for the wiring test.
 */
const fakeSession = () => {
  let permissionCheck: PermissionCheckHandler | undefined;
  let permissionRequest: PermissionRequestHandler | undefined;
  let deviceCheck: DeviceHandler | undefined;
  let certificateVerify: CertificateHandler | undefined;
  let displayMediaRequest: DisplayMediaHandler | undefined;
  const emitter = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
      permissionCheck = handler;
    },
    setPermissionRequestHandler: (handler: PermissionRequestHandler) => {
      permissionRequest = handler;
    },
    setDevicePermissionHandler: (handler: DeviceHandler) => {
      deviceCheck = handler;
    },
    setCertificateVerifyProc: (handler: CertificateHandler | null) => {
      certificateVerify = handler ?? undefined;
    },
    setDisplayMediaRequestHandler: (handler: DisplayMediaHandler | null) => {
      displayMediaRequest = handler ?? undefined;
    },
  });
  const contents = {
    isDestroyed: () => false,
    getURL: () => "https://example.com/",
  };
  return {
    // Test-only bridge: `internal/Session.ts` reads `native`'s members structurally, and Electron's
    // own `Session` class is not loadable in Node — the cast is owned once here, the way
    // `test/fake-session.ts`'s own fake owns its cast, rather than repeated at every call site.
    native: emitter as unknown as Session,
    hasCertificateProc: () => certificateVerify !== undefined,
    hasDisplayMediaHandler: () => displayMediaRequest !== undefined,
    checkPermission: (permission: string, overrides: Record<string, unknown> = {}) => {
      assert.ok(permissionCheck !== undefined, "no permission check handler installed");
      return permissionCheck(contents, permission, "https://example.com", {
        isMainFrame: true,
        requestingUrl: "https://example.com/",
        ...overrides,
      });
    },
    /**
     * The raw handler, for driving the hard gates directly: `checkPermission` above always uses this
     * module's own `contents`, `"https://example.com"` origin, and a matching document, which is
     * exactly what the six hard-gate cases each need to vary one at a time.
     */
    rawPermissionCheck: (
      rawContents: { isDestroyed: () => boolean; getURL: () => string } | null,
      permission: string,
      origin: string | undefined,
      details: Record<string, unknown>,
    ) => {
      assert.ok(permissionCheck !== undefined, "no permission check handler installed");
      return permissionCheck(rawContents, permission, origin, details);
    },
    /**
     * Drives `setPermissionRequestHandler`'s own handler, whose `details` Electron types as the
     * request-shape union (`PermissionRequest | FilesystemPermissionRequest |
     * MediaAccessPermissionRequest | OpenExternalPermissionRequest`) rather than the check
     * handler's `PermissionCheckHandlerHandlerDetails` — the one place `mediaTypes` (plural) is
     * reachable at all, as opposed to `checkPermission`'s singular `mediaType`.
     */
    requestPermission: (permission: string, overrides: Record<string, unknown> = {}) => {
      const handler = permissionRequest;
      assert.ok(handler !== undefined, "no permission request handler installed");
      return new Promise<boolean>((resolve) => {
        handler(contents, permission, resolve, {
          isMainFrame: true,
          requestingUrl: "https://example.com/",
          ...overrides,
        });
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
  Native.fromNative(fake.native);
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
  const handle = Native.fromNative(fake.native);
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
  const handle = Native.fromNative(fake.native);
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

test("a device check and a permission check for the same origin reach a decider distinguishably", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const seen: Array<{ readonly origin: string | null; readonly document: string | null }> =
          [];
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(({ origin, document }) => {
            seen.push({ origin, document });
            return "allow";
          }),
        );
        fake.checkPermission("notifications");
        fake.checkDevice("hid");
        assert.deepEqual(seen, [
          { origin: "https://example.com", document: "https://example.com/" },
          { origin: "https://example.com", document: null },
        ]);
        // The natural document-scoped grant a decider would write for the permission case must not
        // also match the device case: a document is never `null`, and `null` is never a document.
        const grantsToDocument = (event: { readonly document: string | null }) =>
          event.document === "https://example.com/";
        assert.equal(grantsToDocument(seen[0] ?? { document: null }), true);
        assert.equal(grantsToDocument(seen[1] ?? { document: null }), false);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("an opaque origin reaches a decider as null", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const fileContents = { isDestroyed: () => false, getURL: () => "file:///renderer.html" };
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const seen: Array<{ readonly origin: string | null; readonly document: string | null }> =
          [];
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(({ origin, document }) => {
            seen.push({ origin, document });
            return "deny";
          }),
        );
        // No `origin` argument: `setPermissionRequestHandler`'s own callback never passes one
        // either, so the extra origin gate (which would otherwise compare a real origin against
        // `"null"`) does not apply here — this is the same "no origin argument" path
        // `checkPermission` already exercises for the ordinary-origin case.
        fake.rawPermissionCheck(fileContents, "notifications", undefined, {
          isMainFrame: true,
          requestingUrl: "file:///renderer.html",
        });
        assert.deepEqual(seen, [{ origin: null, document: "file:///renderer.html" }]);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("two file documents are distinguishable by document and not by origin", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const rendererContents = { isDestroyed: () => false, getURL: () => "file:///renderer.html" };
  const attackerContents = { isDestroyed: () => false, getURL: () => "file:///tmp/attacker.html" };
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const seen: Array<{ readonly origin: string | null; readonly document: string | null }> =
          [];
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(({ origin, document }) => {
            seen.push({ origin, document });
            return "deny";
          }),
        );
        fake.rawPermissionCheck(rendererContents, "notifications", undefined, {
          isMainFrame: true,
          requestingUrl: "file:///renderer.html",
        });
        fake.rawPermissionCheck(attackerContents, "notifications", undefined, {
          isMainFrame: true,
          requestingUrl: "file:///tmp/attacker.html",
        });
        assert.deepEqual(seen, [
          { origin: null, document: "file:///renderer.html" },
          { origin: null, document: "file:///tmp/attacker.html" },
        ]);
        assert.equal(
          seen[0]?.origin,
          seen[1]?.origin,
          "both opaque origins are the same non-identifying null",
        );
        assert.notEqual(
          seen[0]?.document,
          seen[1]?.document,
          "the documents remain distinct, so a decider must key an opaque document by document",
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("the hard gates deny before any decider runs, even with an always-allow decider installed", async (t) => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const liveContents = { isDestroyed: () => false, getURL: () => "https://example.com/" };
  const destroyedContents = { isDestroyed: () => true, getURL: () => "https://example.com/" };
  const unparseableContents = { isDestroyed: () => false, getURL: () => "not a valid url" };
  let consulted = 0;
  // The decider's own scope stays open across every subtest below (each is its own node:test
  // assertion, not an Effect), and closes once, at the end, after the counter is checked.
  const scope = await Effect.runPromise(Scope.make());
  await Effect.runPromise(
    handle
      .decide(
        Decidables.Session.Permission,
        Decision.sync(() => {
          consulted += 1;
          return "allow";
        }),
      )
      .pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const cases: ReadonlyArray<readonly [string, () => boolean]> = [
    [
      "subframe",
      () =>
        fake.rawPermissionCheck(liveContents, "notifications", "https://example.com", {
          isMainFrame: false,
          requestingUrl: "https://example.com/",
        }),
    ],
    [
      "destroyed contents",
      () =>
        fake.rawPermissionCheck(destroyedContents, "notifications", "https://example.com", {
          isMainFrame: true,
          requestingUrl: "https://example.com/",
        }),
    ],
    [
      "null contents",
      () =>
        fake.rawPermissionCheck(null, "notifications", "https://example.com", {
          isMainFrame: true,
          requestingUrl: "https://example.com/",
        }),
    ],
    [
      "document mismatch",
      () =>
        fake.rawPermissionCheck(liveContents, "notifications", "https://example.com", {
          isMainFrame: true,
          requestingUrl: "https://other.example/",
        }),
    ],
    [
      "origin mismatch",
      () =>
        fake.rawPermissionCheck(liveContents, "notifications", "https://untrusted.example", {
          isMainFrame: true,
          requestingUrl: "https://example.com/",
        }),
    ],
    [
      "unparseable current URL",
      () =>
        fake.rawPermissionCheck(unparseableContents, "notifications", "https://example.com", {
          isMainFrame: true,
          requestingUrl: "https://example.com/",
        }),
    ],
  ];
  for (const [label, run] of cases) {
    await t.test(label, () => {
      assert.equal(run(), false, label);
    });
  }
  assert.equal(consulted, 0, "an always-allow decider must never be consulted by any of them");
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("a preconnect decider that denies prevents the connection", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
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

test("the certificate proc and the display-media handler exist only while a decider does", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  assert.equal(
    fake.hasCertificateProc(),
    false,
    "nothing calls setCertificateVerifyProc at acquisition",
  );
  assert.equal(
    fake.hasDisplayMediaHandler(),
    false,
    "nothing calls setDisplayMediaRequestHandler at acquisition",
  );
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.Certificate,
          Decision.async(() => Effect.succeed("system" as const)),
        );
        yield* handle.decide(
          Decidables.Session.DisplayMedia,
          Decision.async(() => Effect.succeed({ kind: "deny" } as const)),
        );
        assert.equal(fake.hasCertificateProc(), true, "a scoped decide calls it with a function");
        assert.equal(
          fake.hasDisplayMediaHandler(),
          true,
          "a scoped decide calls it with a function",
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(fake.hasCertificateProc(), false, "closing that scope calls it with null");
  assert.equal(fake.hasDisplayMediaHandler(), false, "closing that scope calls it with null");
});

test("a certificate decider answering trust or reject maps onto setCertificateVerifyProc's numeric callback, and no answer keeps Chromium's system verdict", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
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
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        // With a decider installed but answering neither "trust" nor "reject", the numeric mapping
        // still keeps Chromium's own verdict ("system" -> -3) — the decidable's own contract.
        yield* handle.decide(
          Decidables.Session.Certificate,
          Decision.async(() => Effect.succeed("system" as const)),
        );
        const result = yield* Effect.promise(() => fake.verifyCertificate());
        assert.equal(result, -3, 'preserving its "-3 system"');
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("a crashing certificate decider rejects", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        // A fingerprint-pinning decider with a bug in it. `Session.Certificate` declares
        // `failure: "reject"`, so this rejects (-2) rather than falling back to `"system"` (-3),
        // which would hand Chromium back a certificate the pin exists to refuse: a broken pin must
        // not silently become no pin.
        yield* handle.decide(
          Decidables.Session.Certificate,
          Decision.async(() => Effect.die(new Error("fingerprint pin boom"))),
        );
        return yield* Effect.promise(() => fake.verifyCertificate());
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(result, -2, "a broken pin rejects rather than deferring to Chromium");
});

test("a crashing preconnect decider denies the preconnect", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        // `Session.Preconnect`'s fallback allows — a session's previous default — but its declared
        // failure denies: a broken decider costs latency, not safety.
        yield* handle.decide(
          Decidables.Session.Preconnect,
          Decision.sync((): "deny" => {
            throw new Error("preconnect decider boom");
          }),
        );
        assert.equal(fake.preconnect(), true);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("a display-media decider that fails is denied, preserving internal/DisplayMedia.ts:41-45's own fallback-to-deny", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
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

test("the request handler's mediaTypes array reaches the decider as its own event field", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const seen: (readonly ("audio" | "video")[])[] = [];
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(({ mediaTypes }) => {
            seen.push(mediaTypes);
            return "allow";
          }),
        );
        yield* Effect.promise(() =>
          fake.requestPermission("media", { mediaTypes: ["audio", "video"] }),
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.deepEqual(seen, [["audio", "video"]]);
});

test("the check handler's singular mediaType reaches the decider as a one-element mediaTypes list", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const seen: (readonly ("audio" | "video")[])[] = [];
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(({ mediaTypes }) => {
            seen.push(mediaTypes);
            return "allow";
          }),
        );
        fake.checkPermission("media", { mediaType: "audio" });
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.deepEqual(seen, [["audio"]]);
});

test("an unknown media check and a non-media permission both carry an empty mediaTypes list", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const seen: (readonly ("audio" | "video")[])[] = [];
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(({ mediaTypes }) => {
            seen.push(mediaTypes);
            return "allow";
          }),
        );
        fake.checkPermission("media", { mediaType: "unknown" });
        fake.checkPermission("notifications");
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.deepEqual(seen, [[], []]);
});

test("a device check's mediaTypes is always empty", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const seen: (readonly ("audio" | "video")[])[] = [];
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.Permission,
          Decision.sync(({ mediaTypes }) => {
            seen.push(mediaTypes);
            return "allow";
          }),
        );
        fake.checkDevice("hid");
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.deepEqual(seen, [[]]);
});
