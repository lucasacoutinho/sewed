import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Schema, SubscriptionRef } from "effect";
import * as Decision from "../src/Decision.ts";
import { SewedError } from "../src/SewedError.ts";

test("a restrictive decidable without an order fails Protocol at declaration", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-no-order",
        owner: "contents",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "sync",
        composition: "restrictive",
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a fallback that does not decode against the answer schema fails Protocol at declaration", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-bad-fallback",
        owner: "contents",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        // @ts-expect-error Runtime callers can provide a fallback the answer schema rejects.
        fallback: "maybe",
        timing: "sync",
        composition: "first",
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("an order with a repeated entry fails Protocol at declaration", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-repeated-order",
        owner: "contents",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "sync",
        composition: "restrictive",
        order: ["block", "block", "allow"],
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a restrictive decidable whose fallback discriminant is missing from its order fails Protocol at declaration", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-fallback-not-in-order",
        owner: "contents",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "sync",
        composition: "restrictive",
        order: ["block"],
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a first-composition decidable that declares an order fails Protocol at declaration", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-first-with-order",
        owner: "contents",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "sync",
        composition: "first",
        order: ["block", "allow"],
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

// `failure` — what a *broken* decider contributes, declared apart from `fallback`, which is what
// *nobody having an opinion* answers. The two coincide only when the fallback is the closed answer,
// and conflating them is what let a crashing close guard resolve "allow".

test("a first decidable refuses a failure", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-first-with-failure",
        owner: "contents",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        failure: "block",
        timing: "sync",
        composition: "first",
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a failure outside the order is refused", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-failure-not-in-order",
        owner: "contents",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "block",
        // Decodes against the answer schema, but cannot rank: a failing decider's contribution of it
        // would be filtered out by rank and the resolution would answer less restrictively than this
        // decidable declares — the same hole the fallback's own order check closes.
        failure: "allow",
        timing: "sync",
        composition: "restrictive",
        order: ["block"],
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a failure that does not decode against the answer schema fails Protocol at declaration", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-bad-failure",
        owner: "contents",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        // @ts-expect-error Runtime callers can provide a failure the answer schema rejects.
        failure: "maybe",
        timing: "sync",
        composition: "restrictive",
        order: ["block", "allow"],
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

// The chain composition's own declaration checks. A chain is a fold, not a ranking, so it declares
// how the next decider's event is built instead of an order to rank by.

test("a chain decidable that declares no chain is refused", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-chain-without-chain",
        owner: "contents",
        event: Schema.Struct({ url: Schema.String }),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "async",
        composition: "chain",
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a chain declared on a decidable that does not compose as a chain is refused", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-chain-on-restrictive",
        owner: "contents",
        event: Schema.Struct({ url: Schema.String }),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "async",
        composition: "restrictive",
        order: ["block", "allow"],
        chain: { stop: ["block"], advance: (event) => event },
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a chain decidable that declares an order is refused", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-chain-with-order",
        owner: "contents",
        event: Schema.Struct({ url: Schema.String }),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "async",
        composition: "chain",
        order: ["block", "allow"],
        chain: { stop: ["block"], advance: (event) => event },
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a chain whose stop repeats an entry is refused", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-chain-repeated-stop",
        owner: "contents",
        event: Schema.Struct({ url: Schema.String }),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "async",
        composition: "chain",
        chain: { stop: ["block", "block"], advance: (event) => event },
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a synchronous chain decidable is refused", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "contents/test-chain-sync",
        owner: "contents",
        event: Schema.Struct({ url: Schema.String }),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
        timing: "sync",
        composition: "chain",
        chain: { stop: ["block"], advance: (event) => event },
      }),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("a chain decidable copies its stop list rather than sharing the caller's array", () => {
  const stop: ("block" | "allow")[] = ["block"];
  const declared = Decision.decidable({
    key: "contents/test-chain-frozen",
    owner: "contents",
    event: Schema.Struct({ url: Schema.String }),
    answer: Schema.Literals(["allow", "block"]),
    fallback: "allow",
    timing: "async",
    composition: "chain",
    chain: { stop, advance: (event) => event },
  });
  stop.push("allow");
  assert.deepEqual(declared.chain?.stop, ["block"]);
});

test("a declared decidable is frozen, and its order is copied rather than shared with the caller's array", () => {
  const order: ("block" | "allow")[] = ["block", "allow"];
  const declared = Decision.decidable({
    key: "contents/test-frozen",
    owner: "contents",
    event: Schema.Struct({}),
    answer: Schema.Literals(["allow", "block"]),
    fallback: "allow",
    timing: "sync",
    composition: "restrictive",
    order,
  });
  assert.equal(Object.isFrozen(declared), true);
  order.reverse();
  assert.deepEqual(declared.order, ["block", "allow"]);
});

test("Pass is a stable, globally registered symbol", () => {
  assert.equal(typeof Decision.Pass, "symbol");
  assert.equal(Symbol.keyFor(Decision.Pass), "sewed/Decision/Pass");
});

test("fromState answers from the state at the moment of the callback, not a stale snapshot", () => {
  const state = Effect.runSync(SubscriptionRef.make({ blocked: false }));
  const decider = Decision.fromState(
    state,
    (current: { blocked: boolean }, _event: { url: string }) =>
      current.blocked ? ("block" as const) : ("allow" as const),
  );
  assert.equal(decider.decide({ url: "https://a/" }), "allow");
  Effect.runSync(SubscriptionRef.set(state, { blocked: true }));
  assert.equal(decider.decide({ url: "https://a/" }), "block");
});

test("fromRead answers from a mutated closure at the moment of the callback, not a stale snapshot", () => {
  let blocked = false;
  const decider = Decision.fromRead(
    () => ({ blocked }),
    (current: { blocked: boolean }, _event: { url: string }) =>
      current.blocked ? ("block" as const) : ("allow" as const),
  );
  assert.equal(decider.decide({ url: "https://a/" }), "allow");
  blocked = true;
  assert.equal(decider.decide({ url: "https://a/" }), "block");
});

test("a pass-only Decision.sync installs with no annotation: it answers Pass at runtime, whatever the decidable", () => {
  const decider = Decision.sync(() => Decision.Pass);
  assert.equal(decider.decide({ anything: "goes" }), Decision.Pass);
});

test("a mixed Decision.sync narrows its real answer and still answers Pass on the passing branch", () => {
  const decider = Decision.sync((event: { readonly url: string }) =>
    event.url.length > 0 ? ("block" as const) : Decision.Pass,
  );
  assert.equal(decider.decide({ url: "https://a/" }), "block");
  assert.equal(decider.decide({ url: "" }), Decision.Pass);
});

test("policy compiles validated rule data into a decider that consults it per event", () => {
  const kind = Decision.definePolicy({
    rules: Schema.Struct({ blockedHosts: Schema.Array(Schema.String) }),
    compile:
      (rules) =>
      (event: { url: string }): "block" | Decision.Pass =>
        rules.blockedHosts.some((host) => event.url.includes(host)) ? "block" : Decision.Pass,
  });
  const decider = Decision.policy(kind, { blockedHosts: ["evil.example"] });
  assert.equal(decider.decide({ url: "https://evil.example/path" }), "block");
  assert.equal(decider.decide({ url: "https://good.example/" }), Decision.Pass);
});

test("policy rejects invalid rule data immediately, before any event is decided", () => {
  const kind = Decision.definePolicy({
    rules: Schema.Struct({ blockedHosts: Schema.Array(Schema.String) }),
    compile: () => () => Decision.Pass,
  });
  assert.throws(() => {
    // @ts-expect-error Rule data must also be rejected at the runtime boundary.
    Decision.policy(kind, { blockedHosts: "not-an-array" });
  });
});

test("a policy answers Pass for everything its rules miss, never the closed answer", () => {
  const kind = Decision.definePolicy({
    rules: Schema.Struct({ blockedHosts: Schema.Array(Schema.String) }),
    compile:
      (rules) =>
      (event: { url: string }): "block" | Decision.Pass =>
        rules.blockedHosts.some((host) => event.url.includes(host)) ? "block" : Decision.Pass,
  });
  const decider = Decision.policy(kind, { blockedHosts: [] });
  assert.equal(decider.decide({ url: "https://anything.example/" }), Decision.Pass);
});

// Task 7b: a decidable names the owner that resolves it, and its `key` prefix already spelled that
// owner by convention. The check is what stops the two drifting: a decidable whose key says one
// owner and whose field says another would read as the first in every diagnostic and refuse every
// install the second makes.
test("a decidable's key must agree with its owner", async (t) => {
  const cases = [
    { key: "window/close", owner: "contents", why: "a window's key under a contents owner" },
    { key: "contents/navigation", owner: "window", why: "a contents key under a window owner" },
    { key: "app/quit", owner: "session", why: "an app key under a session owner" },
    { key: "quit", owner: "app", why: "no prefix at all" },
    { key: "application/quit", owner: "app", why: "a prefix the owner's own is a prefix of" },
    { key: "requests/headers", owner: "requests", why: "requests decidables carry the session's" },
  ] as const;
  for (const { key, owner, why } of cases) {
    await t.test(why, () => {
      assert.throws(
        () =>
          Decision.decidable({
            key,
            owner,
            event: Schema.Struct({}),
            answer: Schema.Literals(["allow", "deny"]),
            fallback: "allow",
            timing: "sync",
            composition: "first",
          }),
        (error: unknown) =>
          error instanceof SewedError &&
          error.code === "Protocol" &&
          error.message.includes(key) &&
          error.message.includes(owner),
      );
    });
  }
});

test("every owner kind has a key prefix a decidable can be declared under", async (t) => {
  const cases = [
    { key: "app/ok", owner: "app" },
    { key: "window/ok", owner: "window" },
    { key: "contents/ok", owner: "contents" },
    { key: "session/ok", owner: "session" },
    // A request stage belongs to a session however it is installed, so it shares that prefix.
    { key: "session/request-ok", owner: "requests" },
  ] as const;
  for (const { key, owner } of cases) {
    await t.test(`${owner} declares under ${key}`, () => {
      const declared = Decision.decidable({
        key,
        owner,
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "deny"]),
        fallback: "allow",
        timing: "sync",
        composition: "first",
      });
      assert.equal(declared.owner, owner);
      assert.equal(declared.key, key);
    });
  }
});

test("a decidable's owner must be an owner kind, and the refusal names them", async (t) => {
  // From JavaScript the type says nothing, so this is the half that answers a `.mjs` fixture. It
  // must name what went wrong — reading the prefix of a kind that does not exist would report a
  // missing `"undefined/"` key and send the reader looking for a prefix instead.
  const cases: readonly { readonly owner: unknown; readonly why: string }[] = [
    { owner: "windo", why: "a misspelled kind" },
    { owner: undefined, why: "no owner at all" },
    { owner: "toString", why: "a property of Object.prototype is not a kind" },
  ];
  for (const { owner, why } of cases) {
    await t.test(why, () => {
      assert.throws(
        () =>
          Decision.decidable({
            key: "window/close",
            // @ts-expect-error The unknown owner exercises JavaScript boundary validation.
            owner,
            event: Schema.Struct({}),
            answer: Schema.Literals(["allow", "deny"]),
            fallback: "allow",
            timing: "sync",
            composition: "first",
          }),
        (error: unknown) =>
          error instanceof SewedError &&
          error.code === "Protocol" &&
          error.message.includes(String(owner)) &&
          error.message.includes("is not an owner kind") &&
          // The kinds there are, which is the JavaScript half of TypeScript's own TS2820.
          error.message.includes('"window"') &&
          error.message.includes('"session"') &&
          !error.message.includes("undefined/"),
      );
    });
  }
});
