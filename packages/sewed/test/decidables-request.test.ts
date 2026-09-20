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
      assert.equal(
        fake.listeners.get("onBeforeSendHeaders"),
        null,
        "installing on one stage leaves the others explicitly uninstalled",
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
          parts: [{ kind: "bytes", bytes: new Uint8Array(Buffer.from("hello")) }],
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
