import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Schema } from "effect";
import * as Decision from "../src/Decision.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

const Answer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({ kind: Schema.Literal("prompt") }),
  Schema.Struct({ kind: Schema.Literal("save") }),
]);

const Download = Decision.decidable({
  key: "test/download",
  event: Schema.Struct({ url: Schema.String }),
  answer: Answer,
  fallback: { kind: "save" } as const,
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("restrictive composition keeps the most restrictive answer, not the first", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "save" }) as const),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "deny" }) as const),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "prompt" }) as const),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "deny" });
});

test("a decider that passes contributes nothing and the rest still decide", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    Decision.sync(() => Decision.Pass),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "prompt" }) as const),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "prompt" });
});

test("with no decider, and with every decider passing, the fallback answers", () => {
  const registry = Registry.make();
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
  registry.install(
    Download,
    Decision.sync(() => Decision.Pass),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});

test("removing a decider's install stops it deciding", () => {
  const registry = Registry.make();
  const remove = registry.install(
    Download,
    Decision.sync(() => ({ kind: "deny" }) as const),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "deny" });
  remove();
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});

test("an answer whose discriminant is not in the order falls back and does not win", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "elsewhere" })),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});

test("a lazily-throwing discriminant getter does not abort a restrictive resolution", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    // "kind" in answer only checks the property exists; a getter that throws must not escape the
    // ranking step and abort resolveSync from inside what is meant to be a native callback.
    Decision.sync(() => ({
      get kind(): string {
        throw new Error("lazy boom");
      },
    })),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "deny" }) as const),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "deny" });
});

// Download's own fallback ("save") is the *least* restrictive answer, so a test built on Download
// cannot tell "a throw contributes the fallback" apart from "a throw contributes nothing": either
// way the other decider's real answer would win. Secure's fallback is the restrictive end instead,
// so the two behaviors diverge observably.
const Secure = Decision.decidable({
  key: "test/secure",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "deny" } as const,
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("under restrictive composition, a throwing decider contributes the fallback, not nothing", () => {
  const registry = Registry.make();
  registry.install(
    Secure,
    Decision.sync(() => {
      throw new Error("boom");
    }),
  );
  registry.install(
    Secure,
    Decision.sync(() => ({ kind: "prompt" }) as const),
  );
  // If the throw contributed nothing, "prompt" (the only real candidate) would win instead.
  assert.deepEqual(registry.resolveSync(Secure, {}), { kind: "deny" });
});

// An answer with a payload field: an in-order discriminant can still fail to decode (missing
// "reason"), which a bare-literal or single-field-struct answer never can. This is what makes the
// unfinished half of C2 observable.
const AnswerWithPayload = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny"), reason: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("prompt") }),
  Schema.Struct({ kind: Schema.Literal("save") }),
]);

const Payload = Decision.decidable({
  key: "test/payload",
  event: Schema.Struct({}),
  answer: AnswerWithPayload,
  fallback: { kind: "save" } as const,
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("restrictive composition moves on to the next-best-ranked candidate when the winner fails to decode, rather than answering the fallback outright", () => {
  const registry = Registry.make();
  registry.install(
    Payload,
    // In order (rank 0) by discriminant, but missing the required "reason" field: fails to decode.
    Decision.sync(() => ({ kind: "deny" })),
  );
  registry.install(
    Payload,
    Decision.sync(() => ({ kind: "prompt" }) as const),
  );
  // The fallback ("save") is less restrictive than "prompt" and must not win here: only the
  // malformed "deny" candidate is disqualified, and "prompt" is a valid, more-restrictive answer.
  assert.deepEqual(registry.resolveSync(Payload, {}), { kind: "prompt" });
});

const SharedKeySync = Decision.decidable({
  key: "test/shared-key",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "first",
});

const SharedKeyAsync = Decision.decidable({
  key: "test/shared-key",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "async",
  composition: "first",
});

test("two decidables that share a key string but differ in timing stay independent", () => {
  const registry = Registry.make();
  registry.install(
    SharedKeyAsync,
    // Genuinely suspends (never resolves synchronously): if the registry were keyed by the string
    // "test/shared-key" rather than decidable identity, resolveSync below would meet this entry
    // (installed through a *different* decidable) and Effect.runSync would throw AsyncFiberError
    // inside what is meant to be a synchronous native callback.
    Decision.async(() =>
      Effect.callback<"allow" | "block">((resume) => {
        setTimeout(() => resume(Effect.succeed("block")), 0);
      }),
    ),
  );
  registry.install(
    SharedKeySync,
    Decision.sync(() => "block" as const),
  );
  assert.equal(registry.resolveSync(SharedKeySync, {}), "block");
});

const Close = Decision.decidable({
  key: "test/close",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  // "first" composition and "sync" timing are independent: resolveSync requires sync timing, and
  // the deciders below are all synchronous either way, so this exercises "first" without touching
  // the async-timing/async-decider combination that belongs to the resolveAsync tests below.
  timing: "sync",
  composition: "first",
});

test("first composition keeps the first answer that is not Pass, in install order", () => {
  const registry = Registry.make();
  registry.install(
    Close,
    Decision.sync(() => Decision.Pass),
  );
  registry.install(
    Close,
    Decision.sync(() => "block" as const),
  );
  registry.install(
    Close,
    Decision.sync(() => "allow" as const),
  );
  assert.equal(registry.resolveSync(Close, {}), "block");
});

test("under first composition, a throwing decider contributes nothing and the next decider still decides", () => {
  const registry = Registry.make();
  registry.install(
    Close,
    Decision.sync(() => {
      throw new Error("boom");
    }),
  );
  registry.install(
    Close,
    Decision.sync(() => "block" as const),
  );
  assert.equal(registry.resolveSync(Close, {}), "block");
});

test("under first composition, an answer outside the schema is skipped and the next decider still decides", () => {
  const registry = Registry.make();
  registry.install(
    Close,
    Decision.sync(() => "nonsense"),
  );
  registry.install(
    Close,
    Decision.sync(() => "block" as const),
  );
  assert.equal(registry.resolveSync(Close, {}), "block");
});

test("a bare-literal answer ranks by its own value, with no kind field", () => {
  const Restrictive = Decision.decidable({
    key: "test/input",
    event: Schema.Struct({}),
    answer: Schema.Literals(["allow", "block"]),
    fallback: "allow" as const,
    timing: "sync",
    composition: "restrictive",
    order: ["block", "allow"],
  });
  const registry = Registry.make();
  registry.install(
    Restrictive,
    Decision.sync(() => "allow" as const),
  );
  registry.install(
    Restrictive,
    Decision.sync(() => "block" as const),
  );
  assert.equal(registry.resolveSync(Restrictive, {}), "block");
});

// resolveAsync: composition, Pass, and the failure paths C1 fixed (a synchronous throw before an
// async decider even returns its Effect, and a failure inside the returned Effect), on a decidable
// declared "async" so async deciders may legally install on it.
const CloseAsync = Decision.decidable({
  key: "test/close-async",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "async",
  composition: "first",
});

test("resolveAsync runs sync and async deciders in order and keeps the first non-Pass answer", async () => {
  const registry = Registry.make();
  registry.install(
    CloseAsync,
    Decision.sync(() => Decision.Pass),
  );
  registry.install(
    CloseAsync,
    Decision.async(() => Effect.succeed("block" as const)),
  );
  registry.install(
    CloseAsync,
    Decision.sync(() => "allow" as const),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "block");
});

test("resolveAsync: an async decider that throws synchronously, before returning its Effect, contributes nothing under first and does not stop the others", async () => {
  const registry = Registry.make();
  registry.install(
    CloseAsync,
    Decision.async(() => {
      throw new Error("sync throw in async decider");
    }),
  );
  registry.install(
    CloseAsync,
    Decision.sync(() => "block" as const),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "block");
});

test("resolveAsync: an async decider whose Effect fails contributes nothing under first and does not stop the others", async () => {
  const registry = Registry.make();
  registry.install(
    CloseAsync,
    Decision.async(() => Effect.die(new Error("boom"))),
  );
  registry.install(
    CloseAsync,
    Decision.sync(() => "block" as const),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "block");
});

const SecureAsync = Decision.decidable({
  key: "test/secure-async",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "deny" } as const,
  timing: "async",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("resolveAsync: under restrictive composition, a failing async decider contributes the fallback, not nothing", async () => {
  const registry = Registry.make();
  registry.install(
    SecureAsync,
    Decision.async(() => Effect.die(new Error("boom"))),
  );
  registry.install(
    SecureAsync,
    Decision.sync(() => ({ kind: "prompt" }) as const),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(SecureAsync, {}));
  assert.deepEqual(answer, { kind: "deny" });
});

test("resolveAsync answers the fallback with no decider installed", async () => {
  const registry = Registry.make();
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "allow");
});
