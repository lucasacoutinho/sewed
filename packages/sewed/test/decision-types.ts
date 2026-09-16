import { Context, Effect, Schema, SubscriptionRef } from "effect";
import * as Decision from "../src/Decision.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import type { Scope } from "effect";
import type { MainContext } from "../src/RuntimeContext.ts";
import type { SewedError } from "../src/SewedError.ts";

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

export const suspends = Decision.sync<{ readonly url: string }, "allow" | "block">(
  // @ts-expect-error A synchronous decider cannot return an Effect, so it cannot suspend
  () => Effect.succeed("block" as const),
);

export const wrongAnswer = Decision.sync<{ readonly url: string }, "allow" | "block">(
  // @ts-expect-error An answer outside the decidable's schema does not type-check
  () => "maybe",
);

// A decider for a decidable whose answer may arrive later.
export const async = Decision.async<{ readonly url: string }, "allow" | "block", never>(() =>
  Effect.succeed("block" as const),
);

// fromState reads the current value and decides from it.
export const fromState = Decision.fromState(
  Effect.runSync(SubscriptionRef.make({ blocked: false })),
  (state: { readonly blocked: boolean }, _event: { readonly url: string }) =>
    state.blocked ? "block" : "allow",
);

// policy compiles validated rule data into a decider.
export const policy = Decision.policy(
  Schema.Struct({ blockedHosts: Schema.Array(Schema.String) }),
  { blockedHosts: [] },
  (rules) => (event: { readonly url: string }) =>
    rules.blockedHosts.some((host) => event.url.includes(host)) ? "block" : "allow",
);

const registry = Registry.make();

// install(Sync, Decision.sync(...)) type-checks with no cast: the guarantee the commit leads with.
export const removeOk = registry.install(
  Sync,
  Decision.sync<{ readonly url: string }, "allow" | "block">(() => "allow"),
);

const Other = Decision.decidable({
  key: "types/other",
  event: Schema.Struct({ pid: Schema.Number }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "first",
});

registry.install(
  Other,
  // @ts-expect-error A decider whose event type differs from the decidable's is a type error.
  Decision.sync((event: { readonly url: string }) => (event.url.length > 0 ? "block" : "allow")),
);

const AsyncDecidable = Decision.decidable({
  key: "types/async",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "async",
  composition: "first",
});

// Both a sync and a services-free async decider install freely on an async-timing decidable.
export const removeSyncOnAsync = registry.install(
  AsyncDecidable,
  Decision.sync(() => "block" as const),
);
export const removeAsyncOnAsync = registry.install(
  AsyncDecidable,
  Decision.async(() => Effect.succeed("block" as const)),
);

registry.install(
  Sync,
  // @ts-expect-error An async decider cannot be installed on a sync-timing decidable.
  Decision.async<{ readonly url: string }, "allow" | "block", never>(() =>
    Effect.succeed("block" as const),
  ),
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
  key: "types/other-same-shape",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "first",
});
export const removeStructurallyShared = registry.install(
  OtherSameShape,
  Decision.sync<{ readonly url: string }, "allow" | "block">(() => "allow"),
);

// Pass, and what the sync/async overloads guarantee about it (round 1's own regression, otherwise
// uncovered by any typechecked file in the repository).

// An always-pass decider infers Answer as `never`, not as Pass's own type, and so installs on any
// decidable — including ones with unrelated event and answer types.
export const alwaysPasses = Decision.sync(() => Decision.Pass);
const alwaysPassesIsNever: Decision.Sync<unknown, never> = alwaysPasses;
void alwaysPassesIsNever;
export const removeAlwaysPassesOnSync = registry.install(Sync, alwaysPasses);
export const removeAlwaysPassesOnOther = registry.install(Other, alwaysPasses);
export const removeAlwaysPassesOnAsyncDecidable = registry.install(AsyncDecidable, alwaysPasses);

// The same guarantee for `async`, whose overloads carry it separately: an always-passing async
// decider infers Answer as `never` rather than as Pass's own type, so it installs on an
// async-timing decidable whatever that decidable's answers are.
export const alwaysPassesAsync = Decision.async(() => Effect.succeed(Decision.Pass));
const alwaysPassesAsyncIsNever: Decision.Async<unknown, never, never> = alwaysPassesAsync;
void alwaysPassesAsyncIsNever;
export const removeAlwaysPassesAsyncOnAsync = registry.install(AsyncDecidable, alwaysPassesAsync);

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
  key: "types/fabricated",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync" as const,
  composition: "first" as const,
};
registry.install(
  // @ts-expect-error Only decidable() produces a Decidable; a hand-rolled one cannot install.
  fabricated,
  Decision.sync(() => "allow" as const),
);
// The same literal is a perfectly good *input*, which is what keeps every declaration site unchanged.
export const declaredFromLiteral = Decision.decidable(fabricated);

// A declared decidable carries its own answer decoder, built once with Answer in scope, so neither
// resolution nor this assignment needs a cast to recover what the schema decodes to.
export const decoded: "allow" | "block" = Sync.decodeAnswer("block");

// Task 2: the scoped install an owner exposes.
const decide = Registry.decide(registry, { isClosed: () => false });

// The builder produces exactly the shape owners publish, which is what Tasks 3 to 6 implement.
export const owner: Decision.Owner = { decide };

export const scopedInstall: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = decide(
  Sync,
  Decision.sync<{ readonly url: string }, "allow" | "block">(() => "allow"),
);

decide(
  Sync,
  // @ts-expect-error An async decider cannot be installed on a sync-timing decidable.
  Decision.async<{ readonly url: string }, "allow" | "block", never>(() =>
    Effect.succeed("block" as const),
  ),
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
  Decision.async<{ readonly url: string }, "allow" | "block", never>(() =>
    Effect.succeed("block" as const),
  ),
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
  key: "types/transforming",
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
  key: "types/transforming-event",
  // @ts-expect-error A transforming codec does not describe a decoded event either.
  event: Schema.NumberFromString,
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "first",
});

// `fallback` is `NoInfer`d against `answer`, so a value outside the answer schema cannot quietly
// widen Answer to admit itself. Without that, this would declare successfully and a registry would
// answer "nonsense" whenever no decider did.
Decision.decidable({
  key: "types/nonsense-fallback",
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
const widened: Decision.Decidable<{ readonly url: string }, "allow" | "block", "sync" | "async"> =
  Sync;
const asyncOnWidened = Decision.async<{ readonly url: string }, "allow" | "block", never>(() =>
  Effect.succeed("block" as const),
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
