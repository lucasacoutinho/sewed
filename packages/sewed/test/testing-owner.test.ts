import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Exit, Logger, Schema, Scope } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Navigation from "../src/Navigation.ts";
import * as Testing from "../src/Testing.ts";
import type { MainContext } from "../src/RuntimeContext.ts";
import type { SewedError } from "../src/SewedError.ts";

/**
 * `Testing.owner(kind)` stands in for one owner: the production registry, the production `decide`,
 * and the resolutions a native callback would perform, with no Electron. Every test here writes the
 * feature it exercises against the minimal interface a real owner publishes — `Decision.Owner<O>`,
 * `Decision.Requests<O>` — so the stand-in and the real window, contents, or session are
 * interchangeable at the feature's own signature.
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

const requestEvent = {
  id: 2,
  url: "https://api.example.com/v1",
  method: "POST",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
} as const;

/** node:test reports a decider's own failure log as noise, and every failure here is deliberate. */
const quietly = Logger.layer([]);

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
      const contents = Testing.owner("contents");
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
      const requests = Testing.owner("requests");
      yield* requests.decide(
        Decidables.Session.RequestHeaders,
        Decision.sync(({ headers }) => ({ kind: "headers", headers: { ...headers, a: "1" } })),
      );
      yield* requests.decide(
        Decidables.Session.RequestHeaders,
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
    Testing.owner("contents").decide(Decidables.Window.Close, Decision.pass),
  );
  assert.ok(error !== undefined, "a wrong-owner install must be refused, not registered inert");
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /window\/close/);
  assert.match(error.message, /"contents"/);
});

test("each stand-in owns its registry, so one test's deciders cannot reach another's", async () => {
  await run(
    Effect.gen(function* () {
      const first = Testing.owner("contents");
      const second = Testing.owner("contents");
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
      const requests = Testing.owner("requests");
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
      const requests = Testing.owner("requests");
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
    Testing.owner("requests").intercept(
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
    Testing.owner("requests").intercept(
      Invented,
      { urls: ["<all_urls>"] },
      Decision.sync(() => "block"),
    ),
  );
  assert.ok(error !== undefined, "an inert install is the failure this door exists to refuse");
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /session\/invented-stage/);
});
