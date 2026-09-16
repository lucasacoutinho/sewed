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
  const Rules = Schema.Struct({ blockedHosts: Schema.Array(Schema.String) });
  const decider = Decision.policy(
    Rules,
    { blockedHosts: ["evil.example"] },
    (rules) => (event: { url: string }) =>
      rules.blockedHosts.some((host) => event.url.includes(host))
        ? ("block" as const)
        : ("allow" as const),
  );
  assert.equal(decider.decide({ url: "https://evil.example/path" }), "block");
  assert.equal(decider.decide({ url: "https://good.example/" }), "allow");
});

test("policy rejects invalid rule data immediately, before any event is decided", () => {
  const Rules = Schema.Struct({ blockedHosts: Schema.Array(Schema.String) });
  assert.throws(() =>
    Decision.policy(Rules, { blockedHosts: "not-an-array" }, () => () => "allow" as const),
  );
});
