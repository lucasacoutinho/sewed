import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import type { Session as NativeSession } from "electron";
import { Cause, Effect, Schema, Stream } from "effect";
import { Certificate, Cookie, Proxy, SewedError, WebRequest } from "sewed";
import * as Testing from "sewed/testing";
// This one test's decidable and registry must come from the same module instance as each other —
// a registry keys its entries and hooks by decidable *identity*, and "sewed"'s compiled Decidables
// is a different module instance (and so a different object) than the source Decision.ts's
// internal/Session.ts consults — so it imports Decidables, Decision, and internal/Session.ts from
// ../src/ together, unlike this file's other tests, which stay on the public surface throughout.
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import { MainContext, mainIdentity } from "../src/RuntimeContext.ts";
import * as Session from "../src/internal/Session.ts";

const matches = (pattern: string, url: string) => WebRequest.compilePattern(pattern)(new URL(url));

test("match patterns follow Chromium's scheme, host, port, and path rules", () => {
  assert.equal(matches("<all_urls>", "ftp://x/y"), true);
  assert.equal(matches("*://example.com/*", "https://example.com/"), true);
  assert.equal(matches("*://example.com/*", "ftp://example.com/"), false);
  assert.equal(matches("https://*.example.com/api/*", "https://api.example.com/api/v1"), true);
  assert.equal(matches("https://*.example.com/api/*", "https://example.com/api/"), true);
  assert.equal(matches("https://*.example.com/api/*", "https://example.org/api/"), false);
  assert.equal(matches("https://*.example.com/api/*", "https://api.example.com/other"), false);
  assert.equal(matches("http://127.0.0.1:8080/*", "http://127.0.0.1:8080/x"), true);
  assert.equal(matches("http://127.0.0.1:8080/*", "http://127.0.0.1:9090/x"), false);
  assert.equal(matches("http://127.0.0.1:*/*", "http://127.0.0.1:9090/x"), true);
  assert.equal(matches("file:///*", "file:///home/x.txt"), true);
  assert.equal(matches("https://example.com/a?*", "https://example.com/a?b=1"), true);
  assert.throws(() => WebRequest.compilePattern("example.com/*"));
  assert.throws(() => WebRequest.compilePattern("https://"));
  assert.throws(() => WebRequest.compilePattern("https://example.com"));
});

test("request filters and decisions validate at the boundary", () => {
  const filter = Schema.decodeUnknownExit(WebRequest.Filter);
  assert.equal(filter({ urls: ["<all_urls>"] })._tag, "Success");
  assert.equal(filter({ urls: [] })._tag, "Failure");
  assert.equal(filter({ urls: ["nope"] })._tag, "Failure");
  assert.equal(filter({ urls: ["<all_urls>"], types: ["other"] })._tag, "Success");
  const decision = Schema.decodeUnknownExit(WebRequest.RequestDecision);
  assert.equal(decision({ kind: "redirect", url: "https://x" })._tag, "Success");
  assert.equal(decision({ kind: "rewrite" })._tag, "Failure");
});

test("request events carry their stage and the request fields", () => {
  const decode = Schema.decodeUnknownExit(WebRequest.Event);
  const base = {
    id: 1,
    url: "https://example.com/",
    method: "GET",
    resourceType: "xhr",
    referrer: "",
    timestamp: 0,
  };
  assert.equal(decode({ ...base, stage: "sent", headers: { a: "b" } })._tag, "Success");
  assert.equal(
    decode({ ...base, stage: "completed", statusCode: 200, statusLine: "OK", fromCache: false })
      ._tag,
    "Success",
  );
  assert.equal(decode({ ...base, stage: "started" })._tag, "Failure");
});

test("session policies keep their closed sets", () => {
  const proxy = Schema.decodeUnknownExit(Proxy.Config);
  assert.equal(proxy({ mode: "direct" })._tag, "Success");
  assert.equal(proxy({ mode: "fixed_servers", proxyRules: "" })._tag, "Failure");
  const certificates = Schema.decodeUnknownExit(Certificate.Rules);
  assert.equal(certificates([{ hostname: "a.example", trust: "always" }])._tag, "Success");
  assert.equal(certificates([{ hostname: "", trust: "always" }])._tag, "Failure");
  const cookies = Schema.decodeUnknownExit(Cookie.Policy);
  assert.equal(cookies([{ kind: "origin", origin: "https://example.com" }])._tag, "Success");
  assert.equal(cookies([{ kind: "document", url: "https://example.com/a" }])._tag, "Failure");
  const tags = [...Cookie.protocol.requests.keys()].sort();
  assert.deepEqual(tags, ["changes", "flush", "get", "remove", "set"]);
});

type DisplayMediaHandler = (
  request: Record<string, unknown>,
  callback: (streams: unknown) => void,
) => void;

/**
 * A structural session exposing only what `Session.fromNative` calls unconditionally at acquisition
 * (every handler setter, plus `on` for its "preconnect" listener) and what this test drives:
 * `setDisplayMediaRequestHandler`. Mirrors `decidables-session.test.ts`'s own fake, trimmed to this
 * one decidable.
 */
const fakeDisplayMediaSession = () => {
  let handler: DisplayMediaHandler | undefined;
  const structural = {
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: () => {},
    setCertificateVerifyProc: () => {},
    setDisplayMediaRequestHandler: (value: DisplayMediaHandler | null) => {
      handler = value ?? undefined;
    },
    on: () => {},
  };
  return {
    // Test-only bridge: `internal/Session.ts` reads a native session's members structurally, and
    // Electron's own `Session` class is not loadable in Node.
    native: structural as unknown as NativeSession,
    request: (overrides: Record<string, unknown> = {}) =>
      new Promise<unknown>((resolve) => {
        assert.ok(handler !== undefined, "no display media handler installed");
        handler(
          {
            securityOrigin: "file:///page.html",
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

test("an opaque screen-share origin reaches a decider as null", async () => {
  const fake = fakeDisplayMediaSession();
  const session = Session.fromNative(fake.native);
  const seen: { origin?: string | null } = {};
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* session.decide(
          Decidables.Session.DisplayMedia,
          Decision.async((event) => {
            seen.origin = event.origin;
            return Effect.succeed({ kind: "deny" as const });
          }),
        );
        yield* Effect.promise(() => fake.request({ securityOrigin: "file:///page.html" }));
      }),
    ).pipe(Effect.provideService(MainContext, mainIdentity)),
  );
  assert.equal(seen.origin, null);
});

describe("Cookie capability", () => {
  const policy: Cookie.Policy = [{ kind: "origin", origin: "https://app.example" }];

  // The memory Layer runs the same policy the native Layer carries, so these are the rules a
  // renderer reaching the served capability obeys too. Only the core differs: the native Layer
  // threads an acquired session, this one stands in for it.
  const use = <A, E>(
    rules: Cookie.Policy,
    body: (cookies: (typeof Cookie.capability)["Service"]) => Effect.Effect<A, E, never>,
  ) =>
    Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function* () {
          const cookies = yield* Cookie.capability;
          const value = yield* body(cookies);
          const recorder = yield* Testing.Recorder;
          return { value, calls: yield* recorder.calls };
        }).pipe(Effect.provide(Testing.Cookies.memory(rules))),
      ),
    );

  it("reads cookies for a URL inside the policy", async () => {
    const exit = await use(policy, (cookies) =>
      cookies.get({ filter: { url: "https://app.example/" } }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(
      exit.value.value.map((cookie) => cookie.name),
      ["session"],
    );
  });

  it("fails with Protocol for a URL outside the policy", async () => {
    const exit = await use(policy, (cookies) =>
      Effect.flip(cookies.get({ filter: { url: "https://other.example/" } })),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(exit.value.value.message, "Cookie URL is outside the capability's policy");
  });

  it("fails with Protocol for a filter that names no URL", async () => {
    const exit = await use(policy, (cookies) => Effect.flip(cookies.get({ filter: {} })));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
  });

  it("sets and removes inside the policy and denies outside it", async () => {
    const allowed = await use(policy, (cookies) =>
      Effect.gen(function* () {
        yield* cookies.set({
          details: { url: "https://app.example/", name: "session", value: "1" },
        });
        yield* cookies.remove({ url: "https://app.example/", name: "session" });
      }),
    );
    assert.equal(allowed._tag, "Success");
    const denied = await use(policy, (cookies) =>
      Effect.flip(
        cookies.set({ details: { url: "https://other.example/", name: "x", value: "y" } }),
      ),
    );
    assert.equal(denied._tag, "Success");
    if (denied._tag !== "Success") return;
    assert.equal(denied.value.value.code, "Protocol");
  });

  it("streams only changes whose cookie belongs to a policy origin", async () => {
    const exit = await use(policy, (cookies) => Stream.runCollect(cookies.changes()));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(
      [...exit.value.value].map((change) => change.cookie.name),
      ["session"],
    );
  });

  it("flushes without asking the policy", async () => {
    const exit = await use(policy, (cookies) => cookies.flush());
    assert.equal(exit._tag, "Success");
  });

  it("records every call with its tag and payload, denials included", async () => {
    const exit = await use(policy, (cookies) =>
      Effect.gen(function* () {
        yield* cookies.get({ filter: { url: "https://app.example/" } });
        yield* Effect.flip(cookies.get({ filter: { url: "https://other.example/" } }));
        yield* cookies.flush();
      }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [
      { tag: "get", payload: { filter: { url: "https://app.example/" } } },
      { tag: "get", payload: { filter: { url: "https://other.example/" } } },
      { tag: "flush", payload: undefined },
    ]);
  });

  it("refuses a policy outside the origin rules when the Layer is built", async () => {
    const invalid = [
      { kind: "document", url: "https://app.example/page" },
    ] as unknown as Cookie.Policy;
    const exit = await Effect.runPromiseExit(
      Effect.scoped(Cookie.capability.pipe(Effect.provide(Testing.Cookies.memory(invalid)))),
    );
    assert.equal(exit._tag, "Failure");
    if (exit._tag !== "Failure") return;
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof SewedError, String(error));
    assert.equal(error.code, "Protocol");
    assert.equal(error.message, "Invalid cookie policy");
  });
});
