import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Schema, SubscriptionRef } from "effect";
import * as Decision from "../src/Decision.ts";
import { SewedError } from "../src/SewedError.ts";

test("a restrictive decidable without an order fails Protocol at declaration", () => {
  assert.throws(
    () =>
      Decision.decidable({
        key: "test/no-order",
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
        key: "test/bad-fallback",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
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
        key: "test/repeated-order",
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
        key: "test/fallback-not-in-order",
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
        key: "test/first-with-order",
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
        key: "test/first-with-failure",
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
        key: "test/failure-not-in-order",
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
        key: "test/bad-failure",
        event: Schema.Struct({}),
        answer: Schema.Literals(["allow", "block"]),
        fallback: "allow",
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
        key: "test/chain-without-chain",
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
        key: "test/chain-on-restrictive",
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
        key: "test/chain-with-order",
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
        key: "test/chain-repeated-stop",
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
        key: "test/chain-sync",
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
  const stop = ["block"];
  const declared = Decision.decidable({
    key: "test/chain-frozen",
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
  const order = ["block", "allow"];
  const declared = Decision.decidable({
    key: "test/frozen",
    event: Schema.Struct({}),
    answer: Schema.Literals(["allow", "block"]),
    fallback: "allow",
    timing: "sync",
    composition: "restrictive",
    order,
  });
  assert.equal(Object.isFrozen(declared), true);
  order.push("mutated");
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
  assert.throws(() => Decision.policy(kind, { blockedHosts: "not-an-array" }));
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
