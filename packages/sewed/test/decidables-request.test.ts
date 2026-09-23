import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Testing from "../src/Testing.ts";
import * as ContentsRegistry from "../src/internal/ContentsRegistry.ts";
import * as Native from "../src/internal/Session.ts";
import type { MainContext } from "../src/RuntimeContext.ts";
import type { SewedError } from "../src/SewedError.ts";
import type * as WebRequest from "../src/WebRequest.ts";
import { fakeSession } from "./fake-session.ts";
import { waitUntil } from "./wait.ts";

/**
 * Task 7c: `Session.intercept(handle, rules)` — one all-or-nothing `Rules<R>` bundle of three
 * optional stage callbacks behind a single filter — became three independent decidables, each
 * installed with its own filter through `session.intercept(decidable, filter, decider)`. Every
 * property the free function had is re-established here against the new door, plus the two the
 * bundle could not express: one feature removing its request decider leaves another feature's
 * header decider installed, and two header deciders both land.
 */

const sentHeaders = { accept: "*/*" };
const receivedHeaders = { "content-type": ["text/html"] };
const responseDetails = {
  statusLine: "HTTP/1.1 200 OK",
  statusCode: 200,
  responseHeaders: receivedHeaders,
};
const everything: WebRequest.Filter = { urls: ["<all_urls>"] };

/** Runs one scoped program against a fresh handle over a fresh structural session. */
const withSession = <A, E>(
  fake: ReturnType<typeof fakeSession>,
  body: (handle: Native.Handle) => Effect.Effect<A, E, MainContext | Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(body(Native.fromNative(fake.native))).pipe(Effect.provide(Testing.main)),
  );

/** Waits for a condition instead of a duration; node:test's own timeout is the only deadline. */
const until = async (ready: () => boolean) => {
  while (!ready()) await new Promise((resolve) => setImmediate(resolve));
};

/** The error a refused install failed with, or `undefined` if it was not refused at all. */
const refusal = <A>(install: Effect.Effect<A, SewedError, MainContext | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(install).pipe(
      Effect.as(undefined),
      Effect.catch((error: SewedError) => Effect.succeed(error)),
      Effect.provide(Testing.main),
    ),
  );

/**
 * Task 7 (final-review.md, M-B1 and section B): the fake session gained `refuse`, so the sequences
 * below drive a registration Electron refuses through `internal/WebRequest.ts`'s rollback and
 * restore with no Electron at all — the intercept path's own acquire/restore, a double failure
 * where the restore itself is refused, a release whose own reinstall is refused, and the same shape
 * on `observe`'s taps. Each installs a `Decidables.Session.Request` decider in a scope the test
 * controls explicitly, since a refused install elsewhere in the same session has to be triggered,
 * rolled back, and reinstalled across several separate steps that one `Effect.scoped` block cannot
 * express on its own.
 */
const installRequest = (
  handle: Native.Handle,
  scope: Scope.Scope,
  filter: WebRequest.Filter,
  decider: Decision.Decider<WebRequest.RequestEvent, WebRequest.RequestDecision, never>,
) =>
  Effect.runPromise(
    handle
      .intercept(Decidables.Session.Request, filter, decider)
      .pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );

/**
 * Captures the default logger's own console output around one call. Copied from
 * `lifecycle.test.ts`'s own helper rather than shared: `Effect.runFork`'s fiber runs on the default
 * runtime, not whatever context the calling test's own Effect graph carries, so only swapping
 * `console.log`/`console.error` themselves reaches it. Bounded to one test by the `finally` block;
 * `node --test` gives each test file its own process regardless.
 */
const captureConsole = async (
  body: (lines: readonly string[]) => Promise<void>,
): Promise<readonly string[]> => {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const record = (...args: readonly unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.log = record;
  console.error = record;
  try {
    await body(lines);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return lines;
};

test("each request stage decides independently, and a stage nobody installed on has no native listener", async () => {
  const fake = fakeSession();
  const seen: string[] = [];
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        everything,
        Decision.sync(() => {
          seen.push("request");
          return { kind: "block" };
        }),
      );
      // Loose on purpose. `reinstall` converges all three stages, so this reads `null` today rather
      // than `undefined`, but "never registered" and "explicitly uninstalled" are the same fact to
      // Electron, and this test's own name is true under both — a stricter assertion would block a
      // `reinstall` that skipped unchanged stages without protecting anything. The strict `null`
      // lives in the union test below, where the 1→0 edge genuinely has to uninstall a listener
      // that was there.
      assert.ok(
        fake.listeners.get("onBeforeSendHeaders") == null,
        "a stage nobody installed on has no native listener",
      );
      assert.deepEqual(yield* Effect.promise(() => fake.fire("onBeforeRequest")), { cancel: true });
      yield* handle.intercept(
        Decidables.Session.ResponseHeaders,
        everything,
        Decision.sync(() => {
          seen.push("responseHeaders");
          return Decision.Pass;
        }),
      );
      assert.deepEqual(
        yield* Effect.promise(() => fake.fire("onHeadersReceived", responseDetails)),
        {},
      );
      assert.deepEqual(seen, ["request", "responseHeaders"], "neither decider saw the other stage");
    }),
  );
});

test("two request deciders compose restrictively, so block beats redirect beats allow", async (t) => {
  const answers: Record<string, WebRequest.RequestDecision> = {
    block: { kind: "block" },
    redirect: { kind: "redirect", url: "https://elsewhere.example/" },
    allow: { kind: "allow" },
  };
  const cases = [
    ["block then redirect", "block", "redirect", { cancel: true }],
    ["redirect then block", "redirect", "block", { cancel: true }],
    ["redirect then allow", "redirect", "allow", { redirectURL: "https://elsewhere.example/" }],
    ["allow then redirect", "allow", "redirect", { redirectURL: "https://elsewhere.example/" }],
    ["block then allow", "block", "allow", { cancel: true }],
    ["allow then allow", "allow", "allow", {}],
  ] as const;
  for (const [label, first, second, expected] of cases)
    await t.test(label, async () => {
      const fake = fakeSession();
      await withSession(fake, (handle) =>
        Effect.gen(function* () {
          for (const which of [first, second])
            yield* handle.intercept(
              Decidables.Session.Request,
              everything,
              Decision.sync(() => answers[which] ?? { kind: "allow" }),
            );
          assert.deepEqual(yield* Effect.promise(() => fake.fire("onBeforeRequest")), expected);
        }),
      );
    });
});

test("two request-header deciders chain, so each sees the headers the previous one produced", async () => {
  const fake = fakeSession();
  const secondSaw: Record<string, string>[] = [];
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.RequestHeaders,
        everything,
        Decision.sync(({ headers }) => ({ kind: "headers", headers: { ...headers, "x-a": "1" } })),
      );
      yield* handle.intercept(
        Decidables.Session.RequestHeaders,
        everything,
        Decision.sync(({ headers }) => {
          secondSaw.push({ ...headers });
          return { kind: "headers", headers: { ...headers, "x-b": "2" } };
        }),
      );
      assert.deepEqual(
        yield* Effect.promise(() =>
          fake.fire("onBeforeSendHeaders", { requestHeaders: sentHeaders }),
        ),
        { requestHeaders: { ...sentHeaders, "x-a": "1", "x-b": "2" } },
        "both features' headers land; a ranking would have kept only one of them",
      );
      assert.deepEqual(
        secondSaw,
        [{ ...sentHeaders, "x-a": "1" }],
        "the second decider was handed what the first produced, not the original headers",
      );
    }),
  );
});

test("a block from either header decider ends the chain, leaving the rest unconsulted", async (t) => {
  const cases = [
    ["the first decider blocks", 0, [0]],
    ["the second decider blocks", 1, [0, 1]],
  ] as const;
  for (const [label, blocker, expected] of cases)
    await t.test(label, async () => {
      const fake = fakeSession();
      const consulted: number[] = [];
      await withSession(fake, (handle) =>
        Effect.gen(function* () {
          for (const index of [0, 1] as const)
            yield* handle.intercept(
              Decidables.Session.RequestHeaders,
              everything,
              Decision.sync(({ headers }) => {
                consulted.push(index);
                return index === blocker ? { kind: "block" } : { kind: "headers", headers };
              }),
            );
          assert.deepEqual(
            yield* Effect.promise(() =>
              fake.fire("onBeforeSendHeaders", { requestHeaders: sentHeaders }),
            ),
            { cancel: true },
          );
          assert.deepEqual(
            consulted,
            [...expected],
            "a stopped chain consults nobody after the answer that stopped it",
          );
        }),
      );
    });
});

test("a response statusLine set by one decider survives a later decider that sets only headers", async () => {
  const fake = fakeSession();
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.ResponseHeaders,
        everything,
        Decision.sync(({ headers }) => ({
          kind: "headers",
          headers,
          statusLine: "HTTP/1.1 418 I am a teapot",
        })),
      );
      yield* handle.intercept(
        Decidables.Session.ResponseHeaders,
        everything,
        Decision.sync(({ headers }) => ({
          kind: "headers",
          headers: { ...headers, "x-b": ["2"] },
        })),
      );
      assert.deepEqual(
        yield* Effect.promise(() => fake.fire("onHeadersReceived", responseDetails)),
        {
          responseHeaders: { ...receivedHeaders, "x-b": ["2"] },
          statusLine: "HTTP/1.1 418 I am a teapot",
        },
      );
    }),
  );
});

test("a decider only sees the requests its own filter selects", async () => {
  const fake = fakeSession();
  const seen: string[] = [];
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        { urls: ["https://a.example/*"] },
        Decision.sync(({ url }) => {
          seen.push(`urls:${url}`);
          return { kind: "block" };
        }),
      );
      yield* handle.intercept(
        Decidables.Session.Request,
        { urls: ["<all_urls>"], types: ["script"] },
        Decision.sync(({ url }) => {
          seen.push(`types:${url}`);
          return { kind: "block" };
        }),
      );
      assert.deepEqual(
        yield* Effect.promise(() =>
          fake.fire("onBeforeRequest", { url: "https://a.example/one", resourceType: "xhr" }),
        ),
        { cancel: true },
        "the url pattern selects it",
      );
      assert.deepEqual(
        yield* Effect.promise(() =>
          fake.fire("onBeforeRequest", { url: "https://b.example/two", resourceType: "xhr" }),
        ),
        {},
        "neither filter selects it, so nobody decides and the fallback allows",
      );
      assert.deepEqual(
        yield* Effect.promise(() =>
          fake.fire("onBeforeRequest", { url: "https://b.example/x.js", resourceType: "script" }),
        ),
        { cancel: true },
        "the resource type selects it",
      );
      assert.deepEqual(seen, ["urls:https://a.example/one", "types:https://b.example/x.js"]);
    }),
  );
});

test("one native listener per stage covers the union of the installed filters, recomputed on every install and removal", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const outer = Effect.runSync(Scope.make());
  const inner = Effect.runSync(Scope.make());
  const install = (scope: Scope.Scope, filter: WebRequest.Filter) =>
    Effect.runPromise(
      handle
        .intercept(Decidables.Session.Request, filter, Decision.pass)
        .pipe(Scope.provide(scope), Effect.provide(Testing.main)),
    );
  assert.equal(fake.filterFor("onBeforeRequest"), undefined, "nothing installed, nothing set");
  await install(outer, { urls: ["https://a.example/*"], types: ["xhr"] });
  assert.deepEqual(fake.filterFor("onBeforeRequest"), {
    urls: ["https://a.example/*"],
    types: ["xhr"],
  });
  await install(inner, { urls: ["https://b.example/*"], types: ["script"] });
  assert.deepEqual(
    fake.filterFor("onBeforeRequest"),
    { urls: ["https://a.example/*", "https://b.example/*"], types: ["xhr", "script"] },
    "the union of both, recomputed on the second install",
  );
  await Effect.runPromise(Scope.close(inner, Exit.void));
  assert.deepEqual(
    fake.filterFor("onBeforeRequest"),
    { urls: ["https://a.example/*"], types: ["xhr"] },
    "and recomputed again on removal",
  );
  await Effect.runPromise(Scope.close(outer, Exit.void));
  assert.equal(
    fake.filterFor("onBeforeRequest"),
    null,
    "a stage with no decider left is set back to null",
  );
});

test("an install whose filter names no resource types widens the union to every type", async () => {
  const fake = fakeSession();
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        { urls: ["https://a.example/*"], types: ["xhr"] },
        Decision.pass,
      );
      yield* handle.intercept(
        Decidables.Session.Request,
        { urls: ["https://b.example/*"] },
        Decision.pass,
      );
      assert.deepEqual(fake.filterFor("onBeforeRequest"), {
        urls: ["https://a.example/*", "https://b.example/*"],
      });
    }),
  );
});

test("removing one stage's decider leaves another stage's installed, which one Rules bundle could not do", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const blocking = Effect.runSync(Scope.make());
  const rewriting = Effect.runSync(Scope.make());
  await Effect.runPromise(
    handle
      .intercept(
        Decidables.Session.Request,
        everything,
        Decision.sync(() => ({ kind: "block" })),
      )
      .pipe(Scope.provide(blocking), Effect.provide(Testing.main)),
  );
  await Effect.runPromise(
    handle
      .intercept(
        Decidables.Session.RequestHeaders,
        everything,
        Decision.sync(({ headers }) => ({ kind: "headers", headers: { ...headers, "x-b": "1" } })),
      )
      .pipe(Scope.provide(rewriting), Effect.provide(Testing.main)),
  );
  assert.deepEqual(await fake.fire("onBeforeRequest"), { cancel: true });
  await Effect.runPromise(Scope.close(blocking, Exit.void));
  assert.equal(fake.filterFor("onBeforeRequest"), null, "the blocking feature is gone");
  assert.deepEqual(
    await fake.fire("onBeforeSendHeaders", { requestHeaders: sentHeaders }),
    { requestHeaders: { ...sentHeaders, "x-b": "1" } },
    "the rewriting feature never asked to be removed and still decides",
  );
  await Effect.runPromise(Scope.close(rewriting, Exit.void));
});

test("a decider that fails blocks its request on every stage", async (t) => {
  await t.test("request", async () => {
    const fake = fakeSession();
    const answer = await withSession(fake, (handle) =>
      Effect.gen(function* () {
        yield* handle.intercept(
          Decidables.Session.Request,
          everything,
          Decision.sync(() => {
            throw new Error("request decider boom");
          }),
        );
        return yield* Effect.promise(() => fake.fire("onBeforeRequest"));
      }),
    );
    assert.deepEqual(answer, { cancel: true }, "the declared failure blocks; the fallback allows");
  });
  await t.test("requestHeaders", async () => {
    const fake = fakeSession();
    const answer = await withSession(fake, (handle) =>
      Effect.gen(function* () {
        yield* handle.intercept(
          Decidables.Session.RequestHeaders,
          everything,
          Decision.async(() => Effect.die(new Error("request header decider boom"))),
        );
        return yield* Effect.promise(() =>
          fake.fire("onBeforeSendHeaders", { requestHeaders: sentHeaders }),
        );
      }),
    );
    assert.deepEqual(answer, { cancel: true }, "a chain's declared failure is also a stop answer");
  });
  await t.test("responseHeaders", async () => {
    const fake = fakeSession();
    const answer = await withSession(fake, (handle) =>
      Effect.gen(function* () {
        yield* handle.intercept(
          Decidables.Session.ResponseHeaders,
          everything,
          Decision.async(() => Effect.die(new Error("response header decider boom"))),
        );
        return yield* Effect.promise(() => fake.fire("onHeadersReceived", responseDetails));
      }),
    );
    assert.deepEqual(answer, { cancel: true });
  });
  // The third way to fail, and the one an author is likeliest to reach by accident: a typo'd `kind`.
  // `Decidables.ts` and the guide both promise it counts as a failed decider on every stage, and it
  // is the case that used to be dropped silently, leaving a fail-closed stage answering its own
  // fallback. The answer is off-schema, so the decider is annotated to the stage's own answer type
  // rather than inferred — the type refuses this spelling, which is exactly the point.
  await t.test("off-schema on every stage", async (inner) => {
    const nonsense = () => Effect.succeed({ kind: "nonsense" });
    await inner.test("request", async () => {
      const fake = fakeSession();
      const answer = await withSession(fake, (handle) =>
        Effect.gen(function* () {
          yield* handle.intercept(
            Decidables.Session.Request,
            everything,
            Decision.async<WebRequest.RequestEvent, WebRequest.RequestDecision, never>(nonsense),
          );
          return yield* Effect.promise(() => fake.fire("onBeforeRequest"));
        }),
      );
      assert.deepEqual(
        answer,
        { cancel: true },
        "an answer the schema rejects is a failed decider",
      );
    });
    await inner.test("requestHeaders", async () => {
      const fake = fakeSession();
      const answer = await withSession(fake, (handle) =>
        Effect.gen(function* () {
          yield* handle.intercept(
            Decidables.Session.RequestHeaders,
            everything,
            Decision.async<WebRequest.RequestHeaders, WebRequest.RequestHeadersDecision, never>(
              nonsense,
            ),
          );
          return yield* Effect.promise(() =>
            fake.fire("onBeforeSendHeaders", { requestHeaders: sentHeaders }),
          );
        }),
      );
      assert.deepEqual(answer, { cancel: true });
    });
    await inner.test("responseHeaders", async () => {
      const fake = fakeSession();
      const answer = await withSession(fake, (handle) =>
        Effect.gen(function* () {
          yield* handle.intercept(
            Decidables.Session.ResponseHeaders,
            everything,
            Decision.async<WebRequest.Response, WebRequest.ResponseDecision, never>(nonsense),
          );
          return yield* Effect.promise(() => fake.fire("onHeadersReceived", responseDetails));
        }),
      );
      assert.deepEqual(answer, { cancel: true });
    });
  });
});

test("a decider with no opinion passes, and the request reaches Electron unchanged", async () => {
  const fake = fakeSession();
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(Decidables.Session.Request, everything, Decision.pass);
      yield* handle.intercept(Decidables.Session.RequestHeaders, everything, Decision.pass);
      yield* handle.intercept(Decidables.Session.ResponseHeaders, everything, Decision.pass);
      assert.deepEqual(yield* Effect.promise(() => fake.fire("onBeforeRequest")), {});
      assert.deepEqual(
        yield* Effect.promise(() =>
          fake.fire("onBeforeSendHeaders", { requestHeaders: sentHeaders }),
        ),
        {},
        "nobody changed the headers, so Electron is told nothing changed rather than handed them back",
      );
      assert.deepEqual(
        yield* Effect.promise(() => fake.fire("onHeadersReceived", responseDetails)),
        {},
      );
    }),
  );
});

test("a request carries the Sewed handle id of the contents that issued it", async () => {
  const fake = fakeSession();
  const release = ContentsRegistry.register(41, "guest-1");
  const seen: unknown[] = [];
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        everything,
        Decision.sync(({ sourceId }) => {
          seen.push(sourceId);
          return Decision.Pass;
        }),
      );
      assert.deepEqual(
        yield* Effect.promise(() => fake.fire("onBeforeRequest", { webContentsId: 41 })),
        {},
      );
      yield* Effect.promise(() => fake.fire("onBeforeRequest", { webContentsId: 42 }));
      assert.deepEqual(seen, ["guest-1", undefined]);
    }),
  );
  release();
});

test("a request decider receives a body only when its own filter asked for one", async () => {
  const fake = fakeSession({ "blob-1": new Uint8Array(Buffer.from("hello")) });
  const bodies: unknown[] = [];
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        { urls: ["<all_urls>"], body: { maxBytes: 1024, blobs: "resolve" } },
        Decision.sync(({ body }) => {
          bodies.push(body);
          return Decision.Pass;
        }),
      );
      yield* handle.intercept(
        Decidables.Session.Request,
        everything,
        Decision.sync(({ body }) => {
          bodies.push(body);
          return Decision.Pass;
        }),
      );
      yield* Effect.promise(() =>
        fake.fire("onBeforeRequest", {
          uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }],
        }),
      );
      yield* Effect.promise(() => fake.fire("onBeforeRequest", {}));
      assert.deepEqual(bodies, [
        {
          // A resolved blob keeps its id beside its bytes (Ruling 3): "blob", not the anonymous
          // "bytes" kind a plain upload part gets.
          parts: [{ kind: "blob", id: "blob-1", bytes: new Uint8Array(Buffer.from("hello")) }],
          bytes: 5,
          truncated: false,
        },
        undefined,
        { parts: [], bytes: 0, truncated: false },
        undefined,
      ]);
    }),
  );
});

test("a blob is read once per request however many installs ask for a body", async () => {
  const fake = fakeSession({ "blob-1": new Uint8Array(Buffer.from("hello")) });
  const upload = { uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }] };
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      for (const _ of [0, 1])
        yield* handle.intercept(
          Decidables.Session.Request,
          { urls: ["<all_urls>"], body: { maxBytes: 1024, blobs: "resolve" } },
          Decision.pass,
        );
      yield* Effect.promise(() => fake.fire("onBeforeRequest", upload));
      assert.equal(fake.blobReads(), 1, "two installs asked for a body; the blob was read once");
      yield* Effect.promise(() => fake.fire("onBeforeRequest", upload));
      assert.equal(fake.blobReads(), 2, "and the cache does not leak across requests");
    }),
  );
});

test("a blob the session cannot read blocks the request like a failed decider", async () => {
  const fake = fakeSession();
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        { urls: ["<all_urls>"], body: { maxBytes: 1024, blobs: "resolve" } },
        Decision.sync(() => ({ kind: "allow" })),
      );
      assert.deepEqual(
        yield* Effect.promise(() =>
          fake.fire("onBeforeRequest", {
            uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "missing" }],
          }),
        ),
        { cancel: true },
      );
    }),
  );
});

test("readBody sees the parts under the default bound, even when the install named no body option", async () => {
  const fake = fakeSession({ "blob-1": new Uint8Array(Buffer.from("hello")) });
  const seen: unknown[] = [];
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        everything,
        Decision.async((request) =>
          Effect.map(request.readBody(), (body) => {
            seen.push(body);
            return Decision.Pass;
          }),
        ),
      );
      yield* Effect.promise(() =>
        fake.fire("onBeforeRequest", {
          uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }],
        }),
      );
      // The fixed default is `{ maxBytes: 3_000_000, blobs: "reference" }`: the blob stays a
      // reference, uncounted, exactly as `assembleBody`'s own reference mode leaves it.
      assert.deepEqual(seen, [
        { parts: [{ kind: "blob", id: "blob-1" }], bytes: 0, truncated: false },
      ]);
    }),
  );
});

test("readBody called with no options defaults to the install's own body filter, not the fixed default", async () => {
  const fake = fakeSession({ "blob-1": new Uint8Array(Buffer.from("hi")) });
  const seen: unknown[] = [];
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        { urls: ["<all_urls>"], body: { maxBytes: 1024, blobs: "resolve" } },
        Decision.async((request) =>
          Effect.map(request.readBody(), (body) => {
            seen.push(body);
            return Decision.Pass;
          }),
        ),
      );
      yield* Effect.promise(() =>
        fake.fire("onBeforeRequest", {
          uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }],
        }),
      );
      // The install named `blobs: "resolve"`: readBody() with no arguments follows it, not the
      // fixed default's "reference" — proving the per-install default, not the global one, applied.
      assert.deepEqual(seen, [
        {
          parts: [{ kind: "blob", id: "blob-1", bytes: new Uint8Array(Buffer.from("hi")) }],
          bytes: 2,
          truncated: false,
        },
      ]);
    }),
  );
});

test("readBody's own blobs option resolves or keeps a reference, independently of the install's", async () => {
  const fake = fakeSession({ "blob-1": new Uint8Array(Buffer.from("hi")) });
  const seen: unknown[] = [];
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        everything,
        Decision.async((request) =>
          Effect.gen(function* () {
            seen.push(yield* request.readBody({ maxBytes: 1024, blobs: "reference" }));
            seen.push(yield* request.readBody({ maxBytes: 1024, blobs: "resolve" }));
            return Decision.Pass;
          }),
        ),
      );
      yield* Effect.promise(() =>
        fake.fire("onBeforeRequest", {
          uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }],
        }),
      );
      assert.deepEqual(seen, [
        { parts: [{ kind: "blob", id: "blob-1" }], bytes: 0, truncated: false },
        {
          parts: [{ kind: "blob", id: "blob-1", bytes: new Uint8Array(Buffer.from("hi")) }],
          bytes: 2,
          truncated: false,
        },
      ]);
    }),
  );
});

test("readBody fails Limit when the assembled body would exceed the bound given", async () => {
  const fake = fakeSession();
  let failure: SewedError | undefined;
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      yield* handle.intercept(
        Decidables.Session.Request,
        everything,
        Decision.async((request) =>
          request.readBody({ maxBytes: 4 }).pipe(
            Effect.as(Decision.Pass),
            Effect.catch((error: SewedError) => {
              failure = error;
              return Effect.succeed(Decision.Pass);
            }),
          ),
        ),
      );
      yield* Effect.promise(() =>
        fake.fire("onBeforeRequest", { uploadData: [{ bytes: Buffer.from("12345") }] }),
      );
    }),
  );
  assert.equal(failure?.code, "Limit");
});

test("a body option on a header stage is refused rather than ignored", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const error = await refusal(
    handle.intercept(
      Decidables.Session.RequestHeaders,
      { urls: ["<all_urls>"], body: { maxBytes: 16, blobs: "resolve" } },
      Decision.pass,
    ),
  );
  assert.ok(error !== undefined, "a body a stage cannot carry is a refusal, not a no-op");
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /session\/request-headers/);
  assert.equal(fake.filterFor("onBeforeSendHeaders"), undefined, "and nothing was installed");
});

test("a decidable that is not one of the three request stages is refused", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  // `owner: "requests"` and a `session/` key are all the type and the declaration check ask for, so
  // a fourth request decidable declares cleanly — and no native listener would ever resolve it.
  const Invented = Decision.decidable({
    key: "session/invented-stage",
    owner: "requests",
    event: Schema.Struct({ url: Schema.String }),
    answer: Schema.Literals(["allow", "block"]),
    fallback: "allow",
    failure: "block",
    timing: "async",
    composition: "restrictive",
    order: ["block", "allow"],
  });
  const error = await refusal(
    handle.intercept(
      Invented,
      everything,
      Decision.sync(() => "block"),
    ),
  );
  assert.ok(
    error !== undefined,
    "a decidable no native listener resolves must be refused, not installed inert",
  );
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /session\/invented-stage/);
  assert.equal(fake.filterFor("onBeforeRequest"), undefined, "and nothing was installed");
});

test("the requests observation stream keeps working alongside interception", async () => {
  const fake = fakeSession();
  await withSession(fake, (handle) =>
    Effect.gen(function* () {
      const observing = yield* handle
        .requests(everything)
        .pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped);
      yield* Effect.promise(() => until(() => fake.listeners.get("onSendHeaders") != null));
      // Installed *after* the tap on purpose: the deciders and the taps share one session, and
      // recomputing one stage's listeners must not clear the other's.
      yield* handle.intercept(
        Decidables.Session.Request,
        everything,
        Decision.sync(() => ({ kind: "block" })),
      );
      assert.deepEqual(yield* Effect.promise(() => fake.fire("onBeforeRequest")), {
        cancel: true,
      });
      yield* Effect.sync(() => fake.emit("onSendHeaders", { requestHeaders: sentHeaders }));
      const [event] = [...(yield* Fiber.join(observing))];
      assert.equal(event?.stage, "sent", "the taps are a separate registry on the same session");
    }),
  );
});

test("(a) a refused install on the intercept path rolls back, and the decider it would have clobbered still decides", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const outer = Effect.runSync(Scope.make());
  await installRequest(
    handle,
    outer,
    everything,
    Decision.sync(() => ({ kind: "block" })),
  );
  let calls = 0;
  const refusedBy = new Error("Electron refused C's filter");
  fake.refuse("onBeforeRequest", () => {
    calls += 1;
    return calls === 1 ? refusedBy : undefined;
  });
  const error = await refusal(
    handle.intercept(Decidables.Session.Request, { urls: ["https://c.example/*"] }, Decision.pass),
  );
  assert.ok(error !== undefined, "the refused install must fail, not install inert");
  assert.equal(error.code, "Native");
  assert.equal(error.cause, refusedBy, "the caller's error carries the fake's own refusal cause");
  // "A still decides": checked first, so a restore that never ran fails here rather than at a
  // filterFor/listener assertion the clobber would also have broken.
  assert.deepEqual(
    await fake.fire("onBeforeRequest"),
    { cancel: true },
    "A still decides after the refused install rolled back",
  );
  assert.deepEqual(
    fake.filterFor("onBeforeRequest"),
    { urls: ["<all_urls>"] },
    "the restore re-registered A's own filter, not the refused union",
  );
  assert.ok(fake.listeners.get("onBeforeRequest") != null, "A's native listener is back");
  await Effect.runPromise(Scope.close(outer, Exit.void));
});

test("(b) a good install after a refused one joins the union, and both A and D decide", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const outer = Effect.runSync(Scope.make());
  await installRequest(
    handle,
    outer,
    { urls: ["https://a.example/*"] },
    Decision.sync(() => ({ kind: "block" })),
  );
  let calls = 0;
  fake.refuse("onBeforeRequest", () => {
    calls += 1;
    return calls === 1 ? new Error("Electron refused C's filter") : undefined;
  });
  const cError = await refusal(
    handle.intercept(Decidables.Session.Request, { urls: ["https://c.example/*"] }, Decision.pass),
  );
  assert.ok(cError !== undefined, "C's install is refused, same as sequence (a)");
  const dScope = Effect.runSync(Scope.make());
  const dDecided: string[] = [];
  await installRequest(
    handle,
    dScope,
    { urls: ["https://d.example/*"] },
    Decision.sync(({ url }) => {
      dDecided.push(url);
      return { kind: "block" };
    }),
  );
  assert.deepEqual(
    fake.filterFor("onBeforeRequest"),
    { urls: ["https://a.example/*", "https://d.example/*"] },
    "D joins A in the union after the refused install rolled back",
  );
  assert.deepEqual(
    await fake.fire("onBeforeRequest", { url: "https://a.example/one" }),
    { cancel: true },
    "A still decides its own urls",
  );
  assert.deepEqual(
    await fake.fire("onBeforeRequest", { url: "https://d.example/two" }),
    { cancel: true },
    "D decides its own urls",
  );
  assert.deepEqual(dDecided, ["https://d.example/two"], "D was consulted for its own request only");
  await Effect.runPromise(Scope.close(dScope, Exit.void));
  await Effect.runPromise(Scope.close(outer, Exit.void));
});

test("(c) a double failure still surfaces the original refusal, logs the restore's own failure, and the next install self-heals", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const outer = Effect.runSync(Scope.make());
  await installRequest(
    handle,
    outer,
    { urls: ["https://a.example/*"] },
    Decision.sync(() => ({ kind: "block" })),
  );
  let calls = 0;
  const refusedC = new Error("Electron refused C's filter");
  fake.refuse("onBeforeRequest", () => {
    calls += 1;
    if (calls === 1) return refusedC;
    if (calls === 2) return new Error("Electron refused the restore too");
    return undefined;
  });
  const lines = await captureConsole(async (logged) => {
    const error = await refusal(
      handle.intercept(
        Decidables.Session.Request,
        { urls: ["https://c.example/*"] },
        Decision.pass,
      ),
    );
    assert.ok(error !== undefined);
    assert.equal(error.code, "Native");
    assert.equal(
      error.cause,
      refusedC,
      "the caller sees the ORIGINAL refusal, not the restore's own failure",
    );
    await waitUntil(
      () => logged.join("\n").includes("Could not restore"),
      "the restore's own failure to be logged",
    );
  });
  const joined = lines.join("\n");
  assert.ok(joined.includes("Could not restore"), joined);
  assert.ok(joined.includes(`the "request" stage's request listeners`), joined);
  assert.ok(joined.includes("after a refused registration"), joined);
  assert.equal(
    fake.listeners.get("onBeforeRequest"),
    null,
    "the stage has no listener afterwards: logged, not silent",
  );
  const dScope = Effect.runSync(Scope.make());
  await installRequest(handle, dScope, { urls: ["https://d.example/*"] }, Decision.pass);
  assert.deepEqual(
    fake.filterFor("onBeforeRequest"),
    { urls: ["https://a.example/*", "https://d.example/*"] },
    "the next install re-registers the survivors",
  );
  assert.deepEqual(
    await fake.fire("onBeforeRequest", { url: "https://a.example/one" }),
    { cancel: true },
    "A decides again",
  );
  await Effect.runPromise(Scope.close(dScope, Exit.void));
  await Effect.runPromise(Scope.close(outer, Exit.void));
});

test("(d) a release's own reinstall failure is logged, not surfaced, and the next install self-heals the survivor", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const scopeA = Effect.runSync(Scope.make());
  const scopeB = Effect.runSync(Scope.make());
  await installRequest(
    handle,
    scopeA,
    { urls: ["https://a.example/*"] },
    Decision.sync(() => ({ kind: "block" })),
  );
  const bDecided: string[] = [];
  await installRequest(
    handle,
    scopeB,
    { urls: ["https://b.example/*"] },
    Decision.sync(({ url }) => {
      bDecided.push(url);
      return { kind: "block" };
    }),
  );
  let calls = 0;
  fake.refuse("onBeforeRequest", () => {
    calls += 1;
    return calls === 1 ? new Error("Electron refused A's own release reinstall") : undefined;
  });
  const lines = await captureConsole(async (logged) => {
    // A's scope must close without the reinstall failure surfacing to the closing effect: if it
    // did, this `Effect.runPromise` would reject and the test would fail here, uncaught.
    await Effect.runPromise(Scope.close(scopeA, Exit.void));
    await waitUntil(
      () => logged.join("\n").includes("Could not reinstall"),
      "the release's own reinstall failure to be logged",
    );
  });
  const joined = lines.join("\n");
  assert.ok(joined.includes("Could not reinstall"), joined);
  assert.ok(joined.includes(`the "request" stage's request listeners`), joined);
  assert.ok(joined.includes("after removing a decider"), joined);
  const cScope = Effect.runSync(Scope.make());
  await installRequest(handle, cScope, { urls: ["https://c.example/*"] }, Decision.pass);
  assert.deepEqual(
    fake.filterFor("onBeforeRequest"),
    { urls: ["https://b.example/*", "https://c.example/*"] },
    "the next install re-registers B, the survivor",
  );
  assert.deepEqual(
    await fake.fire("onBeforeRequest", { url: "https://b.example/two" }),
    { cancel: true },
    "B decides again",
  );
  assert.deepEqual(bDecided, ["https://b.example/two"]);
  await Effect.runPromise(Scope.close(cScope, Exit.void));
  await Effect.runPromise(Scope.close(scopeB, Exit.void));
});

test("(e) a refused observe registration fails alone; observers installed before and after it both keep receiving", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const filter: WebRequest.Filter = { urls: ["https://a.example/*"] };
  const firstEvents: WebRequest.Event[] = [];
  const thirdEvents: WebRequest.Event[] = [];
  let registrations = 0;
  await Effect.runPromise(
    Effect.gen(function* () {
      // `reinstallTaps` (`internal/WebRequest.ts`) registers `onSendHeaders` first of its five
      // stages, so that is the one stage a refusal here can reach at all.
      const scope1 = yield* Scope.make();
      yield* handle.requests(filter).pipe(
        Stream.runForEach((event) => Effect.sync(() => firstEvents.push(event))),
        Effect.forkScoped,
        Scope.provide(scope1),
      );
      yield* Effect.promise(() => until(() => fake.listeners.get("onSendHeaders") != null));
      fake.emit("onSendHeaders", { url: "https://a.example/one" });
      yield* Effect.promise(() => until(() => firstEvents.length >= 1));

      const refusedBy = new Error("Electron refused the second observer's filter");
      fake.refuse("onSendHeaders", () => {
        registrations += 1;
        return registrations === 1 ? refusedBy : undefined;
      });
      const secondError = yield* handle.requests(filter).pipe(Stream.runDrain, Effect.flip);
      assert.equal(secondError.code, "Native");
      assert.equal(secondError.cause, refusedBy);

      fake.emit("onSendHeaders", { url: "https://a.example/two" });
      yield* Effect.promise(() => until(() => firstEvents.length >= 2));
      assert.equal(
        firstEvents[1]?.stage,
        "sent",
        "the first observer still receives after the refusal",
      );

      const scope3 = yield* Scope.make();
      yield* handle.requests(filter).pipe(
        Stream.runForEach((event) => Effect.sync(() => thirdEvents.push(event))),
        Effect.forkScoped,
        Scope.provide(scope3),
      );
      yield* Effect.promise(() => until(() => registrations >= 3));
      fake.emit("onSendHeaders", { url: "https://a.example/three" });
      yield* Effect.promise(() => until(() => thirdEvents.length >= 1));
      assert.equal(
        thirdEvents[0]?.stage,
        "sent",
        "a third observer opened after the refusal receives too",
      );

      yield* Scope.close(scope1, Exit.void);
      yield* Scope.close(scope3, Exit.void);
    }).pipe(Effect.provide(Testing.main)),
  );
});

test("(f) other and image share the native filter; closing the other-only scope narrows it and the image decider still decides", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const otherScope = Effect.runSync(Scope.make());
  const imageScope = Effect.runSync(Scope.make());
  await installRequest(
    handle,
    otherScope,
    { urls: ["<all_urls>"], types: ["other"] },
    Decision.sync(() => ({ kind: "block" })),
  );
  const imageSeen: string[] = [];
  await installRequest(
    handle,
    imageScope,
    { urls: ["<all_urls>"], types: ["image"] },
    Decision.sync(({ resourceType }) => {
      imageSeen.push(resourceType);
      return { kind: "block" };
    }),
  );
  const combined = fake.filterFor("onBeforeRequest");
  assert.deepEqual(combined, { urls: ["<all_urls>"] });
  assert.ok(
    typeof combined === "object" && combined !== null && !("types" in combined),
    "other in the union widens the native filter to every type: no types key at all",
  );
  await Effect.runPromise(Scope.close(otherScope, Exit.void));
  assert.deepEqual(
    fake.filterFor("onBeforeRequest"),
    { urls: ["<all_urls>"], types: ["image"] },
    "the surviving image-only install narrows the native filter back down",
  );
  assert.deepEqual(
    await fake.fire("onBeforeRequest", { resourceType: "image" }),
    { cancel: true },
    "the image decider still reaches its own request after the other-only scope closed",
  );
  assert.deepEqual(imageSeen, ["image"]);
  await Effect.runPromise(Scope.close(imageScope, Exit.void));
});
