import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Exit, Fiber, Logger, Schema, Scope, Stream } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Navigation from "../src/Navigation.ts";
import * as Testing from "../src/Testing.ts";
import * as WebRequestData from "../src/WebRequest.ts";
import { guestFallbacks, rendererFallbacks } from "../src/internal/ContentsPosture.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";

/**
 * `Testing.owner(kind)`, `Testing.contents(of)` and `Testing.requests()` each stand in for one
 * owner: the production registry, the production `decide`, the posture the named owner builds its
 * registry with, and the resolutions a native callback would perform, with no Electron. Every test
 * here writes the feature it exercises against the minimal interface a real owner publishes —
 * `Decision.Owner<O>`, `Decision.Requests` — so the stand-in and the real window, contents, or
 * session are interchangeable at the feature's own signature.
 */

/** A decidable that carries a `headers` record, to fold, and `resourceType`, to filter on. */
const headerEvent = {
  id: 1,
  url: "https://api.example.com/v1",
  method: "GET",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
  headers: { z: "0" },
} as const;

/** A download offer, for the fallbacks the two contents postures differ on. */
const offer = {
  url: "https://files.example/report.pdf",
  filename: "report.pdf",
  mimeType: "application/pdf",
  totalBytes: 1024,
  sourceId: "contents-1",
} as const;

const requestEvent = {
  id: 2,
  url: "https://api.example.com/v1",
  method: "POST",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
} as const;

/** The filter a test uses when it wants every request, which is what production spells too. */
const everything = { urls: ["<all_urls>"] } as const;

/** node:test reports a decider's own failure log as noise, and every failure here is deliberate. */
const quietly = Logger.layer([]);

/** One valid sample of each of the five observation-only stages, over `WebRequest.Event`'s own union. */
const observationBase = {
  id: 3,
  url: "https://api.example.com/v1",
  method: "GET",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
} as const;
const observed = { ...observationBase, fromCache: false } as const;
const observationEvents = {
  sent: { ...observationBase, stage: "sent" as const, headers: { accept: "application/json" } },
  response: {
    ...observed,
    stage: "response" as const,
    statusCode: 200,
    statusLine: "HTTP/1.1 200 OK",
    headers: { "content-type": ["application/json"] },
  },
  redirect: {
    ...observed,
    stage: "redirect" as const,
    statusCode: 302,
    redirectUrl: "https://api.example.com/v2",
  },
  completed: {
    ...observed,
    stage: "completed" as const,
    statusCode: 200,
    statusLine: "HTTP/1.1 200 OK",
  },
  error: { ...observed, stage: "error" as const, error: "net::ERR_FAILED" },
} satisfies Record<string, WebRequestData.Event>;

/** Waits, bounded, for a condition a later `emit`/fiber effect is expected to make true. */
const awaitCondition = (check: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 200 && !check(); attempt++) yield* Effect.sleep(5);
    assert.ok(check(), "condition did not become true in time");
  });

const run = <A, E>(program: Effect.Effect<A, E, MainContext | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(program).pipe(Effect.provide(Testing.main), Effect.provide(quietly)),
  );

/** The error a refused install failed with, or `undefined` if it was not refused at all. */
const refusal = <A>(install: Effect.Effect<A, SewedError, MainContext | Scope.Scope>) =>
  run(
    install.pipe(
      Effect.as(undefined),
      Effect.catch((error: SewedError) => Effect.succeed(error)),
    ),
  );

test("a feature installed on a stand-in decides, and its decidable's fallback answers without it", async () => {
  // Written against the interface a real web contents publishes, so this same function takes
  // `window.webContents` in production and the stand-in here.
  const allowDocs = (contents: Decision.Owner<"contents">) =>
    contents.decide(
      Decidables.WebContents.Navigation,
      Decision.policy(Navigation.Policy, [{ kind: "origin", origin: "https://docs.example" }]),
    );
  await run(
    Effect.gen(function* () {
      const contents = Testing.contents({ of: "window" });
      assert.equal(
        yield* contents.resolve(Decidables.WebContents.Navigation, {
          url: "https://docs.example/start",
          kind: "navigation",
        }),
        "deny",
        "nothing is installed yet, so the decidable's own fallback answers",
      );
      yield* allowDocs(contents);
      assert.equal(
        yield* contents.resolve(Decidables.WebContents.Navigation, {
          url: "https://docs.example/start",
          kind: "navigation",
        }),
        "allow",
        "the policy granted this origin",
      );
      assert.equal(
        yield* contents.resolve(Decidables.WebContents.Navigation, {
          url: "https://evil.test/",
          kind: "navigation",
        }),
        "deny",
        "the policy passed on this one, so the fallback answers",
      );
    }),
  );
});

test("closing a feature's scope removes its decider from the stand-in", async () => {
  await run(
    Effect.gen(function* () {
      const session = Testing.owner("session");
      const feature = yield* Scope.make();
      yield* session
        .decide(
          Decidables.Session.Preconnect,
          Decision.sync(() => "deny"),
        )
        .pipe(Scope.provide(feature));
      assert.equal(
        yield* session.resolve(Decidables.Session.Preconnect, { url: "https://x.example/" }),
        "deny",
      );
      yield* Scope.close(feature, Exit.void);
      assert.equal(
        yield* session.resolve(Decidables.Session.Preconnect, { url: "https://x.example/" }),
        "allow",
        "the decider is gone, so the fallback answers again",
      );
    }),
  );
});

test("a crashing decider contributes its decidable's declared failure", async () => {
  await run(
    Effect.gen(function* () {
      const window = Testing.owner("window");
      yield* window.decide(
        Decidables.Window.Close,
        Decision.async(() => Effect.die(new Error("unsaved-changes guard crashed"))),
      );
      assert.equal(
        yield* window.resolve(Decidables.Window.Close, { windowId: "w1" }),
        "deny",
        "Window.Close declares failure: deny, so a guard that crashed does not close the window",
      );
    }),
  );
});

test("two deciders on a chain decidable each see what the previous one produced", async () => {
  await run(
    Effect.gen(function* () {
      // `intercept` is the only door a request stage has, in production and here, so a test that
      // wants every request says so with a filter rather than installing without one.
      const requests = Testing.requests();
      yield* requests.intercept(
        Decidables.Session.RequestHeaders,
        everything,
        Decision.sync(({ headers }) => ({ kind: "headers", headers: { ...headers, a: "1" } })),
      );
      yield* requests.intercept(
        Decidables.Session.RequestHeaders,
        everything,
        Decision.sync(({ headers }) => ({ kind: "headers", headers: { ...headers, b: "2" } })),
      );
      const outcome = yield* requests.resolveChain(Decidables.Session.RequestHeaders, headerEvent);
      assert.equal(outcome.kind, "completed");
      assert.deepEqual(
        outcome.kind === "completed" ? outcome.event.headers : undefined,
        { z: "0", a: "1", b: "2" },
        "both features' headers land; neither clobbers the other",
      );
    }),
  );
});

test("a stand-in refuses a decidable another owner owns", async () => {
  const error = await refusal(
    // A compile error against these types; this is the runtime half, for a fixture or a consumer
    // writing plain JavaScript.
    // @ts-expect-error A window's decidable does not install on a web contents.
    Testing.contents({ of: "window" }).decide(Decidables.Window.Close, Decision.pass),
  );
  assert.ok(error !== undefined, "a wrong-owner install must be refused, not registered inert");
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /window\/close/);
  assert.match(error.message, /"contents"/);
});

test("a window's contents stand-in falls back the way a window's contents does", async () => {
  await run(
    Effect.gen(function* () {
      const contents = Testing.contents({ of: "window" });
      assert.deepEqual(
        yield* contents.resolve(Decidables.WebContents.Download, offer),
        { kind: "prompt" },
        "a plain web contents overrides the catalog's deny to prompt at its construction site",
      );
      assert.equal(
        yield* contents.resolve(Decidables.WebContents.Input, { kind: "key" }),
        "allow",
        "and leaves input alone",
      );
    }),
  );
});

test("a guest's contents stand-in falls back the way a guest's does", async () => {
  await run(
    Effect.gen(function* () {
      const contents = Testing.contents({ of: "guest" });
      assert.deepEqual(
        yield* contents.resolve(Decidables.WebContents.Download, offer),
        { kind: "deny" },
        "a guest denies a download until a decider accepts one",
      );
      assert.equal(
        yield* contents.resolve(Decidables.WebContents.Input, { kind: "key" }),
        "allow",
        "a guest built with no input posture leaves the decidable's own fallback",
      );
    }),
  );
});

test("a guest built to block input falls back to block", async () => {
  await run(
    Effect.gen(function* () {
      const contents = Testing.contents({ of: "guest", input: "block" });
      assert.equal(
        yield* contents.resolve(Decidables.WebContents.Input, { kind: "key" }),
        "block",
        "the guest's own creation-time input posture, not the decidable's allow",
      );
      // And a decider still composes over it, which is what `guest-views.md` tells a reader.
      yield* contents.decide(
        Decidables.WebContents.Input,
        Decision.sync(() => "allow"),
      );
      assert.equal(yield* contents.resolve(Decidables.WebContents.Input, { kind: "key" }), "allow");
    }),
  );
});

test("a contents stand-in answers what the production posture answers, not a copy of it", async () => {
  // The three tests above would all still pass if `contents` restated the two postures inline, and
  // a change to either production function would then leave the stand-in behind. This binds them:
  // every answer is compared against a registry built from `ContentsPosture`'s own exports — the
  // same two functions `internal/WebContents.ts` and `internal/GuestView.ts` call.
  const postures = [
    { label: "a window's", standIn: Testing.contents({ of: "window" }), from: rendererFallbacks() },
    {
      label: "a guest's",
      standIn: Testing.contents({ of: "guest" }),
      from: guestFallbacks(undefined),
    },
    {
      label: "a guest's, built to block input",
      standIn: Testing.contents({ of: "guest", input: "block" }),
      from: guestFallbacks("block"),
    },
  ] as const;
  await run(
    Effect.gen(function* () {
      for (const { label, standIn, from } of postures) {
        const production = Registry.make({ owner: "contents", fallbacks: from });
        assert.deepEqual(
          yield* standIn.resolve(Decidables.WebContents.Download, offer),
          yield* production.resolveAsync(Decidables.WebContents.Download, offer),
          `${label} download fallback must be the production one`,
        );
        assert.equal(
          yield* standIn.resolve(Decidables.WebContents.Input, { kind: "key" }),
          yield* production.resolveAsync(Decidables.WebContents.Input, { kind: "key" }),
          `${label} input fallback must be the production one`,
        );
      }
      // And the two postures really differ, so the comparison above is not vacuous.
      assert.notDeepEqual(
        yield* Testing.contents({ of: "window" }).resolve(Decidables.WebContents.Download, offer),
        yield* Testing.contents({ of: "guest" }).resolve(Decidables.WebContents.Download, offer),
      );
    }),
  );
});

test("each stand-in owns its registry, so one test's deciders cannot reach another's", async () => {
  await run(
    Effect.gen(function* () {
      const first = Testing.contents({ of: "window" });
      const second = Testing.contents({ of: "window" });
      yield* first.decide(
        Decidables.WebContents.Popup,
        Decision.sync(() => "allow"),
      );
      assert.equal(
        yield* first.resolve(Decidables.WebContents.Popup, { url: "https://x.example/" }),
        "allow",
      );
      assert.equal(
        yield* second.resolve(Decidables.WebContents.Popup, { url: "https://x.example/" }),
        "deny",
        "a fresh stand-in starts with nothing installed",
      );
    }),
  );
});

test("an intercepted decider is asked only about the requests its own filter selects", async () => {
  // The feature under test names the door it needs and nothing else, so the real session's own
  // `intercept` and the stand-in's are interchangeable here.
  const blockDeletes = (requests: Decision.Requests) =>
    requests.intercept(
      Decidables.Session.Request,
      { urls: ["https://api.example.com/*"], types: ["xhr"] },
      Decision.sync((request) => (request.method === "POST" ? { kind: "block" } : Decision.Pass)),
    );
  await run(
    Effect.gen(function* () {
      const requests = Testing.requests();
      yield* blockDeletes(requests);
      assert.deepEqual(
        yield* requests.resolve(Decidables.Session.Request, requestEvent),
        { kind: "block" },
        "the filter selects this URL and type, and the decider had an opinion",
      );
      assert.deepEqual(
        yield* requests.resolve(Decidables.Session.Request, {
          ...requestEvent,
          url: "https://other.example/v1",
        }),
        { kind: "allow" },
        "a URL the filter does not select never reaches the decider",
      );
      assert.deepEqual(
        yield* requests.resolve(Decidables.Session.Request, {
          ...requestEvent,
          resourceType: "mainFrame",
        }),
        { kind: "allow" },
        "a resource type the filter does not select never reaches the decider either",
      );
    }),
  );
});

test("a test event carries the body its decider reads, and a header stage still refuses one", async () => {
  await run(
    Effect.gen(function* () {
      const requests = Testing.requests();
      yield* requests.intercept(
        Decidables.Session.Request,
        { urls: ["<all_urls>"], body: { maxBytes: 64, blobs: "reference" } },
        Decision.sync((request) =>
          (request.body?.parts.length ?? 0) > 0 ? { kind: "block" } : Decision.Pass,
        ),
      );
      assert.deepEqual(
        yield* requests.resolve(Decidables.Session.Request, {
          ...requestEvent,
          body: { parts: [{ kind: "blob", id: "b1" }], bytes: 0, truncated: false },
        }),
        { kind: "block" },
        "assembly is native; a test hands the decider the body it wants it to see",
      );
    }),
  );
  const error = await refusal(
    Testing.requests().intercept(
      Decidables.Session.RequestHeaders,
      { urls: ["<all_urls>"], body: { maxBytes: 64, blobs: "resolve" } },
      Decision.pass,
    ),
  );
  assert.ok(error !== undefined, "a body a stage cannot carry is a refusal, not a no-op");
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /session\/request-headers/);
});

test("a decidable no request listener resolves is refused by the stand-in's intercept too", async () => {
  // `owner: "requests"` and a `session/` key are all the type and the declaration check ask for,
  // so a fourth request decidable declares cleanly and nothing would ever resolve it.
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
    Testing.requests().intercept(
      Invented,
      { urls: ["<all_urls>"] },
      Decision.sync(() => "block"),
    ),
  );
  assert.ok(error !== undefined, "an inert install is the failure this door exists to refuse");
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /session\/invented-stage/);
});

test("observe receives an emitted event its filter selects, and not one it does not", async () => {
  await run(
    Effect.gen(function* () {
      const requestsOwner = Testing.requests();
      const seen: WebRequestData.Event[] = [];
      yield* requestsOwner.observe({ urls: ["https://api.example.com/*"] }).pipe(
        Stream.runForEach((event) => Effect.sync(() => seen.push(event))),
        Effect.forkScoped,
      );
      const matching = observationEvents.completed;
      // The subscription registers asynchronously underneath (the same shape a native tap's own
      // registration has): retry the emit, bounded, until it lands. It lands exactly once, because
      // the loop stops the instant it does.
      for (let attempt = 0; attempt < 200 && seen.length === 0; attempt++) {
        requestsOwner.emit(matching);
        yield* Effect.sleep(5);
      }
      assert.equal(seen.length, 1);
      assert.deepEqual(seen[0], matching);

      const outside = { ...matching, id: 99, url: "https://other.example/report" };
      requestsOwner.emit(outside);
      assert.equal(
        seen.length,
        1,
        "a request the filter's urls do not select never reaches the observer",
      );
    }),
  );
});

test("emit throws Protocol for a url it cannot parse, rather than dropping the event silently", () => {
  const requestsOwner = Testing.requests();
  assert.throws(
    () => requestsOwner.emit({ ...observationEvents.completed, url: "not a url" }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("each of the five request stages round-trips through observe and emit", async () => {
  await run(
    Effect.gen(function* () {
      const requestsOwner = Testing.requests();
      const seen: WebRequestData.Event[] = [];
      yield* requestsOwner.observe(everything).pipe(
        Stream.runForEach((event) => Effect.sync(() => seen.push(event))),
        Effect.forkScoped,
      );
      const stages = [
        observationEvents.sent,
        observationEvents.response,
        observationEvents.redirect,
        observationEvents.completed,
        observationEvents.error,
      ];
      for (let attempt = 0; attempt < 200 && seen.length === 0; attempt++) {
        requestsOwner.emit(stages[0]);
        yield* Effect.sleep(5);
      }
      for (const event of stages.slice(1)) requestsOwner.emit(event);
      yield* awaitCondition(() => seen.length === stages.length);
      assert.deepEqual(seen, stages);
    }),
  );
});

test("two observers both receive the same emitted event", async () => {
  await run(
    Effect.gen(function* () {
      const requestsOwner = Testing.requests();
      const seenA: WebRequestData.Event[] = [];
      const seenB: WebRequestData.Event[] = [];
      yield* requestsOwner.observe(everything).pipe(
        Stream.runForEach((event) => Effect.sync(() => seenA.push(event))),
        Effect.forkScoped,
      );
      yield* requestsOwner.observe(everything).pipe(
        Stream.runForEach((event) => Effect.sync(() => seenB.push(event))),
        Effect.forkScoped,
      );
      const warmup = observationEvents.sent;
      for (
        let attempt = 0;
        attempt < 200 && (seenA.length === 0 || seenB.length === 0);
        attempt++
      ) {
        requestsOwner.emit(warmup);
        yield* Effect.sleep(5);
      }
      assert.ok(seenA.length > 0 && seenB.length > 0, "both observers are live");
      seenA.length = 0;
      seenB.length = 0;
      const target = observationEvents.completed;
      requestsOwner.emit(target);
      yield* awaitCondition(() => seenA.length === 1 && seenB.length === 1);
      assert.deepEqual(seenA, [target]);
      assert.deepEqual(seenB, [target]);
    }),
  );
});

test("an observer's scope closing ends its stream", async () => {
  await run(
    Effect.gen(function* () {
      const requestsOwner = Testing.requests();
      const seen: WebRequestData.Event[] = [];
      const fiber = yield* requestsOwner.observe(everything).pipe(
        Stream.runForEach((event) => Effect.sync(() => seen.push(event))),
        Effect.forkScoped,
      );
      const warmup = observationEvents.sent;
      for (let attempt = 0; attempt < 200 && seen.length === 0; attempt++) {
        requestsOwner.emit(warmup);
        yield* Effect.sleep(5);
      }
      assert.equal(seen.length, 1);
      // Interrupting the observer's own forked fiber releases the same acquired resource that
      // closing its scope would: `Observation.listen`'s tap removal.
      yield* Fiber.interrupt(fiber);
      requestsOwner.emit(observationEvents.completed);
      assert.equal(
        seen.length,
        1,
        "closing the observer's scope removed its tap: a later emit reaches nothing",
      );
    }),
  );
});
