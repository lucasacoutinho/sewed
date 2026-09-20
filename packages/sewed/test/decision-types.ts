import { Context, Effect, Schema, SubscriptionRef } from "effect";
import * as CloseGate from "../src/internal/CloseGate.ts";
import * as ContentsDownloads from "../src/internal/ContentsDownloads.ts";
import * as Decision from "../src/Decision.ts";
import * as WebRequest from "../src/WebRequest.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import type * as RequestStages from "../src/internal/RequestStages.ts";
import type { Scope } from "effect";
import type { MainContext } from "../src/RuntimeContext.ts";
import type { SewedError } from "../src/SewedError.ts";

const Sync = Decision.decidable({
  key: "contents/types-sync",
  owner: "contents",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "sync",
  composition: "restrictive",
  order: ["block", "allow"],
});

// A synchronous decider returns the answer or Pass, never an Effect.
export const ok = Decision.sync<{ readonly url: string }, "allow" | "block">(() => "block");

export const suspends = Decision.sync<{ readonly url: string }, "allow" | "block">(
  // @ts-expect-error A synchronous decider cannot return an Effect, so it cannot suspend
  () => Effect.succeed("block"),
);

export const wrongAnswer = Decision.sync<{ readonly url: string }, "allow" | "block">(
  // @ts-expect-error An answer outside the decidable's schema does not type-check
  () => "maybe",
);

// A decider for a decidable whose answer may arrive later.
export const async = Decision.async<{ readonly url: string }, "allow" | "block", never>(() =>
  Effect.succeed("block"),
);

// fromState reads the current value and decides from it.
export const fromState = Decision.fromState(
  Effect.runSync(SubscriptionRef.make({ blocked: false })),
  (state: { readonly blocked: boolean }, _event: { readonly url: string }) =>
    state.blocked ? "block" : "allow",
);

// A policy is declared once via definePolicy, then installed with rule data alone through policy —
// the spec's two-argument form. `compile`'s own `rules` parameter infers from the sibling `rules`
// schema with no annotation, the same NoInfer idiom `DecidableOptions.fallback` already uses against
// `answer`.
export const blockedHostsPolicy = Decision.definePolicy({
  rules: Schema.Struct({ blockedHosts: Schema.Array(Schema.String) }),
  compile: (rules) => (event: { readonly url: string }) =>
    rules.blockedHosts.some((host) => event.url.includes(host)) ? "block" : Decision.Pass,
});
export const policy = Decision.policy(blockedHostsPolicy, { blockedHosts: [] });

// The three-argument form the plan mistakenly shipped is gone: a schema, rules, and a consumer-
// written compile no longer install anything, because policy now takes only a Policy value and rules.
Decision.policy(
  Schema.Struct({ blockedHosts: Schema.Array(Schema.String) }),
  { blockedHosts: [] },
  // @ts-expect-error Decision.policy takes a Policy value and rules, not a schema plus a compile:
  // this third argument is the one the plan's defect added and this task removes.
  (rules: { blockedHosts: readonly string[] }) => (event: { readonly url: string }) =>
    rules.blockedHosts.some((host) => event.url.includes(host)) ? "block" : "allow",
);

// A consumer can declare its own Policy, and definePolicy's own NoInfer placement does not stop
// `compile`'s `rules` parameter from inferring the full schema type with no annotation: `rules.origin`
// below type-checks with no cast, the same guarantee `decidable`'s own `fallback` proves for `answer`.
export const consumerPolicy = Decision.definePolicy({
  rules: Schema.Struct({ origin: Schema.String }),
  compile: (rules) => (event: { readonly url: string }) =>
    event.url.startsWith(rules.origin) ? "allow" : Decision.Pass,
});
export const consumerPolicyInstalled = Decision.policy(consumerPolicy, {
  origin: "https://a.example",
});

const registry = Registry.make({ owner: "contents" });

// install(Sync, Decision.sync(...)) type-checks with no cast: the guarantee the commit leads with.
export const removeOk = registry.install(
  Sync,
  Decision.sync<{ readonly url: string }, "allow" | "block">(() => "allow"),
);

const Other = Decision.decidable({
  key: "contents/types-other",
  owner: "contents",
  event: Schema.Struct({ pid: Schema.Number }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "sync",
  composition: "first",
});

registry.install(
  Other,
  // @ts-expect-error A decider whose event type differs from the decidable's is a type error.
  Decision.sync((event: { readonly url: string }) => (event.url.length > 0 ? "block" : "allow")),
);

const AsyncDecidable = Decision.decidable({
  key: "contents/types-async",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "async",
  composition: "first",
});

// Both a sync and a services-free async decider install freely on an async-timing decidable.
export const removeSyncOnAsync = registry.install(
  AsyncDecidable,
  Decision.sync(() => "block"),
);
export const removeAsyncOnAsync = registry.install(
  AsyncDecidable,
  Decision.async(() => Effect.succeed("block")),
);

registry.install(
  Sync,
  // @ts-expect-error An async decider cannot be installed on a sync-timing decidable.
  Decision.async<{ readonly url: string }, "allow" | "block", never>(() => Effect.succeed("block")),
);

class NeedsService extends Context.Service<NeedsService, { readonly value: number }>()(
  "types/NeedsService",
) {}

registry.install(
  AsyncDecidable,
  // @ts-expect-error An async decider that requires services cannot install: install's async branch fixes R to never.
  Decision.async<Record<string, never>, "allow" | "block", NeedsService>(() =>
    Effect.map(NeedsService, (service) => (service.value > 0 ? "block" : "allow")),
  ),
);

// A decider built for a *structurally identical* decidable (same event and answer types, different
// key) installs freely: that is ordinary structural typing, not the guarantee above.
const OtherSameShape = Decision.decidable({
  key: "contents/types-other-same-shape",
  owner: "contents",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "sync",
  composition: "first",
});
export const removeStructurallyShared = registry.install(
  OtherSameShape,
  Decision.sync<{ readonly url: string }, "allow" | "block">(() => "allow"),
);

// Pass, and what `Decision.pass` guarantees (round 1's own regression, otherwise uncovered by any
// typechecked file in the repository). `sync`/`async` used to be overloaded so a decider that only
// ever passes could still infer `Answer` as `never`; fix round 1 dropped the overloads (they broke
// contextual typing everywhere else — see the natural-spelling block below) and moved this guarantee
// onto its own named decider instead.

// `Decision.pass` is typed `Sync<unknown, never>` at its declaration, and `never` is a real decider
// answer's subtype, so it installs on any decidable — including ones with unrelated event and answer
// types, and on both sync- and async-timing decidables (a `Sync` decider fits `DeciderFor` either way).
const alwaysPassesIsNever: Decision.Sync<unknown, never> = Decision.pass;
void alwaysPassesIsNever;
export const removePassOnSync = registry.install(Sync, Decision.pass);
export const removePassOnOther = registry.install(Other, Decision.pass);
export const removePassOnAsyncDecidable = registry.install(AsyncDecidable, Decision.pass);

// The residual edge `Decision.pass` exists for: a decider built *standalone*, outside any decidable's
// contextual type, whose body only ever returns Pass still infers Answer as `typeof Pass` rather than
// `never` — there is nothing else in its body to infer from. On a sync-timing decidable that is a type
// error, because DeciderFor resolves to the bare `Sync<Event, Answer>` reference there and TypeScript
// compares it by variance, where `typeof Pass` does not satisfy an unrelated `Answer`. `Decision.pass`
// is what a standalone always-passing decider should be built from instead of `sync(() => Pass)`.
const standalonePass = Decision.sync(() => Decision.Pass);
registry.install(
  Sync,
  // @ts-expect-error A standalone decider whose body only returns Pass infers Answer as typeof Pass,
  // not never, and typeof Pass does not fit a sync-timing decidable's Sync<Event, Answer>.
  standalonePass,
);

// Fix round 1's assertion, whose absence caused the defect: the natural spelling — no annotation, no
// `as const` — must compile and infer the literal answer type. Before dropping the `sync`/`async`
// overloads, overload resolution discarded the contextual type `install`'s decider parameter offers,
// so this widened to `Sync<{}, string>` and failed against `Sync<{}, "quit" | "stay">`.
// App.decide(Decidables.App.LastWindowClosed, Decision.sync(() => "quit")) failed to compile in the
// playground for exactly this reason.
const NaturalSync = Decision.decidable({
  key: "contents/types-natural-sync",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["quit", "stay"]),
  fallback: "quit",
  timing: "sync",
  composition: "first",
});
export const naturalSyncSpelling = registry.install(
  NaturalSync,
  Decision.sync(() => "quit"),
);

const NaturalAsync = Decision.decidable({
  key: "contents/types-natural-async",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow",
  timing: "async",
  composition: "first",
});
export const naturalAsyncSpelling = registry.install(
  NaturalAsync,
  Decision.async(() => Effect.succeed("allow")),
);

// A decider that sometimes returns Pass is still checked against its decidable's answer type: Pass
// does not widen Answer to admit an unrelated literal alongside it.
registry.install(
  Sync,
  // @ts-expect-error "maybe" is not "allow" | "block", even though the other branch is Pass.
  Decision.sync((event: { readonly url: string }) =>
    event.url.length > 0 ? Decision.Pass : "maybe",
  ),
);

// A decider that sometimes returns Pass is still refused for a decidable with a different event
// type: passing sometimes does not exempt it from the event-type check either.
registry.install(
  Other,
  // @ts-expect-error Other's event is { pid: number }, not { url: string }, even though this decider also passes.
  Decision.sync((event: { readonly url: string }) =>
    event.url.length > 0 ? Decision.Pass : "allow",
  ),
);

// A decidable is what `decidable()` returns, never what a caller assembles. A hand-rolled literal
// satisfies DecidableOptions structurally, so without the brand it would install and resolve while
// having skipped every check `decidable()` makes — an unvalidated fallback included, which is the
// answer resolution reaches for when no decider answers.
const fabricated = {
  key: "contents/types-fabricated",
  owner: "contents" as const,
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync" as const,
  composition: "first" as const,
};
registry.install(
  // @ts-expect-error Only decidable() produces a Decidable; a hand-rolled one cannot install.
  fabricated,
  Decision.sync(() => "allow"),
);
// The same literal is a perfectly good *input*, which is what keeps every declaration site unchanged.
export const declaredFromLiteral = Decision.decidable(fabricated);

// A declared decidable carries its own answer decoder, built once with Answer in scope, so neither
// resolution nor this assignment needs a cast to recover what the schema decodes to.
export const decoded: "allow" | "block" = Sync.decodeAnswer("block");

// Task 2: the scoped install an owner exposes.
const decide = Registry.decide(registry, { isClosed: () => false });

// The builder produces exactly the shape owners publish, which is what Tasks 3 to 6 implement.
export const owner: Decision.Owner<"contents"> = { decide };

export const scopedInstall: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = decide(
  Sync,
  Decision.sync<{ readonly url: string }, "allow" | "block">(() => "allow"),
);

decide(
  Sync,
  // @ts-expect-error An async decider cannot be installed on a sync-timing decidable.
  Decision.async<{ readonly url: string }, "allow" | "block", never>(() => Effect.succeed("block")),
);

decide(
  Other,
  // @ts-expect-error Other's event is { pid: number }, not { url: string }.
  Decision.sync((event: { readonly url: string }) => (event.url.length > 0 ? "block" : "allow")),
);

// An async decider carries its services to the returned Effect's requirements: the owner runs that
// decider later, inside a native callback, with the context its installer had. Unlike `install`,
// which fixes R to never, `decide` is where a decider that needs services belongs.
const needsService = Decision.async<Record<string, never>, "allow" | "block", NeedsService>(() =>
  Effect.map(NeedsService, (service) => (service.value > 0 ? "block" : "allow")),
);
export const carriesServices: Effect.Effect<
  void,
  SewedError,
  MainContext | Scope.Scope | NeedsService
> = decide(AsyncDecidable, needsService);

// @ts-expect-error Dropping the decider's services would leave an Effect nothing can satisfy them from.
export const dropsServices: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = decide(
  AsyncDecidable,
  needsService,
);

// `installOne` is the door `decide` needs, because it hands the registry its installer's context
// rather than pre-providing it into the decider. It binds Timing exactly as `install` does: an
// install path with Timing erased is how an async decider reaches a sync decidable and throws
// AsyncFiberError out of an Electron callback, and it would need no cast to do it.
registry.installOne(
  Sync,
  // @ts-expect-error An async decider cannot reach a sync-timing decidable through installOne either.
  Decision.async<{ readonly url: string }, "allow" | "block", never>(() => Effect.succeed("block")),
  Context.empty(),
);

// Re-declaring a declared decidable would hand back a second identity answering under the same key,
// invisible to every decider installed on the first, so the parameter refuses one outright.
// @ts-expect-error A declared Decidable cannot be re-declared: that would fork its identity.
Decision.decidable(Sync);

// A transforming codec cannot describe an answer: resolution decodes synchronously, inside
// Electron's own callback, so a codec whose Encoded type differs from its Type has no decoded shape
// to hand back there. `Schema.Codec` is what makes that a declaration-time error.
Decision.decidable({
  key: "contents/types-transforming",
  owner: "contents",
  event: Schema.Struct({}),
  // @ts-expect-error A transforming codec does not describe a decoded answer.
  answer: Schema.NumberFromString,
  fallback: 0,
  timing: "sync",
  composition: "first",
});

// The same for `event`, which the sentence in the reference covers too: a decidable's event schema
// describes what a decider is handed, and a codec whose Encoded type differs from its Type describes
// something no decider would ever see.
Decision.decidable({
  key: "contents/types-transforming-event",
  owner: "contents",
  // @ts-expect-error A transforming codec does not describe a decoded event either.
  event: Schema.NumberFromString,
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "sync",
  composition: "first",
});

// `fallback` is `NoInfer`d against `answer`, so a value outside the answer schema cannot quietly
// widen Answer to admit itself. Without that, this would declare successfully and a registry would
// answer "nonsense" whenever no decider did.
Decision.decidable({
  key: "contents/types-nonsense-fallback",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  // @ts-expect-error "nonsense" is not one of the answer schema's literals.
  fallback: "nonsense",
  timing: "sync",
  composition: "first",
});

// `timing` is a covariant readonly property, so a `"sync"` decidable widens to the union with no
// cast — and the registry is identity-keyed, so `resolveSync` is still called with the same object.
// A conditional over a naked `Timing` distributes across that union and collapses to `Decider`,
// which admits an async decider and produces AsyncFiberError out of a native callback. Every door
// into the registry refuses the widened route.
// The owner is named here rather than left to default, so this stays a test about `Timing` alone:
// `Decidable`'s fifth parameter defaults to every owner kind, which no install door accepts, so a
// widened-owner decidable would be refused for the owner reason before the timing one was reached.
const widened: Decision.Decidable<
  { readonly url: string },
  "allow" | "block",
  "sync" | "async",
  "first" | "restrictive",
  "contents"
> = Sync;
const asyncOnWidened = Decision.async<{ readonly url: string }, "allow" | "block", never>(() =>
  Effect.succeed("block"),
);
registry.install(
  widened,
  // @ts-expect-error A widened Timing must not admit an async decider through install.
  asyncOnWidened,
);
registry.installOne(
  widened,
  // @ts-expect-error ... nor through installOne.
  asyncOnWidened,
  Context.empty(),
);
decide(
  widened,
  // @ts-expect-error ... nor through decide.
  asyncOnWidened,
);
owner.decide(
  widened,
  // @ts-expect-error ... nor through the Owner shape every owner publishes.
  asyncOnWidened,
);

void Sync;

// CloseGate.make's `event` and `approvingAnswer` are `NoInfer`d against `decidable`, the same idiom
// as `fallback` above: `Decision.Decidable`'s `Answer` is covariant, so without `NoInfer` an
// `approvingAnswer` outside what the decidable actually answers would still type-check, by widening
// `Answer` to admit it instead of being checked against it. That is the slip a caller could make
// copying `AppRuntime.ts`'s `CloseGate.make(approveQuit, registry, App.Quit, {}, "allow")` for
// `WebContents.Unload`, whose answer is `"honor" | "override"` — `Window.Close` cannot illustrate
// this, since it answers `Allowance` and genuinely approves with "allow". With no `NoInfer`, keeping
// "allow" here compiles clean and the gate is permanently inert, since nothing installed on
// `WebContents.Unload` will ever answer "allow".
const closeGateRegistry = Registry.make({ owner: "contents" });
CloseGate.make(
  () => {},
  closeGateRegistry,
  Sync,
  { url: "https://example.test" },
  // @ts-expect-error "nonsense" is not one of Sync's answer literals ("allow" | "block"). This is
  // the case NoInfer<Answer> alone closes: without it, "nonsense" widens Answer to admit itself,
  // since Sync's own "allow" | "block" answer type is still a valid member of that wider union.
  "nonsense",
);
CloseGate.make(
  () => {},
  closeGateRegistry,
  Sync,
  // @ts-expect-error Sync's event is { readonly url: string }, not {}.
  {},
  "allow",
);
// A correctly wired gate still type-checks with no cast.
CloseGate.make(() => {}, closeGateRegistry, Sync, { url: "https://example.test" }, "allow");

// `NoInfer<Event>` is proven differential, not kept for symmetry with `NoInfer<Answer>` alone: a
// decidable whose event is a literal union exposes the gap plainly. Without `NoInfer<Event>`,
// `Event` would be inferred from both `decidable` and this `event` argument, and TypeScript reduces
// multiple inference candidates by union when every one is a literal over the same base type — so a
// literal outside the decidable's own union would widen `Event` to admit it instead of being checked
// against it, exactly the `Answer` hazard above, one parameter over. Every event this wave actually
// gates with is a plain object, where TypeScript's common-supertype reduction happens to still catch
// a mismatched shape either way — which is why three attempts at this proof, all with object event
// types, missed it, and why this pin is a literal union instead.
const LiteralEvent = Decision.decidable({
  key: "contents/types-literal-event",
  owner: "contents",
  event: Schema.Literals(["opened", "hidden"]),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "async",
  composition: "first",
});
CloseGate.make(
  () => {},
  closeGateRegistry,
  LiteralEvent,
  // @ts-expect-error "resized" is not "opened" | "hidden". This is the case NoInfer<Event> alone
  // closes: without it, "resized" would widen Event to admit itself, by TypeScript's own literal-union
  // reduction across the two inference sites.
  "resized",
  "allow",
);
// A correctly wired gate over a literal-typed event still type-checks with no cast.
CloseGate.make(() => {}, closeGateRegistry, LiteralEvent, "opened", "allow");

// `order`'s element type is `DiscriminantOf<NoInfer<Answer>>`, not a bare `readonly string[]`: a
// misspelled entry used to compile, construct, and silently rank `Infinity` — never winning, on the
// composition whose entire purpose is that a denial cannot be lost. Both discriminant shapes are
// pinned: a bare string-literal answer, and a `kind`-tagged union (Task 5's `Download` shape, three
// members over a tagged object, the easiest place for a typo to hide).
const OrderedLiteral = Decision.decidable({
  key: "contents/types-ordered-literal",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["block", "allow"]),
  fallback: "allow",
  timing: "sync",
  composition: "restrictive",
  // @ts-expect-error "blcok" is not "block" | "allow". A bare readonly string[] would accept this,
  // compile, and construct, ranking the misspelled entry Infinity — never winning.
  order: ["blcok", "allow"],
});
void OrderedLiteral;

const OrderedTagged = Decision.decidable({
  key: "contents/types-ordered-tagged",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("deny") }),
    Schema.Struct({ kind: Schema.Literal("prompt"), reason: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("save") }),
  ]),
  fallback: { kind: "save" },
  timing: "sync",
  composition: "restrictive",
  // @ts-expect-error "prmopt" is not one of the answer's own "kind" discriminants
  // ("deny" | "prompt" | "save").
  order: ["deny", "prmopt", "save"],
});
void OrderedTagged;

// Both shapes still declare correctly with no cast and no annotation.
export const orderedLiteralDeclares = Decision.decidable({
  key: "contents/types-ordered-literal-ok",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["block", "allow"]),
  fallback: "allow",
  timing: "sync",
  composition: "restrictive",
  order: ["block", "allow"],
});
export const orderedTaggedDeclares = Decision.decidable({
  key: "contents/types-ordered-tagged-ok",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("deny") }),
    Schema.Struct({ kind: Schema.Literal("prompt"), reason: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("save") }),
  ]),
  fallback: { kind: "save" },
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

// Task 5: `Registry.make({ fallbacks })`. A per-owner fallback is keyed by the decidable's own
// identity, not its `key` string, and carries its own `Answer` typed, not funneled through `unknown`.
const FallbackTarget = Decision.decidable({
  key: "contents/types-fallback-target",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "sync",
  composition: "restrictive",
  order: ["block", "allow"],
});
const OtherFallbackTarget = Decision.decidable({
  key: "contents/types-other-fallback-target",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("deny") }),
    Schema.Struct({ kind: Schema.Literal("allow") }),
  ]),
  fallback: { kind: "deny" },
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "allow"],
});

// A correctly typed override, checked against its own decidable's answer, type-checks with no cast.
export const fallbackDeclares = Registry.fallback(FallbackTarget, "block");

Registry.fallback(
  FallbackTarget,
  // @ts-expect-error "maybe" is not "allow" | "block": a fallback override is checked against its own
  // decidable's answer exactly as `decidable()`'s own `fallback` is, not widened to admit anything.
  "maybe",
);

Registry.fallback(
  OtherFallbackTarget,
  // @ts-expect-error "allow" alone is not OtherFallbackTarget's answer, which is `{ kind: ... }`
  // tagged — a bare string does not satisfy a tagged answer just because another decidable has one.
  "allow",
);

// `make`'s `fallbacks` option takes `Fallback` values built only by `Registry.fallback`, never a
// `ReadonlyMap<string, unknown>` — the shape the brief first proposed and the rulings corrected.
export const registryWithFallbacks = Registry.make({
  owner: "contents",
  fallbacks: [Registry.fallback(FallbackTarget, "block"), fallbackDeclares],
});

const fabricatedFallback = {
  apply: (overrides: WeakMap<object, unknown>) => overrides.set(FallbackTarget, "block"),
};
Registry.make({
  owner: "contents",
  // @ts-expect-error A fallbacks entry must be built by Registry.fallback; even a hand-built object
  // in Fallback's exact real shape ({ apply }) cannot satisfy it, because the brand only `fallback`
  // itself can set is keyed by a symbol this module never exports.
  fallbacks: [fabricatedFallback],
});

// Task 7b: `owner` is the one option `make` requires. A registry that did not know its own owner
// could not refuse another owner's decidable, so there is no argument-free form left.
export const registryWithOnlyAnOwner = Registry.make({ owner: "contents" });
// @ts-expect-error A registry must say which owner it decides for.
Registry.make();
// @ts-expect-error ... and an owner kind that does not exist is not one.
Registry.make({ owner: "windo" });

// Task 7a: `failure` is checked against `answer` exactly as `fallback` is — same `NoInfer` idiom,
// same hazard. Without it a `failure` outside the answer schema would widen `Answer` to admit itself
// and a broken decider would contribute something no decider could ever answer.
Decision.decidable({
  key: "contents/types-nonsense-failure",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  // @ts-expect-error "blok" is not one of the answer schema's literals.
  failure: "blok",
  timing: "sync",
  composition: "restrictive",
  order: ["block", "allow"],
});

// Task 7a: the `chain` composition. `WebRequest`'s response shapes are the case it exists for — two
// `headers` answers rank equal under `restrictive`, so one feature's headers would vanish — but no
// request decidable is declared here or in `Decidables.ts`; this is a test fixture, and Task 7c
// declares the real ones.
const ResponseHeaders = Decision.decidable({
  key: "contents/types-response-headers",
  owner: "contents",
  event: WebRequest.Response,
  answer: WebRequest.ResponseDecision,
  fallback: { kind: "allow" },
  failure: { kind: "block" },
  timing: "async",
  composition: "chain",
  chain: {
    stop: ["block"],
    // The guarantee this whole block exists to prove: `event` and `answer` arrive typed with no
    // annotation at the call site, so `answer.kind` narrows and `answer.headers` resolves. An
    // overload or a call-site annotation would buy the same compile and lose exactly this.
    advance: (event, answer) =>
      answer.kind === "headers"
        ? {
            ...event,
            headers: answer.headers,
            ...(answer.statusLine === undefined ? {} : { statusLine: answer.statusLine }),
          }
        : event,
  },
});

Decision.decidable({
  key: "contents/types-misspelled-advance",
  owner: "contents",
  event: WebRequest.Response,
  answer: WebRequest.ResponseDecision,
  fallback: { kind: "allow" },
  timing: "async",
  composition: "chain",
  chain: {
    stop: ["block"],
    // @ts-expect-error `answer` is genuinely typed, not `any`: "headerz" is not one of
    // ResponseDecision's own "kind" discriminants, so this comparison is TS2367 rather than a branch
    // that silently never runs.
    advance: (event, answer) => (answer.kind === "headerz" ? event : event),
  },
});

Decision.decidable({
  key: "contents/types-misspelled-stop",
  owner: "contents",
  event: WebRequest.Response,
  answer: WebRequest.ResponseDecision,
  fallback: { kind: "allow" },
  timing: "async",
  composition: "chain",
  // @ts-expect-error "blcok" is not one of the answer's own "kind" discriminants: `stop` is typed
  // against them the same way `order` is, so a transposed character cannot compile into a stop that
  // never fires.
  chain: { stop: ["blcok"], advance: (event) => event },
});

const chainRegistry = Registry.make({ owner: "contents" });

// An owner installs on any composition: `decide`, `install` and `installOne` all name `Composition`
// explicitly, which is what lets a chain decidable's entries reach the same hook-counting door.
export const removeOnChain = chainRegistry.install(
  ResponseHeaders,
  Decision.async(() => Effect.succeed({ kind: "block" as const })),
);
export const decideOnChain: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  Registry.decide(chainRegistry, { isClosed: () => false })(
    ResponseHeaders,
    Decision.async(() => Effect.succeed({ kind: "block" as const })),
  );
export const ownerDecidesOnChain: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  owner.decide(
    ResponseHeaders,
    Decision.async(() => Effect.succeed({ kind: "block" as const })),
  );
export const hookOnChain = Registry.hook(ResponseHeaders, {
  attach: () => {},
  detach: () => {},
});

declare const response: WebRequest.Response;

// A chain resolves to an outcome, and it narrows: `stopped` carries the answer that ended it,
// `completed` the folded event — which is the stage's own event type, not a widened one.
export const chainOutcome: Effect.Effect<
  Decision.ChainOutcome<WebRequest.Response, WebRequest.ResponseDecision>
> = chainRegistry.resolveChain(ResponseHeaders, response);
export const foldedEvent = Effect.map(chainOutcome, (outcome) =>
  outcome.kind === "stopped" ? outcome.answer.kind : outcome.event.statusLine,
);

// `Decidable`'s fourth parameter defaults to everything *except* "chain", which is what keeps a
// chain decidable out of every door that cannot fold one — with no edit to any of them.
chainRegistry.resolveAsync(
  // @ts-expect-error A chain decidable does not resolve to one ranked answer.
  ResponseHeaders,
  response,
);
chainRegistry.resolveSync(
  // @ts-expect-error ... nor synchronously: a chain decidable is "async" by declaration.
  ResponseHeaders,
  response,
);
Registry.fallback(
  // @ts-expect-error A chain has no ranking for a fallback override to sit in.
  ResponseHeaders,
  { kind: "allow" },
);
CloseGate.make(
  () => {},
  chainRegistry,
  // @ts-expect-error A close gate compares one resolved answer; a chain produces an outcome.
  ResponseHeaders,
  response,
  { kind: "allow" },
);

// ... and the converse: a ranked decidable has no folded event, so it cannot be resolved as a chain.
chainRegistry.resolveChain(
  // @ts-expect-error A restrictive decidable declares no chain to walk.
  Sync,
  { url: "https://example.test" },
);

// Task 5: `deciderSync` is gone. `ContentsDownloads.Entry.decide` is filled from a decidable's own
// registry resolution now (`internal/WebContents.ts`, `internal/GuestView.ts`), which already treats
// a decider that throws, suspends, or answers off-schema as a failure and contributes the fallback —
// the same guarantee `deciderSync` used to give by wrapping a caller's Effect-returning function.
// @ts-expect-error deciderSync no longer exists.
ContentsDownloads.deciderSync;

// Task 7b: a decidable names the owner that resolves it, so a decider for it installs on that owner
// and nowhere else. Every decidable above belongs to a web contents; this one belongs to a window,
// which is exactly the pairing the hole was found in — a window's close guard installed on the
// window's own web contents, where it registers, is never consulted, and lets the window close.
const WindowOwned = Decision.decidable({
  key: "window/types-close",
  owner: "window",
  event: Schema.Struct({ windowId: Schema.String }),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow",
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "allow"],
});

// Every install door on a web contents' registry refuses it, and the error names both owners:
// `Type '"window"' is not assignable to type '"contents"'`.
registry.install(
  // @ts-expect-error A window's decidable does not install on a web contents' registry.
  WindowOwned,
  Decision.sync(() => "deny"),
);
registry.installOne(
  // @ts-expect-error ... nor through installOne.
  WindowOwned,
  Decision.sync(() => "deny"),
  Context.empty(),
);
decide(
  // @ts-expect-error ... nor through the decide an owner publishes.
  WindowOwned,
  Decision.sync(() => "deny"),
);
owner.decide(
  // @ts-expect-error ... nor through the Owner shape itself, which is the spelling
  // `contents.decide(Decidables.Window.Close, …)` used to compile into.
  WindowOwned,
  Decision.sync(() => "deny"),
);

// An owner kind that does not exist is TS2820 at the declaration — "Did you mean '"window"'?" —
// rather than a decidable no owner could ever install on.
Decision.decidable({
  key: "window/types-misspelled-owner",
  // @ts-expect-error "windo" is not an OwnerKind.
  owner: "windo",
  event: Schema.Struct({}),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow",
  timing: "sync",
  composition: "first",
});

// The registry's own kind reaches the `decide` it builds, which is what covers the five
// `Registry.make` construction sites the unit suite cannot import: an owner whose handle declares
// one kind and whose registry was built with another does not type-check.
// @ts-expect-error A web contents' registry does not publish a window's decide.
export const publishedAsAWindow: Decision.Owner<"window"> = { decide };

// Task 7c, carried from Task 7b's re-review: `Resolver<O>` used to carry `O` on `owner` alone, so
// it constrained which *registry* a consumer accepted and said nothing about which decidable it
// then handed that registry — this very line compiled, resolving a window's decidable against a web
// contents'. The three resolutions name `O` on the decidable now, which is what makes a request
// stage mis-declared `owner: "session"` a compile error at the line in `internal/WebRequest.ts` that
// resolves it against the `"requests"` registry, rather than a native listener that silently
// answers the fallback forever. `"session"` and `"requests"` share the `session/` key prefix, so the
// declaration's own key/owner check cannot tell those two apart; this is what does.
registry.resolveSync(
  // @ts-expect-error A window's decidable is not resolved by a web contents' registry.
  WindowOwned,
  { windowId: "w1" },
);

// `Decidable`'s fifth parameter still defaults to every owner kind, and that default is still
// load-bearing: each internal below means "any decidable, whoever owns it" and takes this window's
// decidable with no edit and no type argument.
export const fallbackForForeign = Registry.fallback(WindowOwned, "deny");
export const hookForForeign = Registry.hook(WindowOwned, { attach: () => {}, detach: () => {} });

// A helper that only *consults* a registry is a different matter, and this pin used to point the
// wrong way. `CloseGate.make` resolves its decidable against the registry it is given, inside a
// native `close`/`before-quit` listener; pairing a web contents' registry with a window's decidable
// is not a gate that fails but a gate that never consults anything, and it is the one door through
// which a foreign decidable could reach a resolution at all. Each consult-only internal names the
// owner kind it consults now, so the pairing is a compile error rather than a positively pinned
// configuration.
CloseGate.make(
  () => {},
  closeGateRegistry,
  // @ts-expect-error A window's decidable cannot be gated against a web contents' registry.
  WindowOwned,
  { windowId: "w1" },
  "allow",
);
// The right pairing still compiles with nothing annotated — no call site gains a type argument.
const windowRegistry = Registry.make({ owner: "window" });
export const gateForItsOwnOwner = CloseGate.make(
  () => {},
  windowRegistry,
  WindowOwned,
  { windowId: "w1" },
  "allow",
);
// `Registry.Resolver` names the kind it resolves for, so a registry of another owner is refused
// where one is asked for — the erasure that used to make the pairing above compile.
export const resolverForItsOwnOwner: Registry.Resolver<"window"> = windowRegistry;
// @ts-expect-error A web contents' registry is not a window's resolver.
export const resolverForAnother: Registry.Resolver<"window"> = registry;

// Task 7c fix round 2 (N1): `internal/RequestStages.ts` derives its request-stage keys from the
// catalog and annotates its own table as a mapped type over them, so a fourth `owner: "requests"`
// decidable added to `Decidables.Session` and forgotten there is `TS2741` at the build. The build
// cannot report that the annotation is still *present*, though: a `stageTable` degraded to a plain
// `Record<string, …>` compiles and runs identically. `keyof` can, so this asserts the table's own
// keys are exactly the derived union — bound to the module, not to a copy of its spelling.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const tableCoversEveryRequestStage: Exact<
  keyof RequestStages.StageTable,
  RequestStages.RequestStageKey
> = true;
// And the union is derived rather than written: a session's own decidable is not one of its keys.
// @ts-expect-error `Preconnect` is owned by "session", so it is not a request stage.
export const preconnectIsNotAStage: RequestStages.RequestStageKey = "Preconnect";
