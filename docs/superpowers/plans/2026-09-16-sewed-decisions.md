# Decisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every mechanism that answers a native Electron event with one composing `decide` installed on the event's owner.

**Architecture:** A `Decidable` declares one event schema, one answer schema, a fallback, a timing, and how its deciders compose. Owners gain `decide(decidable, decider)`, a scoped install that removes itself when its scope closes. Synchronous deciders are plain functions because Electron needs the answer inside its callback; asynchronous ones return an Effect. Composition is declared per decidable: `restrictive` runs every decider and keeps the most restrictive answer, `first` keeps the first that is not `Pass`.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), Electron 44.3.0, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-15-platform-redesign-design.md`, section B, plus the four entries under "Decisions settled while implementing". Sections C to H describe later waves and are not implemented here.

## Global Constraints

- Commands run from the repository root: `pnpm typecheck` (`tsc -b`), `pnpm test`, `pnpm build`, and a single test file with `node --import tsx --test packages/sewed/test/<file>.test.ts`. There is no per-package `typecheck` script.
- Effect stays at the repository's pinned version. Add no dependency.
- The root package (`sewed`) imports no Electron module. Only `sewed/main` and `internal/*` main modules may. `Decision.ts` is Electron-free and ships from the root entry.
- Keep definitions inert: a decidable creates no native object and installs no handler.
- A synchronous decider is a plain function. It cannot return an Effect, so it cannot suspend.
- No `any`. Casts are limited to the dynamic bridges this repository already needs: `methods` and `table` in `Binding.ts`, and the handler layer `Capability.serve` builds. Adding a bridge elsewhere needs a ruling. The discriminant reader in Task 1 is written with `in` narrowing precisely so it needs none.
- Every public addition has a contract test in `packages/sewed/test/*-types.ts` and node tests for behavior.
- Breaking changes are allowed. Migrate the playground in the same task that breaks it, and leave no aliases.
- `pnpm build`, `timeout 240 pnpm test`, and `pnpm website:build` pass before a task is complete.
- Regenerate `docs/reference.md` in any task that changes a doc comment on a public export. `pnpm test` runs `api-reference.mjs --check` and fails on drift.
- Each task ends in one local commit. Do not push. Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Scope

In scope: the sixteen decidables in spec section B's catalog, with `Session.Request` split into three per the settled decisions, and the six installation shapes they replace. Session free functions move onto handle methods here, as the capability plan deferred them to this wave.

Out of scope: declarations and instance claim (C), contributions (D), readiness and local documents (E), the failure model (F), performance work (G), and `sewed check` (H). `sewed check` owns the two `root-entry.test.ts` weaknesses recorded in section H; leave that file alone.

**What the consumer costs are.** The playground's only use of any decision surface is `{ quitOnLastWindowClosed: true }` at `src/main/app.ts:96`, which Task 3 migrates. Every other migration cost in this wave falls on Sewed's own tests and guides.

## The six shapes being replaced

Each is a real mechanism in the branch today. The migration changes signatures, not just locations.

| Shape                  | Example                                                                                            | Removal        | Composes?             |
| ---------------------- | -------------------------------------------------------------------------------------------------- | -------------- | --------------------- |
| Nullable setter        | `setDisplayMedia(handle, decider \| null)` (`internal/DisplayMedia.ts:15`)                         | pass `null`    | no, replaces          |
| Module-level singleton | `App.login(decider)` (`App.ts:48`)                                                                 | scope close    | no, `Limit` on second |
| Event-less gate        | `App.guardQuit` (`App.ts:425`), `guardClose` (`internal/Window.ts:400`)                            | scope close    | no, `Limit` on second |
| Data policy            | `setPermissions`, `setCertificatePolicy`, `setPreconnect`, `setNavigationPolicy`, `setInputPolicy` | replace        | no, replaces          |
| Scoped rules with `R`  | `Session.intercept(handle, rules)` (`Session.ts:108`)                                              | scope close    | per stage only        |
| Stream-scoped decider  | `contents.downloads(decide)` (`internal/WebContents.ts:88`)                                        | stop consuming | no, **latest wins**   |

`guardQuit` and `guardClose` take a pre-built `Effect<boolean, never, R>` and never see the event they decide about. Those two are the only migrations that change a caller's logic rather than its spelling.

## File Structure

- Create: `packages/sewed/src/Decision.ts` — `decidable`, `Pass`, `sync`, `async`, `fromState`, `policy`, and the `Decider` type. Electron-free, exported from `sewed`.
- Create: `packages/sewed/src/internal/DecisionRegistry.ts` — the scoped install set per owner and decidable, and the pure composition that turns installed deciders into one answer.
- Create: `packages/sewed/src/Decidables.ts` — the catalog: every decidable declared once, grouped by owner. Electron-free.
- Modify: `packages/sewed/src/internal/WebContentsCore.ts` — `core` takes the contents registry instead of a `NavigationGuard`; navigation, popup, unload, and title decidables resolve through it.
- Modify: `packages/sewed/src/App.ts`, `internal/AppRuntime.ts`, `internal/CloseGate.ts`, `internal/Window.ts`, `internal/WebContents.ts`, `internal/GuestView.ts`, `internal/GuestInput.ts`, `internal/ContentsDownloads.ts`, `internal/Session.ts`, `internal/WebRequest.ts`, `internal/DisplayMedia.ts`, `Session.ts`, `GuestView.ts`.
- Modify: `packages/sewed/src/Testing.ts` — add `Testing.decide`.
- Create: `packages/sewed/test/decision.test.ts`, `decision-registry.test.ts`, `decision-types.ts`.
- Modify: `packages/sewed/test/session-preconnect.test.ts`, `guest-input.test.ts`, `guest-navigation.test.ts`, `contents-downloads.test.ts`, `webcontents-core.test.ts`, `session-extras*.ts`, `app-extras*.ts`, `lifecycle*.ts`.
- Modify: `docs/native-policy.md` (the main guide for this wave), `docs/app-lifecycle.md`, `docs/session-extras.md`, `docs/platform-surfaces.md`, `docs/guest-views.md`, `docs/api.md`, `docs/electron-coverage.md`, `docs/reference.md` (generated).
- Modify (playground, separate repository `../sewed-playground`, not a git repository): `src/main/app.ts` only.

---

### Task 1: The Decision core

The heart of the wave: a decidable, the three decider constructors, and the pure composition. No Electron, no owners, no installation. Everything here is synchronous or an Effect, and every rule is tested directly.

**Files:**

- Create: `packages/sewed/src/Decision.ts`
- Create: `packages/sewed/src/internal/DecisionRegistry.ts`
- Modify: `packages/sewed/src/index.ts` (export `Decision`)
- Test: `packages/sewed/test/decision.test.ts`, `packages/sewed/test/decision-registry.test.ts`, `packages/sewed/test/decision-types.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `Decision.decidable`, `Decision.Pass`, `Decision.sync`, `Decision.async`, `Decision.fromState`, `Decision.policy`, `Decision.Decidable<E, A, T>`, `Decision.Decider<E, A, R>`; and from the internal module `DecisionRegistry.make`, `.install`, `.resolveSync`, `.resolveAsync`.

- [ ] **Step 1: Write the failing test for composition**

```ts
// packages/sewed/test/decision-registry.test.ts
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
```

- [ ] **Step 2: Write the failing test for `first` composition and unknown answers**

```ts
// append to packages/sewed/test/decision-registry.test.ts
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
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `node --import tsx --test packages/sewed/test/decision-registry.test.ts`
Expected: FAIL — `Cannot find module '../src/Decision.ts'`.

- [ ] **Step 4: Write `Decision.ts`**

```ts
// packages/sewed/src/Decision.ts
import { Effect, Schema, SubscriptionRef } from "effect";
import { SewedError } from "./SewedError.ts";

/** Returned by a decider that declines to answer, so the remaining deciders and the fallback apply. */
export const Pass = Symbol.for("sewed/Decision/Pass");
export type Pass = typeof Pass;

export interface Decidable<Event, Answer, Timing extends "sync" | "async"> {
  readonly key: string;
  readonly event: Schema.Schema<Event>;
  readonly answer: Schema.Schema<Answer>;
  readonly fallback: Answer;
  readonly timing: Timing;
  readonly composition: "restrictive" | "first";
  /** Discriminant values, most restrictive first. Required when composition is "restrictive". */
  readonly order?: readonly string[];
}

export interface Sync<Event, Answer> {
  readonly _tag: "sync";
  readonly decide: (event: Event) => Answer | Pass;
}

export interface Async<Event, Answer, R> {
  readonly _tag: "async";
  readonly decide: (event: Event) => Effect.Effect<Answer | Pass, never, R>;
}

export type Decider<Event, Answer, R = never> = Sync<Event, Answer> | Async<Event, Answer, R>;

/**
 * Declares a decidable native event. The declaration is inert: it installs nothing and creates no
 * native object. A restrictive decidable must declare the order its answers rank in, because "most
 * restrictive" is data rather than a convention.
 */
export const decidable = <Event, Answer, Timing extends "sync" | "async">(
  options: Decidable<Event, Answer, Timing>,
): Decidable<Event, Answer, Timing> => {
  if (options.composition === "restrictive" && (options.order ?? []).length === 0)
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} composes restrictively and must declare its answer order`,
    });
  return options;
};

/** A decider Electron can run inside its own callback. It cannot suspend, so it returns no Effect. */
export const sync = <Event, Answer>(
  decide: (event: Event) => Answer | Pass,
): Sync<Event, Answer> => ({ _tag: "sync", decide });

/** A decider for a decidable whose answer may arrive later. */
export const async = <Event, Answer, R>(
  decide: (event: Event) => Effect.Effect<Answer | Pass, never, R>,
): Async<Event, Answer, R> => ({ _tag: "async", decide });

/**
 * A synchronous decider that answers from main-owned state. The read is atomic and current at the
 * callback: a synchronous decider cannot wait for an update that has not been applied, because
 * Electron requires the answer inside its callback.
 */
export const fromState = <S, Event, Answer>(
  state: SubscriptionRef.SubscriptionRef<S>,
  decide: (state: S, event: Event) => Answer | Pass,
): Sync<Event, Answer> =>
  sync((event) => decide(Effect.runSync(SubscriptionRef.get(state)), event));

/** Compiles rule data into a synchronous decider, so a policy stays data and still composes. */
export const policy = <Rules, Event, Answer>(
  schema: Schema.Schema<Rules>,
  rules: Rules,
  compile: (rules: Rules) => (event: Event) => Answer | Pass,
): Sync<Event, Answer> => sync(compile(Schema.decodeUnknownSync(schema)(rules)));
```

- [ ] **Step 5: Write `internal/DecisionRegistry.ts`**

```ts
// packages/sewed/src/internal/DecisionRegistry.ts
import { Effect } from "effect";
import type * as Decision from "../Decision.ts";

/**
 * Reads an answer's discriminant without a cast: a bare literal answer is its own discriminant, and
 * a tagged answer carries it in `kind`. `in` narrowing is what keeps this free of `as`.
 */
const discriminantOf = (answer: unknown): string | undefined => {
  if (typeof answer === "string") return answer;
  if (typeof answer === "object" && answer !== null && "kind" in answer) {
    const { kind } = answer;
    return typeof kind === "string" ? kind : undefined;
  }
  return undefined;
};

/** Lower ranks are more restrictive. An answer outside the declared order never wins. */
const rankOf = (answer: unknown, order: readonly string[]): number => {
  const discriminant = discriminantOf(answer);
  if (discriminant === undefined) return Number.POSITIVE_INFINITY;
  const index = order.indexOf(discriminant);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
};

interface Entry {
  readonly decidable: Decision.Decidable<never, never, "sync" | "async">;
  readonly decider: Decision.Decider<never, never, never>;
}

export const make = () => {
  const entries = new Map<string, Entry[]>();
  const listFor = (key: string): Entry[] => {
    const existing = entries.get(key);
    if (existing !== undefined) return existing;
    const created: Entry[] = [];
    entries.set(key, created);
    return created;
  };
  return {
    /** Installs a decider and returns its removal. Install order is the `first` composition's order. */
    install: (decidable, decider) => {
      const list = listFor(decidable.key);
      const entry = { decidable, decider };
      list.push(entry);
      return () => {
        const index = list.indexOf(entry);
        if (index !== -1) list.splice(index, 1);
      };
    },
    resolveSync: (decidable, event) => {
      // …see Step 6
    },
  };
};
```

The real module keeps the generic signatures the tests use; the implementer writes them so that
`install(Download, Decision.sync(...))` type-checks without a cast and a decider for one decidable
cannot be installed for another.

- [ ] **Step 6: Implement the two resolvers**

`resolveSync` runs every installed decider for the decidable's key in install order:

- A `sync` decider runs directly. A throw is caught, logged with `Effect.runFork(Effect.logError(...))`, and contributes the decidable's `fallback` — the spec's rule, and safe for restrictive kinds because their fallback is the restrictive end.
- An `async` decider installed on a synchronous decidable runs with `Effect.runSyncExitWith` and contributes the fallback if it fails or does not complete synchronously, exactly as `ContentsDownloads.deciderSync` already does. Prefer refusing this at install time instead if the types allow it; if they do, delete this bullet and say so in the report.
- Answers equal to `Pass` are dropped.
- `first`: the first remaining answer wins. `restrictive`: the answer with the lowest `rankOf` wins, ties going to the earlier install.
- No remaining answers: the `fallback`.

`resolveAsync` is the same with `Effect` results, running the deciders in order and awaiting each.

- [ ] **Step 7: Run the tests and verify they pass**

Run: `node --import tsx --test packages/sewed/test/decision-registry.test.ts`
Expected: PASS, all cases.

- [ ] **Step 8: Write the contract test**

```ts
// packages/sewed/test/decision-types.ts
import { Effect, Schema } from "effect";
import * as Decision from "../src/Decision.ts";

const Sync = Decision.decidable({
  key: "types/sync",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "restrictive",
  order: ["block", "allow"],
});

// A synchronous decider returns the answer or Pass, never an Effect.
export const ok = Decision.sync<{ readonly url: string }, "allow" | "block">(() => "block");

// @ts-expect-error A synchronous decider cannot return an Effect, so it cannot suspend
export const suspends = Decision.sync<{ readonly url: string }, "allow" | "block">(() =>
  Effect.succeed("block" as const),
);

// @ts-expect-error An answer outside the decidable's schema does not type-check
export const wrongAnswer = Decision.sync<{ readonly url: string }, "allow" | "block">(
  () => "maybe",
);

void Sync;
```

- [ ] **Step 9: Verify a restrictive decidable must declare its order**

```ts
// append to packages/sewed/test/decision.test.ts
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
```

- [ ] **Step 10: Run every check and commit**

```bash
pnpm typecheck && timeout 240 pnpm test && pnpm build && pnpm format:check
git add packages/sewed/src/Decision.ts packages/sewed/src/internal/DecisionRegistry.ts packages/sewed/src/index.ts packages/sewed/test/decision.test.ts packages/sewed/test/decision-registry.test.ts packages/sewed/test/decision-types.ts
git commit -m "feat: add the decision core, its composition, and its answer order"
```

---

### Task 2: Installing deciders on owners

Owners gain `decide`. The install is scoped, so closing the caller's scope removes it — the property every shape being replaced lacks. Nothing native migrates yet; this task proves installation, removal, closed-owner behavior, and the blocked stream against a fake owner.

**Files:**

- Modify: `packages/sewed/src/internal/DecisionRegistry.ts` (add the scoped `decide` builder)
- Modify: `packages/sewed/src/Decision.ts` (export the `Owner` shape the owners implement)
- Test: `packages/sewed/test/decision-install.test.ts`

**Interfaces:**

- Consumes: `Registry.make`, `install`, `resolveSync`, `resolveAsync` from Task 1.
- Produces: `DecisionRegistry.decide(registry, control)` returning
  `<E, A, R>(decidable: Decidable<E, A, T>, decider: Decider<E, A, R>) => Effect.Effect<void, SewedError, MainContext | Scope.Scope | R>`,
  which every owner in Tasks 3 to 6 exposes as its own `decide` method.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sewed/test/decision-install.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Schema, Scope } from "effect";
import * as Decision from "../src/Decision.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import { SewedError } from "../src/SewedError.ts";
import { main } from "../src/Testing.ts";

const Close = Decision.decidable({
  key: "test/close",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "restrictive",
  order: ["block", "allow"],
});

test("a decider decides while its scope is open and stops when the scope closes", async () => {
  const registry = Registry.make();
  const decide = Registry.decide(registry, { isClosed: () => false });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* decide(
          Close,
          Decision.sync(() => "block" as const),
        );
        assert.equal(registry.resolveSync(Close, {}), "block");
      }),
    ).pipe(Effect.provide(main)),
  );
  assert.equal(registry.resolveSync(Close, {}), "allow");
});

test("two deciders both run, and closing one leaves the other installed", async () => {
  const registry = Registry.make();
  const decide = Registry.decide(registry, { isClosed: () => false });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* decide(
          Close,
          Decision.sync(() => "allow" as const),
        );
        const inner = yield* Scope.make();
        yield* decide(
          Close,
          Decision.sync(() => "block" as const),
        ).pipe(Scope.provide(inner));
        assert.equal(registry.resolveSync(Close, {}), "block");
        yield* Scope.close(inner, Exit.void);
        assert.equal(registry.resolveSync(Close, {}), "allow");
      }),
    ).pipe(Effect.provide(main)),
  );
});

test("installing on a closed owner fails Closed", async () => {
  const registry = Registry.make();
  const decide = Registry.decide(registry, { isClosed: () => true });
  const exit = await Effect.runPromiseExit(
    Effect.scoped(
      decide(
        Close,
        Decision.sync(() => "block" as const),
      ),
    ).pipe(Effect.provide(main)),
  );
  assert.equal(exit._tag, "Failure");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test packages/sewed/test/decision-install.test.ts`
Expected: FAIL — `Registry.decide is not a function`.

- [ ] **Step 3: Implement `decide`**

```ts
// packages/sewed/src/internal/DecisionRegistry.ts
import { Effect, Scope } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

/** What an owner must expose for its deciders to refuse installation after it closes. */
export interface Control {
  readonly isClosed: () => boolean;
}

export const decide =
  (registry: ReturnType<typeof make>, control: Control) => (decidable, decider) =>
    Effect.gen(function* () {
      yield* MainContext;
      yield* Effect.acquireRelease(
        Effect.suspend(() =>
          control.isClosed()
            ? Effect.fail(
                new SewedError({
                  code: "Closed",
                  message: `Cannot install a decider for ${decidable.key}: its owner is closed`,
                }),
              )
            : Effect.sync(() => registry.install(decidable, decider)),
        ),
        (remove) => Effect.sync(() => remove()),
      );
    });
```

An asynchronous decider carries `R`; the returned Effect requires it, and the registry captures the
installing Effect's context, so the decider runs with the services its installer had. The close gate in
`internal/CloseGate.ts` captures context the same way for its own decision. (Cited without a line number
deliberately: three different things have occupied `CloseGate.ts:30-31` across this wave, and a stale
citation that still resolves to plausible code is worse than none.)

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --import tsx --test packages/sewed/test/decision-install.test.ts`
Expected: PASS.

- [ ] **Step 5: Run every check and commit**

```bash
pnpm typecheck && timeout 240 pnpm test && pnpm build && pnpm format:check
git add packages/sewed/src/internal/DecisionRegistry.ts packages/sewed/src/Decision.ts packages/sewed/test/decision-install.test.ts
git commit -m "feat: install deciders on an owner for the caller's scope"
```

---

## Two fallbacks the catalog states loosely

Both were found by reading the code this wave replaces. Settle them here, not in an implementer's head.

**`App.LastWindowClosed`'s fallback is platform-derived.** `App.ts:474-476` is
`options.quitOnLastWindowClosed ?? process.platform !== "darwin"`. The catalog says "quit". A constant
`quit` would change macOS behavior, and a library-installed darwin decider would out-rank every user
decider under `first` composition because it installs first. So the declaration reads
`fallback: process.platform === "darwin" ? "stay" : "quit"`. `process.platform` is Node, not Electron,
so `Decidables.ts` stays Electron-free and inert. This amends the catalog's fallback column.

**`WebContents.Download` has two fallbacks for one decidable.** The catalog says "deny for guests,
prompt for renderers", and a decidable declares one fallback. Resolve it at the owner, not the
decidable: `Registry.make({ fallbacks })` accepts per-decidable overrides declared where the owner is
constructed, so the guest contents declares `deny` and the renderer contents declares `prompt`, both
visible at their construction sites. Task 5 adds this; Task 1's `make()` takes no argument and Task 5
extends it. The decidable's own `fallback` stays `deny`, the safe end, for any owner that declares
nothing.

---

### Task 3: Application decidables

Migrates `App.Quit`, `App.LastWindowClosed`, `App.Login`, and `App.CertificateError`, and removes the
event-less quit gate, the login singleton, and two `App.run` options. This is the task that breaks the
playground's one line.

**Files:**

- Create: `packages/sewed/src/Decidables.ts` (the catalog; application decidables first)
- Modify: `packages/sewed/src/App.ts` (remove `guardQuit`, `login`, and the two options; add `decide`)
- Modify: `packages/sewed/src/internal/AppRuntime.ts` (hold a registry beside the gate)
- Modify: `packages/sewed/src/internal/CloseGate.ts` (ask the registry instead of one guard)
- Modify (playground): `../sewed-playground/src/main/app.ts:96`
- Test: `packages/sewed/test/decidables-app.test.ts`; modify `app-extras-types.ts`, `lifecycle.test.ts`

**Interfaces:**

- Consumes: `Decision.decidable`, `Decision.sync`, `Decision.async`, `Registry.make`, `Registry.decide`.
- Produces: `Decidables.App.Quit`, `.LastWindowClosed`, `.Login`, `.CertificateError`; `App.decide`.

- [ ] **Step 1: Write the failing contract test for the removals**

```ts
// packages/sewed/test/app-extras-types.ts — append
// @ts-expect-error guardQuit is replaced by App.decide(Decidables.App.Quit, …)
App.guardQuit(Effect.succeed(true));
// @ts-expect-error login is replaced by App.decide(Decidables.App.Login, …)
App.login(() => Effect.succeed({ kind: "cancel" as const }));
// @ts-expect-error quitOnLastWindowClosed is replaced by Decidables.App.LastWindowClosed
App.run(Effect.void, { quitOnLastWindowClosed: true });
// @ts-expect-error certificateErrors is replaced by Decidables.App.CertificateError
App.run(Effect.void, { certificateErrors: [] });
```

- [ ] **Step 2: Write the failing behavior test**

```ts
// packages/sewed/test/decidables-app.test.ts
test("two quit deciders both run and a denial is not widened by a later allow", async () => {
  // install allow then deny on App.Quit; assert the resolved answer is deny
});

test("the last-window fallback follows the platform", () => {
  assert.equal(
    Decidables.App.LastWindowClosed.fallback,
    process.platform === "darwin" ? "stay" : "quit",
  );
});

test("a login decider that fails cancels its challenge and logs", async () => {
  // assert the resolved answer is { kind: "cancel" }
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `node --import tsx --test packages/sewed/test/decidables-app.test.ts`
Expected: FAIL — `Decidables` does not exist.

- [ ] **Step 4: Declare the application decidables**

```ts
// packages/sewed/src/Decidables.ts
import { Schema } from "effect";
import * as Application from "./Application.ts";
import * as Certificate from "./Certificate.ts";
import * as Decision from "./Decision.ts";

const Allowance = Schema.Literals(["deny", "allow"]);

export const App = {
  /** Asked before the application quits; a denial keeps it running. */
  Quit: Decision.decidable({
    key: "app/quit",
    event: Schema.Struct({}),
    answer: Allowance,
    fallback: "allow" as const,
    timing: "async",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /** Asked when the last window closes. The fallback preserves today's platform default. */
  LastWindowClosed: Decision.decidable({
    key: "app/last-window-closed",
    event: Schema.Struct({}),
    answer: Schema.Literals(["quit", "stay"]),
    fallback: process.platform === "darwin" ? ("stay" as const) : ("quit" as const),
    timing: "sync",
    composition: "first",
  }),
  /** Asked for each HTTP authentication challenge; without an answer the challenge is cancelled. */
  Login: Decision.decidable({
    key: "app/login",
    event: Application.LoginChallenge,
    answer: Application.LoginResponse,
    fallback: { kind: "cancel" } as const,
    timing: "async",
    composition: "first",
  }),
  /** Asked for each TLS error; without an answer Chromium's rejection stands. */
  CertificateError: Decision.decidable({
    key: "app/certificate-error",
    event: Schema.Struct({ url: Schema.String, certificate: Certificate.Presented }),
    answer: Schema.Literals(["trust", "reject"]),
    fallback: "reject" as const,
    timing: "async",
    composition: "restrictive",
    order: ["reject", "trust"],
  }),
};
```

- [ ] **Step 5: Rewire the quit gate**

`CloseGate.make` keeps its `request`/`approve`/`close` plumbing and its forked-fiber execution
(`internal/CloseGate.ts:26-84`) but takes a registry and a decidable instead of one guard: `request()`
resolves the decidable and approves when the answer allows. Delete `isGuarded`, the `Limit` failure,
and the single `guard` slot — composition replaces all three. `AppRuntime.make` builds the registry and
exposes it beside the gate so `App.decide` can reach it through `AppRuntime.Owner`.

- [ ] **Step 6: Replace the `App.run` options**

Delete `quitOnLastWindowClosed` and `certificateErrors` from `Options` (`App.ts:17-32`). `App.ts:474-476`
resolves `LastWindowClosed` and quits when the answer is `quit`. `App.ts:498-521` resolves
`CertificateError` and calls `callback(true)` only on `trust`; the old hostname matching moves into a
`Decision.policy(Certificate.Policy, rules, compile)` a consumer installs, so the rule data survives and
now composes. `App.ts:522-546` resolves `Login` and drops the `loginDecider` module variable entirely.

- [ ] **Step 7: Migrate the playground**

`../sewed-playground/src/main/app.ts:96` drops `{ quitOnLastWindowClosed: true }` and installs
`App.decide(Decidables.App.LastWindowClosed, Decision.sync(() => "quit"))` inside the program instead.

- [ ] **Step 8: Run every check and commit**

```bash
pnpm typecheck && timeout 240 pnpm test && pnpm build && pnpm format:check
git commit -m "feat: decide application quit, last window, login, and certificate errors"
```

---

### Task 4: Window and navigation decidables

Migrates `Window.Close`, `WebContents.Navigation`, and `WebContents.Popup`, and adds
`WebContents.TitleUpdate` and `WebContents.Unload`. `core` stops taking a `NavigationGuard` and takes
the owner's registry, which is the seam the whole wave turns on.

**Files:**

- Modify: `packages/sewed/src/Decidables.ts`, `packages/sewed/src/internal/WebContentsCore.ts`,
  `packages/sewed/src/internal/Window.ts`, `packages/sewed/src/internal/WebContents.ts`,
  `packages/sewed/src/internal/GuestView.ts`, `packages/sewed/src/WebContents.ts`
- Test: `packages/sewed/test/decidables-navigation.test.ts`; modify `webcontents-core.test.ts`,
  `guest-navigation.test.ts`, `window-extras-types.ts`

**Interfaces:**

- Consumes: Task 2's `Registry.decide`; Task 3's `Decidables` module shape.
- Produces: `Decidables.Window.Close`; `Decidables.WebContents.Navigation`, `.Popup`, `.TitleUpdate`,
  `.Unload`; `Navigation.Policy` replacing both navigation schemas; `window.decide`,
  `contents.decide`.

- [ ] **Step 1: Write the failing tests**

Cover, each as its own test: two navigation deciders compose restrictively and neither can widen the
other's denial; a denied navigation still appears on `blocked` with `kind: "navigation"`; a popup is
denied with no decider installed (today's hard-coded behavior at `internal/WebContentsCore.ts:101-104`)
and can be allowed by a decider; `will-prevent-unload` honors the page by default; a close decider sees
the event, which `guardClose` could not.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --import tsx --test packages/sewed/test/decidables-navigation.test.ts`

- [ ] **Step 3: Declare the decidables**

```ts
// packages/sewed/src/Decidables.ts — append
export const Window = {
  /** Asked before a window closes; a denial keeps it open. The decider sees which window. */
  Close: Decision.decidable({
    key: "window/close",
    event: Schema.Struct({ windowId: Schema.String }),
    answer: Allowance,
    fallback: "allow",
    timing: "async",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
};

export const WebContents = {
  Navigation: Decision.decidable({
    key: "contents/navigation",
    event: Schema.Struct({
      url: Schema.String,
      kind: Schema.Literals(["navigation", "redirect", "webview"]),
    }),
    answer: Allowance,
    fallback: "deny", // the entry document stays allowed without consulting deciders
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  Popup: Decision.decidable({
    key: "contents/popup",
    event: Schema.Struct({ url: Schema.String }),
    answer: Allowance,
    fallback: "deny",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  TitleUpdate: Decision.decidable({
    key: "contents/title-update",
    event: Schema.Struct({ title: Schema.String }),
    answer: Schema.Literals(["keep", "accept"]),
    fallback: "keep",
    timing: "sync",
    composition: "first",
  }),
  Unload: Decision.decidable({
    key: "contents/unload",
    event: Schema.Struct({ url: Schema.String }),
    answer: Schema.Literals(["honor", "override"]),
    fallback: "honor",
    timing: "sync",
    composition: "first",
  }),
};
```

- [ ] **Step 4: Change `core`'s seam**

`core(native, guard)` (`internal/WebContentsCore.ts:75`) becomes `core(native, owner)` where `owner`
carries the registry and the blocked publisher. `checkNavigation` resolves `Navigation` instead of
calling `guard.allows`, and keeps `event.preventDefault()` plus the blocked publish. The entry-document
allowance that `internal/WebContents.ts:29-30` computes stays where it is: it is the owner's own
allowance, checked before deciders run, so `load` and same-document History moves need no decider.
`setWindowOpenHandler` resolves `Popup`. Add listeners for `will-prevent-unload` and
`page-title-updated`. Delete the `NavigationGuard` interface (`:28-31`).

- [ ] **Step 5: Merge the two navigation schemas**

`WebContents.NavigationPolicy` (URL rules) and the guest's match-pattern policy become one
`Navigation.Policy` accepting both rule shapes, compiled by `Decision.policy`. Delete
`setNavigationPolicy` from `internal/WebContents.ts:50-59` and `internal/GuestView.ts:223-226`, and
delete `GuestNavigation.make`'s `replace` path where it exists only to serve that setter.

- [ ] **Step 6: Replace `guardClose`**

Delete `guardClose` (`internal/Window.ts:400-401`). `CloseGate` at `internal/Window.ts:119` resolves
`Window.Close` with the window's id as the event. Windows expose `decide`.

- [ ] **Step 7: Run every check and commit**

```bash
pnpm typecheck && timeout 240 pnpm test && pnpm build && pnpm format:check
git commit -m "feat: decide navigation, popups, window close, title updates, and unload"
```

---

### Task 5: Input and download decidables

Migrates `WebContents.Input` and `WebContents.Download`, adds per-owner fallbacks, and splits the
download decision away from the stream of accepted downloads.

**Files:**

- Modify: `packages/sewed/src/Decidables.ts`, `packages/sewed/src/internal/DecisionRegistry.ts`
  (per-owner fallbacks), `packages/sewed/src/internal/GuestInput.ts`,
  `packages/sewed/src/internal/ContentsDownloads.ts`, `packages/sewed/src/internal/WebContents.ts`,
  `packages/sewed/src/internal/GuestView.ts`, `packages/sewed/src/GuestView.ts`
- Test: `packages/sewed/test/decidables-download.test.ts`; modify `guest-input.test.ts`,
  `contents-downloads.test.ts`, `guest-types.ts`

**Interfaces:**

- Consumes: Task 2's install, Task 4's `contents.decide`.
- Produces: `Decidables.WebContents.Input`, `.Download`; `Registry.make({ fallbacks })`;
  `contents.downloads` as a plain `Stream<Download.Handle>` with no decider argument.

- [ ] **Step 1: Write the failing tests**

Cover: a guest with no download decider denies (its declared fallback) while a renderer with none
prompts; two download deciders compose restrictively so `deny` beats `prompt` beats `save`, which is
what "the latest installed decider wins" at `internal/WebContents.ts:85-87` cannot do; a denied download
appears on `blocked` with `kind: "download"`; a decider that throws or suspends denies, preserving
`ContentsDownloads.deciderSync`'s behavior; input is blocked while a decider answers `block`.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Declare the decidables and add per-owner fallbacks**

```ts
// packages/sewed/src/Decidables.ts — append to WebContents
  Input: Decision.decidable({
    key: "contents/input",
    event: Schema.Struct({ kind: Schema.Literals(["key", "mouse"]) }),
    answer: Schema.Literals(["block", "allow"]),
    fallback: "allow",
    timing: "sync",
    composition: "restrictive",
    order: ["block", "allow"],
  }),
  Download: Decision.decidable({
    key: "contents/download",
    event: Download.Offer,
    answer: Download.Decision,
    fallback: { kind: "deny" },
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "prompt", "save"],
  }),
```

`Registry.make` gains an options argument: `make(options: { readonly fallbacks?: ReadonlyMap<string, unknown> } = {})`.
`resolveSync` and `resolveAsync` read `options.fallbacks?.get(decidable.key) ?? decidable.fallback`, and
the value is validated against the decidable's answer schema when the registry is built, so a bad
override fails at construction rather than inside an Electron callback.

- [ ] **Step 4: Split the download surface**

`ContentsDownloads.Entry.decide` is filled from the registry rather than from a caller's function, so
`deciderSync` moves behind the registry's synchronous path. `contents.downloads`
(`internal/WebContents.ts:88-112`) loses its `decide` parameter and becomes a stream of accepted
`Download.Handle` values; `GuestView.Handle.downloads` at `GuestView.ts:99` changes the same way.
`GuestInput.install`'s `set` is replaced by a registry resolution inside its existing gate listener
(`internal/GuestInput.ts:18-20`), and `setInputPolicy` is deleted from `GuestView.ts:96`.

- [ ] **Step 5: Run every check and commit**

```bash
pnpm typecheck && timeout 240 pnpm test && pnpm build && pnpm format:check
git commit -m "feat: decide guest input and downloads, with per-owner fallbacks"
```

---

### Task 6: Session policy decidables

Migrates `Session.Permission`, `Session.Preconnect`, `Session.Certificate`, and
`Session.DisplayMedia`, and moves the session free functions onto handle methods, which the capability
plan deferred to this wave.

**Files:**

- Modify: `packages/sewed/src/Decidables.ts`, `packages/sewed/src/internal/Session.ts`,
  `packages/sewed/src/internal/DisplayMedia.ts`, `packages/sewed/src/Session.ts`
- Test: `packages/sewed/test/decidables-session.test.ts`; modify `session-preconnect.test.ts`,
  `session-extras.test.ts`, `session-extras-types.ts`

**Interfaces:**

- Consumes: Task 2's install.
- Produces: `Decidables.Session.Permission`, `.Preconnect`, `.Certificate`, `.DisplayMedia`;
  `session.decide`, and session operations as handle methods.

- [ ] **Step 1: Write the failing tests**

Cover: with no decider a permission check denies and a preconnect is allowed, matching
`internal/Session.ts:65` and `:73-74`; two permission deciders compose so neither can widen the other's
denial; a certificate decider answering `trust` returns `callback(0)` and `reject` returns
`callback(-2)` while no answer returns `callback(-3)`, preserving `internal/Session.ts:122-128`; a
display-media decider that fails denies, preserving `internal/DisplayMedia.ts:41-45`.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Declare the decidables**

`Permission` is sync, fallback `deny`, restrictive with order `["deny", "allow"]`; its event carries the
permission name and the requesting document, which `allowed` at `internal/Session.ts:41-59` already
computes — that function becomes the event builder, not the decision. `Preconnect` is sync, fallback
`allow`, restrictive with order `["deny", "allow"]`, replacing the boolean per the settled decisions.
`Certificate` is async, fallback `system`, restrictive with order `["reject", "system", "trust"]`.
`DisplayMedia` is async, fallback `{ kind: "deny" }`, restrictive with order `["deny", "source"]` (the answer's own discriminants — `DesktopCapturer.Decision` has no `"grant"` member).

- [ ] **Step 4: Rewire the native handlers**

`fromNative` (`internal/Session.ts:61-79`) keeps installing the three permission handlers and the
preconnect listener at acquisition — that timing is deliberate and stays — but each now resolves its
decidable against the session's registry instead of reading `state.rules` and `state.preconnect`. Delete
`rules`, `certificates`, and `preconnect` from `State` (`:21-26`), and delete `setPermissions`,
`setCertificatePolicy`, and `setPreconnect`. `setDisplayMedia` (`internal/DisplayMedia.ts:15`) becomes a
`DisplayMedia` resolution; its `null` removal path disappears because scope close removes deciders.

- [ ] **Step 5: Move the free functions onto the handle**

`Session.fromPartition` and `defaultSession` return a handle whose methods replace the free functions
(`cookies`, `clearStorage`, `closeAllConnections`, `resolveHost`, `blobData`, `requests`, `decide`),
matching how windows and contents already read. Update `docs/sessions.md` and `docs/session-extras.md`.

- [ ] **Step 6: Run every check and commit**

```bash
pnpm typecheck && timeout 240 pnpm test && pnpm build && pnpm format:check
git commit -m "feat: decide session permissions, preconnect, certificates, and display media"
```

---

### Task 6b: Policies compile themselves

**Why this task exists.** The spec (section B) spells a policy decider with two arguments:

```ts
yield *
  window.webContents.decide(WebContents.Navigation, Decision.policy(Navigation.Policy, rules));
```

What shipped takes three — `Decision.policy(schema, rules, compile)` — and no `compile` exists anywhere
in Sewed, so the **consumer** writes it. Tasks 3, 4 and 6 each deleted one of Sewed's rule matchers on the
strength of that signature. The playground shows the result: to pin one certificate, an app hand-writes
fifteen lines of lowercase-and-`*.`-suffix hostname matching. That is security-sensitive matching logic
Sewed used to own, and `Permission.Policy`, `Permission.Rule`, `Certificate.Policy` and `Certificate.Rule`
are now exported with nothing that accepts them. This was the plan's defect, not any implementer's.

**The design, already proven.** a scratch type probe, kept in the wave's SDD workspace while it ran, compiles
clean against the real `Decision.Owner["decide"]` signature (`tsc` exit 0), was **run** and answered all
twelve behaviour cases correctly (lookalike suffix passes, pin mismatch rejects), and each of its four
`@ts-expect-error` cases was checked to fail for the stated reason — a misspelled rule kind is `TS2820`
("Did you mean 'origin'?"), and a navigation policy installed on a permission decidable reports
`Property 'url' is missing`. Read it first: it is the shape to build, not a suggestion.

**Files:**

- Modify: `packages/sewed/src/Decision.ts` — add `Policy`, `definePolicy`; change `policy` to two arguments
- Modify: `packages/sewed/src/Navigation.ts`, `packages/sewed/src/Permission.ts`, `packages/sewed/src/Certificate.ts`
- Modify: `packages/sewed/src/Decidables.ts` — `App.CertificateError`'s event gains `hostname`
- Modify: `packages/sewed/src/App.ts` — the `certificate-error` event builder supplies `hostname`
- Modify: `packages/sewed/src/GuestView.ts`, `packages/sewed/src/internal/GuestNavigation.ts` — follow the schema rename
- Test: `packages/sewed/test/decision.test.ts`, `packages/sewed/test/decision-types.ts`, a new
  `packages/sewed/test/policies.test.ts`, `packages/sewed/test/decidables-app.test.ts`,
  `packages/sewed/test/app-extras-types.ts`, `packages/sewed/test/types.ts`,
  `packages/sewed/test/session-extras.test.ts`
- Docs: `docs/sessions.md`, `docs/session-extras.md`, `docs/app-lifecycle.md`, `docs/api.md`, then
  regenerate `docs/reference.md`. Leave `docs/native-policy.md` to Task 8.
- Playground: every `Decision.policy(` in `src/` **and** `scripts/`, plus any hand-written permission,
  certificate or navigation decider that a policy now expresses.

**Interfaces:**

- Consumes: `Decision.sync`, `Decision.Pass`, `Decision.Sync`, `Decision.Owner`, the decidables in
  `Decidables.ts`, `UrlRule.compile`, `Navigation.compile`.
- Produces:

```ts
// Decision.ts
/** Rule data plus the compile that turns it into a decider. */
export interface Policy<Rules, Event, Answer> {
  readonly rules: Schema.Codec<Rules>;
  readonly compile: (rules: Rules) => (event: Event) => Answer | Pass;
}
export const definePolicy: <Rules, Event, Answer>(options: {
  readonly rules: Schema.Codec<Rules>;
  readonly compile: (rules: NoInfer<Rules>) => (event: Event) => Answer | Pass;
}) => Policy<Rules, Event, Answer>; // frozen
export const policy: <Rules, Event, Answer>(
  kind: Policy<Rules, Event, Answer>,
  rules: NoInfer<Rules>,
) => Sync<Event, Answer>; // decodes `rules`, throws on invalid data, as today
```

and, per module, the **schema is renamed `Rules` and `Policy` becomes the policy value**:
`Navigation.Rules` / `Navigation.Policy`, `Permission.Rules` / `Permission.Policy`,
`Certificate.Rules` / `Certificate.Policy`. `Rule` (singular), `Trust`, `Presented`, `Name` and
`Navigation.compile` keep their names. No aliases: the old meaning of each `Policy` is pinned gone by a
negative contract assertion (`Schema.decodeUnknownSync(Navigation.Policy)` no longer type-checks).

**The one rule every policy follows — a policy is a grant list.**

> A policy answers only for what its rules match, and answers `Decision.Pass` for everything else.

Every policy-bearing decidable falls back closed (`Navigation` deny, `Popup` deny, `Session.Permission`
deny, `App.CertificateError` reject, `Session.Certificate` system), so a miss is still denied — and two
features' policies compose as a **union of grants** instead of vetoing each other. A policy that answered
`"deny"` on a miss would, under `restrictive`, silently revoke every other feature's grants. Deny-on-miss
remains a legitimate thing to want — a **cap** nobody can widen — and is spelled as an explicit
`Decision.sync`; the guest view's fixed navigation decider in `internal/GuestView.ts` is exactly that and
**stays as it is**.

**Each policy names the least it needs from an event**, so it installs on every decidable that provides it:

- `Navigation.Policy` compiles against `{ readonly url: string }` → installs on `WebContents.Navigation`
  **and** `WebContents.Popup`. An unparseable URL is a miss.
- `Permission.Policy` compiles against
  `{ readonly name: string; readonly origin: string | null; readonly document: string | null }` — the flat event
  Task 6's fix round landed, where `document` is `null` for a device check. An **origin** rule is answered
  from `origin`, and misses when it is `null` (an opaque origin — `file:`, `data:` — names nothing); a **document** rule is answered only from `document`, so no
  document rule grants a device check. **This is deliberately tighter than base**, where a _root_-document
  rule (`https://b.example/`) granted HID/serial/USB to the whole origin, because a device check's origin
  URL happens to share that document key. Pin it with a test named for it.
- `Certificate.Policy` compiles against
  `{ readonly hostname: string; readonly certificate: { readonly fingerprint: string } }` and answers
  `"trust" | "reject" | Pass`: first matching rule wins within one policy; hostnames compare lowercased;
  a `*.` pattern matches the bare suffix and any subdomain; `trust: "system"` and no-match both `Pass`;
  `"always"` trusts; a `{ fingerprint }` trusts on equality and **rejects** on mismatch. Because `"system"`
  maps to `Pass`, the same policy installs on `Session.Certificate` (three answers) and on
  `App.CertificateError` (two) — which is why that decidable's event gains `hostname`
  (`URL.parse(url)?.hostname ?? ""` in `App.ts`'s builder; keep `url`).

**One carried item — close the family, not the instance.** Task 6 made `Session.Permission`'s `origin`
a real `null` when the origin is opaque, because `URL.origin` reports the _string_ `"null"` for every
`file:` and `data:` document. Exactly one other decidable event carries an origin:
`DesktopCapturer.Request.origin` (`DesktopCapturer.ts`, built in `internal/DisplayMedia.ts`). Give it the
same treatment — `Schema.NullOr(Schema.String)`, `null` when opaque — with a test named "an opaque
screen-share origin reaches a decider as null", a contract pin, and the guide sentence. That is the whole
family: it was enumerated, not sampled.

- [ ] **Step 1: Write the failing tests** — new `packages/sewed/test/policies.test.ts`, importing
      `../src/` (all five modules are Electron-free; confirm by importing, not by assuming). Resolve through a
      real `Registry.make()` so composition is proven end to end. At minimum, by name:
  - "two permission policies each grant their own document" — install two `Permission.Policy` deciders
    with disjoint rules; both documents resolve `allow`; a third document resolves `deny`.
  - "a permission policy grants only the permissions its rule names"
  - "an origin rule grants a device check and a document rule does not"
  - "a certificate policy does not match a lookalike suffix" (`notinternal.example` against `*.internal.example`)
  - "a navigation policy installs on navigation and on popup"
  - "a certificate policy matches exact and *.-suffix hostnames, case-insensitively" (move the existing
    test of this from `decidables-app.test.ts`, deleting its hand-written compile)
  - "a certificate policy rejects a pinned fingerprint that does not match"
  - "a certificate policy leaves a system rule and an unmatched host to Chromium" — on
    `Session.Certificate` the answer is `system`, on `App.CertificateError` it is `reject`
  - "a policy refuses rule data its schema rejects" and "… a non-canonical origin" (both throw at
    `Decision.policy`, before any install)
- [ ] **Step 2: Run them and watch them fail** for the right reason (two-argument `policy` does not exist).
- [ ] **Step 3: Implement** `Decision.ts`, then the three modules, then `Decidables.ts` / `App.ts`.
- [ ] **Step 4: Contract tests** in `decision-types.ts` / `types.ts` / `app-extras-types.ts`: the natural
      unannotated spellings from the probe; the four negatives from the probe; the three-argument form is gone
      (`@ts-expect-error`); a consumer-defined `Decision.definePolicy` infers its `compile` parameter from
      `rules` with no annotation.
- [ ] **Step 5: Mutation-check what proves a rule**, reporting each failing test by name and message:
      change a policy's miss from `Pass` to the closed answer (the two-policies test must fail); drop the
      lowercasing; drop `permissions.has`; map `"system"` to `"trust"`.
- [ ] **Step 6: Docs.** Every policy example becomes two-argument. `docs/session-extras.md` gains a short
      "grant or cap" paragraph: a policy grants and passes; a cap is an explicit `Decision.sync` that denies on
      a miss; show one of each. Any hand-written decider example that ends `: "deny"` on a closed-fallback
      decidable becomes `: Decision.Pass` unless the prose says it is a cap. Regenerate `docs/reference.md`.
- [ ] **Step 7: Playground.** Migrate, rebuild, repack (`node scripts/release.mjs pack .artifacts`),
      reinstall, **confirm the installed `lib` carries two-argument `policy`**, then run `verify:app-extras`,
      `verify:session-resources`, `verify:sessions`, `verify:session-extras`, `verify:platform`.
- [ ] **Step 8: Run all five root commands and commit.**

---

### Task 7a: What a failing decider answers, and the chain composition

**Why this task exists.** Two defects in the decision core, both found while preparing the request
stages, both already live.

1. **"Fallback" does two jobs.** It is what happens when nobody has an opinion _and_ what a broken decider
   contributes under `restrictive`. Those coincide only when the fallback is the closed answer. Run today:
   a crashing unsaved-changes guard on `Window.Close` resolves `"allow"` and the window closes; a crashing
   quit guard resolves `"allow"`; a crashing fingerprint-pinning decider on `Session.Certificate` resolves
   `"system"`, so Chromium accepts any CA-valid certificate the pin would have rejected. At the wave's base
   both guards logged _"Close guard failed; request denied"_ and **denied** — Tasks 3 and 4 regressed that,
   because the registry now contains the failure before `CloseGate`'s own `catchCause` can see it. The
   request stages need fallback `allow` and failure `block`, which is what base documents ("a decider that
   fails or dies blocks its request"), so the conflation cannot stand.
2. **Header rewriting is a fold, not a ranking.** Base `internal/WebRequest.ts` chains header deciders:
   each sees the headers the previous one produced, and `block` ends it. Under `restrictive`, two
   `headers` answers rank equal, the first-installed wins, and the second feature's headers silently
   vanish — Electron's single-listener clobbering, reintroduced one level up. The spec says a decidable's
   combining rule must be "visible where the event is defined", so this is a third declared composition,
   not a `restrictive` label that WebRequest quietly folds.

**The declaration surface, already proven.** a scratch type probe, kept in the wave's SDD workspace while it ran,
compiles clean (`tsc` exit 0). Checked with the directives stripped: `advance`'s parameters are genuinely
inferred, not `any` (a sabotaged `answer.kind === "headerz"` is `TS2367` against
`"allow" | "block" | "headers"`); a chain decidable is refused by `resolveAsync` and a ranked one by
`resolveChain`; `stop: ["blcok"]` and `failure: { kind: "blok" }` are both `TS2820` "Did you mean
'block'?". It is a _model_ of the types, not an edit of `Decision.ts` — build the real thing to match it.

**Files:**

- Modify: `packages/sewed/src/Decision.ts`, `packages/sewed/src/internal/DecisionRegistry.ts`
- Modify: `packages/sewed/src/Decidables.ts` — declare `failure` where listed below
- Modify: `packages/sewed/src/internal/Session.ts` — the certificate proc's `NativeAnswer` closed form
  becomes `callback(-2)`, matching the decidable's new failure contract
- Test: `packages/sewed/test/decision-registry.test.ts`, `decision.test.ts`, `decision-types.ts`,
  `decidables-app.test.ts`, `decidables-navigation.test.ts`, `decidables-session.test.ts`
- Docs: `docs/session-extras.md`, `docs/app-lifecycle.md`, whichever guide covers window close; then
  regenerate `docs/reference.md`

**Interfaces — produces:**

```ts
// Decision.ts
export type Composition = "first" | "restrictive" | "chain";
export interface DecidableOptions<Event, Answer, Timing, C extends Composition> {
  // …existing fields…
  readonly composition: C;
  /** What a failing decider contributes. Defaults to the effective fallback. */
  readonly failure?: NoInfer<Answer>;
  readonly chain?: {
    /** Discriminants that end the chain with that answer. */
    readonly stop: readonly DiscriminantOf<NoInfer<Answer>>[];
    /** What the next decider sees, given what this one answered. */
    readonly advance: (event: NoInfer<Event>, answer: NoInfer<Answer>) => NoInfer<Event>;
  };
}
export interface Decidable<Event, Answer, Timing, C extends Composition = "first" | "restrictive"> …
export type ChainOutcome<Event, Answer> =
  | { readonly kind: "stopped"; readonly answer: Answer }
  | { readonly kind: "completed"; readonly event: Event };
// Owner["decide"] accepts Decidable<Event, Answer, Timing, Composition>

// internal/DecisionRegistry.ts
resolveChain: <Event, Answer>(
  decidable: Decision.Decidable<Event, Answer, "sync" | "async", "chain">,
  event: Event,
) => Effect.Effect<Decision.ChainOutcome<Event, Answer>>;
```

The default on the fourth parameter is load-bearing: every existing `Decidable<E, A, T>` reference —
`resolveSync`, `resolveAsync`, `Registry.fallback`, `CloseGate` — keeps excluding chain decidables with
no edit. `Registry.hook` must accept every composition.

**`failure` semantics.**

- Validated at declaration exactly like `fallback`: decodes against `answer` or fails `Protocol`; under
  `restrictive` its discriminant must be in `order`. Declaring it on a `first` decidable fails `Protocol` —
  a failing decider contributes nothing there, so it would be dead data.
- When declared, a decider that throws, dies, or answers off-schema contributes it — **decoded afresh each
  time**, never by reference, for the same reason the fallback is. When not declared, behaviour is exactly
  today's: the owner's effective fallback, per-owner override included.
- The failure log names which was contributed.
- Declare it on: `Window.Close` → `"deny"`, `App.Quit` → `"deny"` (both restore base), `Session.Certificate`
  → `"reject"` (a broken pin must not become no pin), `Session.Preconnect` → `"deny"` (costs latency only).
- **Deliberately not** on `WebContents.Input`: its closed answer is `block`, and a buggy input decider that
  swallowed every keystroke would brick the app. Say so in its doc comment — a reader should see it was
  a choice.

**`chain` semantics.** Resolution walks the same start-of-resolution snapshot, in install order, holding a
`current` event that starts as the exact event object it was given.

- Each decider receives `current`. `Pass` moves on.
- A failing decider contributes `failure` (or the fallback when none is declared) and is logged; that
  contribution is then treated like any answer.
- An answer whose discriminant is in `stop` ends the resolution `{ kind: "stopped", answer }` — **later
  deciders are not consulted.** Any other answer sets `current = advance(current, answer)`.
- The end of the list is `{ kind: "completed", event: current }`; with no deciders that is the original
  object, untouched.
- `advance` is Sewed's own code and must not throw; if it does, log and treat that decider as failed.
- Declaration checks, each `Protocol`: `chain` is required when and only when composition is `"chain"`;
  a chain decidable declares no `order`; `stop` repeats nothing; a chain decidable is `"async"` (nothing
  needs a synchronous fold, so none is built).

- [ ] **Step 1: Write the failing tests.** By name, at minimum:
  - "a failing decider contributes its declared failure, not the fallback"
  - "an undeclared failure still contributes the owner's fallback override"
  - "a declared failure is decoded afresh on every contribution"
  - "a first decidable refuses a failure" / "a failure outside the order is refused"
  - "a crashing close guard denies the close" / "a crashing quit guard denies the quit" /
    "a crashing certificate decider rejects" — through a real registry and the real decidables
  - "a chain hands each decider what the previous one produced"
  - "a stop answer ends the chain and later deciders are not consulted"
  - "a stop answer wins regardless of install order"
  - "a passing decider leaves the chained event untouched"
  - "a failing decider in a chain contributes its failure" (and, with `failure` a stop answer, stops it)
  - "an empty chain completes with the exact event object"
  - "a chain walks the snapshot taken when it began" (install and remove mid-resolution, as the ranked
    resolvers' own tests do — **no fixed sleeps**; wait on a positive condition with a bound)
  - the four declaration refusals
- [ ] **Step 2: Watch them fail** for the right reason.
- [ ] **Step 3: Implement.** Keep `resolveCore`'s candidate-decoding and failure-logging path shared with
      `resolveChain` rather than copied; two copies of "what counts as a failed decider" is how they drift.
- [ ] **Step 4: Contract tests** in `decision-types.ts`: everything the probe asserts, against the real
      types, plus `Registry.fallback` refusing a chain decidable.
- [ ] **Step 5: Mutation-check**, by test name and message: contribute the fallback instead of `failure`;
      skip the `stop` test so the chain runs on; pass the original event instead of `current`; return the
      declared failure by reference.
- [ ] **Step 6: Docs**, then regenerate the reference. `docs/session-extras.md` currently says a failing
      certificate decider "keeps Chromium's own verdict" — that sentence becomes false; fix it, and state
      the close/quit behaviour where guards are documented.
- [ ] **Step 7: Run all five root commands and commit.** No playground change is expected; say so after
      searching `src/` and `scripts/` rather than before.

---

### Task 7b: A decidable names its owner

**Why this task exists.** `Decision.Owner["decide"]` accepts _any_ decidable. This compiles against the
shipped types today — the probe's first block is that proof:

```ts
contents.decide(
  Decidables.Window.Close,
  Decision.sync(() => "deny"),
); // a window's guard, on a web contents
```

It installs, and is **never consulted**: the window resolves `Window.Close` against its own registry. For
a fallback-open kind that is a guard that does not guard, silently, for a human or an agent that wrote
`window.webContents.decide` where `window.decide` was meant. The spec says deciders install "on the owner
of the event"; nothing enforces it.

**The design, already proven.** a scratch type probe, kept in the wave's SDD workspace while it ran, compiles
clean, and with its directives stripped the wrong-owner install reports
`Type '"window"' is not assignable to type '"contents"'`, and a misspelled owner is `TS2820`
"Did you mean '"window"'?". It is a model; build the real thing to match.

**Files:**

- Modify: `packages/sewed/src/Decision.ts` — `OwnerKind`, the `owner` field, the fifth type parameter,
  `Owner<O>`
- Modify: `packages/sewed/src/Decidables.ts` — every declaration gains `owner`
- Modify: `packages/sewed/src/internal/DecisionRegistry.ts` — `make({ owner, … })`, `decide`, the runtime refusal
- Modify: every owner's public type and construction site: `App.ts`, `Window`/`BrowserWindow`,
  `WebContents`, `GuestView`, `Session`, and the internal modules that call `Registry.make`
- Test: `decision-types.ts`, `decision-registry.test.ts`, and each `*-types.ts` that asserts an owner's `decide`

**Interfaces — produces:**

```ts
export type OwnerKind = "app" | "window" | "contents" | "session" | "requests";
// DecidableOptions gains:  readonly owner: O;
export interface Decidable<Event, Answer, Timing, C extends Composition = "first" | "restrictive",
                           O extends OwnerKind = OwnerKind> …
export interface Owner<O extends OwnerKind> {
  readonly decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
    decidable: Decidable<Event, Answer, Timing, Composition, O>,
    decider: DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
  ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope | R>;
}
```

`"requests"` is declared now and used by the next task: the three request stages install through a door
that takes a filter, so they must be refused by `session.decide` at compile time.

**Rules.**

- Owners: `App.*` → `"app"`; `Window.*` → `"window"`; `WebContents.*` → `"contents"` (a guest view's own
  registry is a `"contents"` owner too); `Session.*` → `"session"`.
- **Types are half of it.** The playground's fixtures are `.mjs` and an agent may be writing JavaScript, so
  the registry refuses at runtime as well: `Registry.make({ owner })`, and an install of another owner's
  decidable fails — `Protocol` through `decide`, a thrown `SewedError` through the internal `install`.
  The message names both owners and the decidable's key.
- Both defaults are load-bearing, as in Task 7a: internals that mean "any decidable" keep compiling.
- The decidable's `key` prefix already spells its owner by convention (`"window/close"`). Add a declaration
  check that they agree, so the convention cannot drift from the field.

- [ ] **Step 1: Failing tests** — by name: "an owner refuses another owner's decidable"; "the refusal names
      both owners"; "a decidable's key must agree with its owner"; and, in `decision-types.ts`, the probe's
      three negatives against the real types plus one wrong-owner assertion per real owner handle.
- [ ] **Step 2: Watch them fail.** - [ ] **Step 3: Implement.**
- [ ] **Step 4: Mutation-check** the runtime refusal and the key/owner agreement check, by test name.
- [ ] **Step 5: Docs** — one paragraph where `decide` is introduced: a decider installs on the owner of its
      event, and installing it elsewhere is a compile error. Regenerate the reference.
- [ ] **Step 6: Playground.** Search `src/` and `scripts/` for every `.decide(` and confirm each is on the
      right owner — the runtime refusal will now fail any that is not. Rebuild, repack, reinstall, confirm the
      installed `lib` carries `owner`, run every `verify:*` that installs a decider.
- [ ] **Step 7: Run all five root commands and commit.**

---

### Task 7c: Request decidables

#### Rulings that bind over the task text below (Step 4 is replaced)

Where these differ from the steps below, **these bind**.

##### Step 4 is replaced

The brief says `session.decide(Decidables.Session.Request, decider, { filter })` and "the registry keys the
install by decidable and filter". Neither survives.

- **The filter is not a registry concept**, and `Decision.Owner["decide"]` stays two-parameter.
- **The door is `session.intercept(decidable, filter, decider)`**, a handle method. The free function
  `Session.intercept` and `Rules<R>` are deleted, with negative contract assertions. The three decidables
  declare `owner: "requests"` (Task 7b), so `session.decide` refuses them and `session.intercept` refuses
  everything else, both at compile time.
- **The filter stays required.** A listener over every URL routes every request in the session through
  main; making the filter a parameter keeps that cost visible at the call site, as base did.
- **A filtered decider answers `Decision.Pass` for a request its filter does not select.** That wrapping
  happens inside `internal/WebRequest.ts`. The filter otherwise drives only the existing `nativeFilter` /
  `unionFilter` / `reinstall` bookkeeping, for the install's scope — one native listener per stage over
  the union of installed filters, `null` when a stage has none.
- **Body options are per install**, as now: only a decider whose filter asked for a body pays to assemble
  one, and a body that cannot be read fails that decider. The event reaches a decider as the exact object,
  so the upload data the wrapper needs can ride beside the event in a `WeakMap` keyed by it — only the
  `Request` stage carries a body, and that stage never transforms its event.

##### Compositions and failure (from Task 7a)

| Decidable                 | Composition                                           | Fallback            | Failure             |
| ------------------------- | ----------------------------------------------------- | ------------------- | ------------------- |
| `Session.Request`         | `restrictive`, order `["block", "redirect", "allow"]` | `{ kind: "allow" }` | `{ kind: "block" }` |
| `Session.RequestHeaders`  | `chain`, stop `["block"]`                             | `{ kind: "allow" }` | `{ kind: "block" }` |
| `Session.ResponseHeaders` | `chain`, stop `["block"]`                             | `{ kind: "allow" }` | `{ kind: "block" }` |

The brief's test line "`block` beats `headers` beats `allow`" is wrong for the two header stages: they
**chain**. Replace it with: two header deciders both land, each seeing what the previous produced; `block`
from either ends it; a response `statusLine` set by one survives a later decider that sets only headers
(base tracked it cumulatively — `advance` must too). `failure: block` restores base's documented "a decider
that fails or dies blocks its request", which fallback-as-failure would have turned fail-open.

The native listener answers from `ChainOutcome`: `stopped` → `{ cancel: true }`; `completed` → the folded
event's headers (and status line). Route every one of these callbacks through `internal/NativeAnswer.ts`
with `{ cancel: true }` as the closed form.

##### Carried from earlier tasks

- Use `Registry.hook` if a 0→1 / 1→0 attach fits a stage's listener; the filter union still forces a
  reinstall on every change, so WebRequest's own bookkeeping may simply remain the mechanism. Judge it and say.
- `internal/WebRequest.ts` already has a type called `Registry` for its taps. Two things named `Registry`
  in one file is a trap — rename the local one.
- The session's decision registry is closure-private in `fromNative`; give `intercept` what it needs by
  living on the handle, not by exporting an accessor.
- A `body` option on a header-stage filter means nothing. Fail it `Protocol` rather than ignore it.
- Signature by evidence: compile the natural unannotated spelling of all three installs in
  `session-extras-types.ts` before building on it. No overloads — they have cost this wave two fix rounds.
- No fixed sleeps in tests. The playground is at `/home/lucas/personal/typescript/sewed-playground`; search
  `src/` and `scripts/`, confirm the installed `lib`. End each commit with your own session's trailer.

#### The original task text

Splits `Session.intercept` into the three decidables the settled decisions call for, keeping the filter
and body options.

**Files:**

- Modify: `packages/sewed/src/Decidables.ts`, `packages/sewed/src/internal/WebRequest.ts`,
  `packages/sewed/src/Session.ts`
- Test: `packages/sewed/test/decidables-request.test.ts`; modify the web-request tests

**Interfaces:**

- Consumes: Task 6's `session.decide`.
- Produces: `Decidables.Session.Request`, `.RequestHeaders`, `.ResponseHeaders`, each installed with a
  filter.

- [ ] **Step 1: Write the failing tests**

Cover: each stage decides independently; two deciders on one stage compose restrictively so `block`
beats `redirect` beats `allow` and `block` beats `headers` beats `allow`; a decider only sees requests
its filter selects; body options still reach the decider; removing one stage's decider leaves the others
installed, which `Rules<R>`'s all-or-nothing bundle at `internal/WebRequest.ts:12-23` cannot do.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Declare the three decidables**

Each carries its stage's existing event and answer schema unchanged: `Request` with
`WebRequest.Request` and `RequestDecision`, order `["block", "redirect", "allow"]`; `RequestHeaders`
with `WebRequest.RequestHeaders` and `RequestHeadersDecision`, order `["block", "headers", "allow"]`;
`ResponseHeaders` with `WebRequest.Response` and `ResponseDecision`, order
`["block", "headers", "allow"]`. All three are async with fallback `{ kind: "allow" }`.

- [ ] **Step 4: Install with a filter**

`decide` takes the filter for these three: `session.decide(Decidables.Session.Request, decider, { filter })`.
The registry keys the install by decidable and filter, and `internal/WebRequest.ts`'s existing
`nativeFilter`, `unionFilter`, and `reinstall` (`:72-83`, `:140-155`, `:256`) keep computing one native
listener per stage over the union of installed filters. Delete `Rules<R>` and `Session.intercept`.

- [ ] **Step 5: Run every check and commit**

```bash
pnpm typecheck && timeout 240 pnpm test && pnpm build && pnpm format:check
git commit -m "feat: decide the three request stages independently"
```

---

### Task 8: Testing, guides, and the generated reference

**Files:**

- Modify: `packages/sewed/src/Testing.ts`, `docs/native-policy.md`, `docs/app-lifecycle.md`,
  `docs/session-extras.md`, `docs/sessions.md`, `docs/platform-surfaces.md`, `docs/guest-views.md`,
  `docs/api.md`, `docs/electron-coverage.md`, `docs/reference.md` (generated), `README.md`
- Test: `packages/sewed/test/testing-decide.test.ts`; modify `testing-types.ts`

- [ ] **Step 1: Write the failing test for `Testing.decide`**

```ts
test("Testing.decide resolves installed deciders without Electron", async () => {
  // install two deciders on a decidable, then assert the composed answer
  // and that an uninstalled decidable answers its fallback
});
```

- [ ] **Step 2: Implement `Testing.decide`**

`Testing.decide(decidable, event)` resolves against a registry the testing layer owns, so a decider can
be exercised with no Electron and no owner. Export it beside `memory` and `Recorder`
(`packages/sewed/src/Testing.ts:13`).

- [ ] **Step 3: Rewrite the guides**

`docs/native-policy.md` is the wave's main guide and is rewritten rather than patched: it currently
describes permission policy as data assigned to a session (`:3`, `:21`) and navigation policy as a
setter (`:31-36`), and both are gone. It must state the model once — decidable, decider, timing,
composition, fallback, scope — and say plainly that a synchronous decider cannot suspend and answers
from state current at the callback. Keep `:38`'s account of the blocked stream, which survives intact.
Each other guide gets the decidables its surface owns.

- [ ] **Step 4: Record the wave and regenerate the reference**

Add the wave to `docs/electron-coverage.md`, rewriting its decision-mechanism sections rather than
appending, and leave the historical decision record it supersedes untouched. Regenerate
`docs/reference.md`.

- [ ] **Step 5: Run every check and commit**

```bash
pnpm typecheck && timeout 240 pnpm test && pnpm build && pnpm format:check && pnpm website:build
git commit -m "docs: document the decision model and regenerate the reference"
```

---

## Self-review

- **Spec coverage.** All sixteen catalog rows are assigned: App four (Task 3), Window one and
  WebContents five (Tasks 4 and 5), Session four (Task 6), and the request row split into three
  (Task 7). Section B's composition rules are Task 1; its `Decision.*` constructors are Task 1;
  `Testing.decide` from section H's testing bullet is Task 8.
- **Two catalog amendments, both stated above and in the spec:** `Session.Request` becomes three rows,
  and `App.LastWindowClosed`'s fallback is platform-derived.
- **Type consistency.** `decidable`, `Pass`, `sync`, `async`, `fromState`, `policy`, `decide`,
  `Registry.make`, `install`, `resolveSync`, `resolveAsync` are spelled identically in every task.
- **Ordering.** Task 2 depends on Task 1; Tasks 3 to 7 each depend on Task 2 and are otherwise
  independent, so a reviewer can reject one without rejecting its neighbours; Task 8 depends on all.
