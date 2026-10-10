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
  urlChain: ["https://example.com/report.pdf"],
  userGesture: true,
  contentDisposition: "",
};

// A registry for a web contents is never built bare in production: both owners pass one of
// `ContentsPosture`'s two postures, so every registry below that stands for a contents carries one.
// A bare `Registry.make({ owner: "contents" })` is a configuration no production contents has, and
// building the tests on one is how a window's `prompt` posture silently became what a *broken*
// download decider contributed. The two claims that are about the decidable's own declaration rather
// than about an owner are asserted on the declaration directly.
test("Decidables.WebContents.Download declares a closed failure, separate from either owner's fallback", () => {
  assert.deepEqual(Decidables.WebContents.Download.fallback, { kind: "deny" });
  assert.deepEqual(
    Decidables.WebContents.Download.failure,
    { kind: "deny" },
    "a broken download decider must deny whichever fallback its owner's posture declares",
  );
});

test("a broken download decider denies on a window, whose posture prompts when nobody objects", () => {
  const renderer = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  assert.deepEqual(
    renderer.resolveSync(Decidables.WebContents.Download, offer),
    { kind: "prompt" },
    "nobody objecting on a window prompts",
  );
  renderer.install(
    Decidables.WebContents.Download,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  // The declared failure, not this registry's own `prompt` override: a download guard that vets a
  // file and crashes has not established that the file is safe to hand to Electron's save dialog.
  assert.deepEqual(renderer.resolveSync(Decidables.WebContents.Download, offer), { kind: "deny" });
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
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  const first = renderer.resolveSync(Decidables.WebContents.Download, offer);
  assert.deepEqual(first, { kind: "prompt" });
  Object.assign(first, { kind: "deny" });
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
          // @ts-expect-error An empty filters array is deliberately off-schema.
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
    fallbacks: ContentsPosture.rendererFallbacks(),
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
  const contentsRegistry = () =>
    Registry.make({ owner: "contents", fallbacks: ContentsPosture.rendererFallbacks() });
  const saveThenPrompt = contentsRegistry();
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

  const promptThenDeny = contentsRegistry();
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
  const denyThenPrompt = contentsRegistry();
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

// The mechanism these two pin — a failing decider contributes the *registry's* own fallback rather
// than the decidable's — is only observable on a decidable that declares no `failure` of its own,
// since a declared one takes precedence over any per-owner override. `Download` declares `deny`, so
// they run on `Input` under a guest built with `input: "block"`: no declared failure, and a posture
// whose fallback ("block") differs from the catalog's ("allow").
test("a decider that throws contributes the registry's own fallback, not the decidable's", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.guestFallbacks("block"),
  });
  registry.install(
    Decidables.WebContents.Input,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "block");
});

// ADV10's analogue for a declared failure: `decision-registry.test.ts`'s ADV9/ADV10 pin the
// decidable's own fallback fresh on both the no-candidate path and the failing-decider-contributes
// path. The "decoded afresh" test above covers the no-candidate path for a per-owner override; this
// one covers the failing-decider-contributes branch (`resolveCore`'s `candidates.push(
// failure.contribute())`), which reads `Download`'s own declared failure through a different thunk.
test("the declared failure a failing decider contributes is also decoded afresh", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  registry.install(
    Decidables.WebContents.Download,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  const first = registry.resolveSync(Decidables.WebContents.Download, offer);
  assert.deepEqual(first, { kind: "deny" });
  Object.assign(first, { kind: "prompt" });
  const second = registry.resolveSync(Decidables.WebContents.Download, offer);
  assert.deepEqual(
    second,
    { kind: "deny" },
    "mutating the failure a broken decider contributed must not corrupt the next resolution",
  );
});

test("a decider that answers off-schema (the shape suspension would take too) contributes the registry's own fallback, the same way a throw does", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.guestFallbacks("block"),
  });
  registry.install(
    Decidables.WebContents.Input,
    // A sync decidable's decider cannot return an Effect at all — there is no way to "suspend" one
    // that type-checks — so the closest a sync decider can come is answering something the schema
    // rejects, which `resolveSync` already treats exactly like a throw: neither ever produces an
    // eligible candidate, so the fallback is what is left standing.
    // @ts-expect-error The runtime guard must reject the same answer the type checker refuses.
    Decision.sync(() => "later"),
  );
  // This registry's own override ("block"), not the decidable's catalog default ("allow") — proving
  // the off-schema path reaches the override the same way the throwing-decider path does above.
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "block");
});

test("on a window's posture, which overrides no input fallback, Input's own fallback allows input", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "allow");
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "mouse" }), "allow");
});

test("input is blocked while a decider answers block", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: ContentsPosture.rendererFallbacks(),
  });
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
    fallbacks: ContentsPosture.guestFallbacks("block"),
  });
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "block");
  registry.install(
    Decidables.WebContents.Input,
    Decision.sync(() => "allow"),
  );
  assert.equal(registry.resolveSync(Decidables.WebContents.Input, { kind: "key" }), "allow");
});
