import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
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

test("a throwing decider contributes the fallback and does not stop the others", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    Decision.sync(() => {
      throw new Error("boom");
    }),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "deny" }) as const),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "deny" });
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

const Close = Decision.decidable({
  key: "test/close",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "async",
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

test("an answer whose discriminant is not in the order falls back and does not win", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "elsewhere" })),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});
