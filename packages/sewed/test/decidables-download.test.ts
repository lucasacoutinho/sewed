import assert from "node:assert/strict";
import { test } from "node:test";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as ContentsPosture from "../src/internal/ContentsPosture.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

const offer = {
  url: "https://example.com/report.pdf",
  filename: "report.pdf",
  mimeType: "application/pdf",
  totalBytes: 42,
  sourceId: "s1",
};

test("with no decider installed, Decidables.WebContents.Download's own fallback denies", () => {
  const registry = Registry.make({ owner: "contents" });
  assert.deepEqual(registry.resolveSync(Decidables.WebContents.Download, offer), { kind: "deny" });
});

// Built from `ContentsPosture.guestFallbacks`/`rendererFallbacks` — the same functions
// `internal/GuestView.ts` and `internal/WebContents.ts` build their own registries from — rather than
// hand-assembled `Registry.fallback` calls, so a value either function returns fails this test
// directly. This does not prove which function either owner actually calls, or with what argument:
// those two calls live in files this suite cannot import, and that selection stays unverified here —
// see `ContentsPosture.ts`'s own doc for why, and the mutation checks in the report for what this
// test does catch.
test("a guest's own posture denies with no decider installed, while a renderer's own posture prompts", () => {
  const guest = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.guestFallbacks(undefined),
  });
  const renderer = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  assert.deepEqual(guest.resolveSync(Decidables.WebContents.Download, offer), { kind: "deny" });
  assert.deepEqual(renderer.resolveSync(Decidables.WebContents.Download, offer), {
    kind: "prompt",
  });
});

test("a guest's own posture fixes Input to the input it was constructed with, when one was given", () => {
  const withoutInput = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.guestFallbacks(undefined),
  });
  const withBlockedInput = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.guestFallbacks("block"),
  });
  assert.equal(withoutInput.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "allow");
  assert.equal(
    withBlockedInput.resolveSync(Decidables.WebContents.Input, { kind: "key" }),
    "block",
  );
});

test("a per-owner fallback override is decoded afresh too, so mutating a returned answer does not corrupt the next resolution", () => {
  const renderer = Registry.make({
    owner: "contents",
    fallbacks: [Registry.fallback(Decidables.WebContents.Download, { kind: "prompt" })],
  });
  const first = renderer.resolveSync(Decidables.WebContents.Download, offer);
  assert.deepEqual(first, { kind: "prompt" });
  first.kind = "deny";
  const second = renderer.resolveSync(Decidables.WebContents.Download, offer);
  assert.deepEqual(
    second,
    { kind: "prompt" },
    "mutating the first override answer must not corrupt a later resolution's fallback",
  );
});

test("a fallback override that fails to decode against its decidable's answer schema throws when the registry is built", () => {
  assert.throws(
    () =>
      Registry.make({
        owner: "contents",
        fallbacks: [
          // `filters` is a non-empty array in Dialog.SaveOptions; an empty one is off-schema.
          Registry.fallback(Decidables.WebContents.Download, {
            kind: "prompt",
            dialog: { filters: [] },
          }),
        ],
      }),
    /Fallback override for decidable "contents\/download" is not a valid answer/,
  );
});

test("a decider installed on the renderer's registry still overrides its own prompt fallback", () => {
  const renderer = Registry.make({
    owner: "contents",
    fallbacks: [Registry.fallback(Decidables.WebContents.Download, { kind: "prompt" })],
  });
  renderer.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "save", path: "/tmp/report.pdf" })),
  );
  assert.deepEqual(renderer.resolveSync(Decidables.WebContents.Download, offer), {
    kind: "save",
    path: "/tmp/report.pdf",
  });
});

test("two download deciders compose restrictively: deny beats prompt beats save, regardless of install order", () => {
  // Installed least-restrictive first, which is what "the latest installed decider wins"
  // (`internal/WebContents.ts:85-87`'s old behavior) would answer with "save" for — restrictive
  // composition never does, because it ranks by the declared order, not by install order.
  const saveThenPrompt = Registry.make({ owner: "contents" });
  saveThenPrompt.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "save", path: "/tmp/a" })),
  );
  saveThenPrompt.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  assert.deepEqual(saveThenPrompt.resolveSync(Decidables.WebContents.Download, offer), {
    kind: "prompt",
  });

  const promptThenDeny = Registry.make({ owner: "contents" });
  promptThenDeny.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  promptThenDeny.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "deny" })),
  );
  assert.deepEqual(promptThenDeny.resolveSync(Decidables.WebContents.Download, offer), {
    kind: "deny",
  });

  // Installed most-restrictive first this time: the answer is the same, proving rank decides it,
  // not install order in either direction.
  const denyThenPrompt = Registry.make({ owner: "contents" });
  denyThenPrompt.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "deny" })),
  );
  denyThenPrompt.install(
    Decidables.WebContents.Download,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  assert.deepEqual(denyThenPrompt.resolveSync(Decidables.WebContents.Download, offer), {
    kind: "deny",
  });
});

test("a decider that throws contributes the registry's own fallback, not the decidable's", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: [Registry.fallback(Decidables.WebContents.Download, { kind: "prompt" })],
  });
  registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  // The throwing decider contributes the registry's own fallback (prompt here, not the decidable's
  // catalog default of deny), which is the sole candidate and so wins.
  assert.deepEqual(registry.resolveSync(Decidables.WebContents.Download, offer), {
    kind: "prompt",
  });
});

// ADV10's analogue for a per-owner override: `decision-registry.test.ts`'s ADV9/ADV10 pin the
// decidable's own fallback fresh on both the no-candidate path and the failing-decider-contributes
// path. The earlier "decoded afresh" test above only covers the no-candidate path for an override;
// this one covers the failing-decider-contributes branch (`resolveCore`'s `candidates.push(fallback())`
// on failure), which is a different call site of the same `fallback` thunk.
test("a per-owner fallback a failing decider contributes is also decoded afresh", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: [Registry.fallback(Decidables.WebContents.Download, { kind: "prompt" })],
  });
  registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  const first = registry.resolveSync(Decidables.WebContents.Download, offer);
  assert.deepEqual(first, { kind: "prompt" });
  first.kind = "deny";
  const second = registry.resolveSync(Decidables.WebContents.Download, offer);
  assert.deepEqual(
    second,
    { kind: "prompt" },
    "mutating the fallback a failing decider contributed must not corrupt the next resolution",
  );
});

test("a decider that answers off-schema (the shape suspension would take too) contributes the registry's own fallback, the same way a throw does", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: [Registry.fallback(Decidables.WebContents.Download, { kind: "prompt" })],
  });
  registry.install(
    Decidables.WebContents.Download,
    // A sync decidable's decider cannot return an Effect at all — there is no way to "suspend" one
    // that type-checks — so the closest a sync decider can come is answering something the schema
    // rejects, which `resolveSync` already treats exactly like a throw: neither ever produces an
    // eligible candidate, so the fallback is what is left standing. This file is a plain test, never
    // typechecked, which is what lets it construct this off-schema answer at all.
    Decision.sync(() => "later"),
  );
  // The registry's own override (prompt), not the decidable's catalog default (deny) — proving the
  // off-schema path reaches the override the same way the throwing-decider path already does above.
  assert.deepEqual(registry.resolveSync(Decidables.WebContents.Download, offer), {
    kind: "prompt",
  });
});

test("with no decider installed, Decidables.WebContents.Input's own fallback allows input", () => {
  const registry = Registry.make({ owner: "contents" });
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "allow");
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "mouse" }), "allow");
});

test("input is blocked while a decider answers block", () => {
  const registry = Registry.make({ owner: "contents" });
  const remove = registry.install(
    Decidables.WebContents.Input,
    Decision.sync(() => "block"),
  );
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "block");
  remove();
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "allow");
});

test("a per-owner fallback blocks input by default, and a decider still composes over it", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: [Registry.fallback(Decidables.WebContents.Input, "block")],
  });
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "block");
  registry.install(
    Decidables.WebContents.Input,
    Decision.sync(() => "allow"),
  );
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "allow");
});
