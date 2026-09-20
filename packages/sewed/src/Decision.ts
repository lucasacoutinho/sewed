import { Effect, Schema, SubscriptionRef } from "effect";
import { discriminantOf } from "./internal/Discriminant.ts";
import * as OwnerKinds from "./internal/OwnerKind.ts";
import { SewedError } from "./SewedError.ts";
import type { Scope } from "effect";
import type { MainContext } from "./RuntimeContext.ts";

/** Returned by a decider that declines to answer, so the remaining deciders and the fallback apply. */
export const Pass = Symbol.for("sewed/Decision/Pass");
export type Pass = typeof Pass;

/**
 * The discriminant a value of `Answer` ranks by under restrictive composition: a bare literal answer
 * is its own discriminant, and a `kind`-tagged answer's is its `kind`. Mirrors the same two shapes,
 * in the same order, as `internal/Discriminant.ts`'s runtime `discriminantOf`. Deliberately not the
 * outer `Answer` itself: without this, `order` typed as bare `readonly string[]` accepted any
 * string, so a transposed character (`"blcok"` for `"block"`) compiled, constructed, and silently
 * ranked `Infinity` — never winning, on the composition whose entire purpose is that a denial cannot
 * be lost. Under this type, that same typo is `TS2820` at the declaration site instead.
 *
 * This does not mean the type and the runtime can never drift apart. `order`'s own use of this type
 * wraps it in `NoInfer` (see `DecidableOptions.order`), and a distributive conditional does not
 * distribute under `NoInfer` — so for an `Answer` that mixes string literals with `kind`-tagged
 * members (`Certificate.Trust`, for one: `"system" | "always" | { fingerprint: string }`),
 * `DiscriminantOf<NoInfer<Answer>>` measures as `never` even though `discriminantOf` reads a real
 * discriminant off `"system"` or `"always"` at runtime. That is fail-closed, not broken: a decidable
 * whose answer mixes the two discriminant shapes cannot declare an `order` under this type at all,
 * which is a real, load-bearing limit worth hitting at the declaration site rather than a bug to
 * work around by reaching for `readonly string[]` again.
 */
export type DiscriminantOf<Answer> = Answer extends string
  ? Answer
  : Answer extends { readonly kind: infer Kind extends string }
    ? Kind
    : never;

/**
 * How a decidable's deciders combine, declared where the event is rather than decided by whoever
 * resolves it:
 *
 * - `first` keeps the earliest non-{@link Pass} answer, which is install order.
 * - `restrictive` ranks every answer by {@link DecidableOptions.order} and keeps the best-ranked, so
 *   no decider can widen another's denial.
 * - `chain` is a fold rather than a ranking: each decider sees the event the previous one produced,
 *   and an answer in {@link Chain.stop} ends the resolution. Header rewriting is the case a ranking
 *   cannot express — two `headers` answers rank equal, so one feature's headers would silently
 *   vanish, which is Electron's own single-listener clobbering reintroduced one level up.
 */
export type Composition = "first" | "restrictive" | "chain";

/**
 * How a `chain` decidable folds: which answers end it, and what the next decider sees.
 *
 * `advance` is the library's own code, not a decider's — it is declared beside the event, where the
 * shape of both the event and the answer is known, so it is the one place that knows how to put an
 * answer back into an event.
 */
export interface Chain<Event, Answer> {
  /** Discriminants that end the chain with that answer, leaving later deciders unconsulted. */
  readonly stop: readonly DiscriminantOf<Answer>[];
  /** What the next decider sees, given what this one answered. */
  readonly advance: (event: Event, answer: Answer) => Event;
}

/** What a `chain` resolution produced: an answer that stopped it, or the event it folded to. */
export type ChainOutcome<Event, Answer> =
  | { readonly kind: "stopped"; readonly answer: Answer }
  | { readonly kind: "completed"; readonly event: Event };

/**
 * Which owner resolves a decidable's event, and therefore the only owner a decider for it may be
 * installed on. Declared on the decidable rather than left to a convention, because a decider
 * installed on the wrong owner is not a decider that fails: it registers, it never runs, and the
 * resolution it was meant to influence answers the fallback forever. On a fallback-open decidable
 * — `Window.Close` answers `"allow"` when nobody objects — that is a guard that silently does not
 * guard, which `window.webContents.decide(Decidables.Window.Close, …)` used to compile into.
 *
 * `"requests"` is a session's *other* owner: the three request stages install through a door that
 * also takes a filter, so a session holds two registries and each refuses the other's decidables.
 * Nothing declares it yet.
 */
export type OwnerKind = "app" | "window" | "contents" | "session" | "requests";

/**
 * What {@link decidable} is declared with.
 *
 * `event` and `answer` are `Schema.Codec`, not the more general `Schema.Schema`: a decidable is
 * decoded synchronously (`resolveSync`, and every declaration-time check below), which requires a
 * schema that needs no decoding services. `Schema.Codec` defaults its `Encoded` type to `Type`, so a
 * transforming codec (`Schema.NumberFromString`, `Schema.DateFromString`, ...) is a declaration-time
 * type error here — describe the decoded shape directly instead.
 */
export interface DecidableOptions<
  Event,
  Answer,
  Timing extends "sync" | "async",
  C extends Composition,
  O extends OwnerKind,
> {
  readonly key: string;
  /**
   * The owner that resolves this event, and so the only owner a decider for it installs on — see
   * {@link OwnerKind}. It must agree with `key`'s own prefix, which {@link decidable} checks.
   */
  readonly owner: O;
  readonly event: Schema.Codec<Event>;
  readonly answer: Schema.Codec<Answer>;
  /**
   * What a resolution answers when *nobody has an opinion*: no decider is installed, or every one
   * of them {@link Pass}es. An owner may override it for its own registry — see
   * `internal/DecisionRegistry.ts`'s `fallback`.
   *
   * `NoInfer`d so `Answer` is fixed by `answer` alone: without it, a `fallback` outside `answer`'s
   * type would still type-check, because a type parameter shared by two properties infers to the
   * union of both instead of requiring them equal.
   */
  readonly fallback: NoInfer<Answer>;
  /**
   * What a *broken* decider contributes: one that throws, dies, or answers something this
   * decidable's own `answer` schema rejects. Defaults to the effective fallback — the owner's
   * override included — so leaving it undeclared changes nothing.
   *
   * Separate from `fallback` because the two jobs only coincide when the fallback is the closed
   * answer. A `Window.Close` whose fallback is `"allow"` (nobody objects, so the window closes) must
   * not let a crashing unsaved-changes guard close that same window; declaring `failure: "deny"` is
   * what says so at the event, where a reader of the decidable can see it. Refused on a `first`
   * decidable, where a failing decider contributes nothing and this would be dead data.
   */
  readonly failure?: NoInfer<Answer>;
  readonly timing: Timing;
  readonly composition: C;
  /**
   * Discriminant values, most restrictive first. Required when composition is "restrictive", and
   * refused on any other, since only a ranking has anything to rank. Typed against `Answer`'s own
   * discriminants ({@link DiscriminantOf}) rather than a bare string, so a misspelled entry is a
   * compile error rather than a candidate that silently never wins.
   *
   * `NoInfer`d for the same reason `fallback` is, and proven differential rather than kept for
   * symmetry: for a bare string-literal `Answer`, `DiscriminantOf<Answer>` alone — `Answer` still
   * inferred from `order` too — lets a misspelled entry widen `Answer` to admit itself instead of
   * being checked against it, silently defeating the whole point; pinned in `decision-types.ts`. A
   * `kind`-tagged `Answer` happens to still catch the same typo without `NoInfer` (its wider object
   * shape does not admit a stray string literal into the union the same way), which is exactly the
   * kind of shape-dependent gap `NoInfer<Event>`'s own history in `CloseGate.ts` already warns about.
   */
  readonly order?: readonly DiscriminantOf<NoInfer<Answer>>[];
  /**
   * How a `chain` decidable folds. Required when composition is "chain", and refused on any other.
   * `NoInfer`d on both parameters for the same reason `fallback` and `order` are — and this is what
   * lets `advance` be written unannotated: `Event` and `Answer` are fixed by the sibling schemas, so
   * both its parameters arrive already typed, and a misspelled discriminant inside its body is a
   * compile error rather than a branch that never runs.
   */
  readonly chain?: Chain<NoInfer<Event>, NoInfer<Answer>>;
}

const decidableIdentity: unique symbol = Symbol("sewed/Decidable");

/**
 * A declared decidable: what {@link decidable} returns, and the only thing a registry installs on or
 * resolves. It is deliberately not the type a caller writes.
 *
 * - The brand is why. It makes a decidable impossible to *assemble*: an object literal satisfies
 *   {@link DecidableOptions} structurally, and without the brand it would install and resolve while
 *   having skipped every check `decidable` makes — an unvalidated fallback included, which is what
 *   resolution answers with when no decider does. The limit of that: a spread of a declared
 *   decidable carries the brand along, so overriding a field of one produces a decidable the type
 *   still accepts and the checks never saw. Fabrication is what this prevents; sabotage is not.
 * - `decodeAnswer` is the `answer` schema's decoder, built once at declaration with `Answer` fully
 *   in scope. Resolution decodes every candidate through it, inside Electron's own callback for a
 *   `"sync"` decidable, so building it per resolution would be work done in the worst place for it;
 *   and because it is built where `Answer` is known, neither resolution nor this type needs a cast
 *   to recover what the schema decodes to.
 *
 * `C` defaults to everything *except* `"chain"`, which is what keeps a chain decidable out of every
 * resolver and helper that cannot fold one — `resolveSync`, `resolveAsync`, `Registry.fallback`,
 * `internal/CloseGate.ts` — with no edit to any of them, while the install doors that must accept
 * every composition say so by naming {@link Composition} explicitly.
 *
 * `O` defaults to all of {@link OwnerKind} for the same kind of reason, one parameter over: every
 * internal that means "any decidable, whoever owns it" — the three resolutions, `Registry.fallback`,
 * `Registry.hook`, `internal/CloseGate.ts` — keeps its existing `Decidable<Event, Answer, Timing>`
 * spelling and keeps accepting every decidable, because a declared `"window"` decidable is
 * assignable to one whose owner is the whole union. The install doors, which must accept *one*
 * owner's decidables and refuse the rest, are the ones that name `O` explicitly.
 */
export interface Decidable<
  Event,
  Answer,
  Timing extends "sync" | "async",
  C extends Composition = "first" | "restrictive",
  O extends OwnerKind = OwnerKind,
> extends DecidableOptions<Event, Answer, Timing, C, O> {
  readonly [decidableIdentity]: true;
  readonly decodeAnswer: (candidate: unknown) => Answer;
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
 * A decider whose timing fits the decidable it is installed on. A `"sync"` decidable refuses an
 * async decider outright: the answer is required inside Electron's own callback, which cannot wait,
 * so a decider that might suspend could never honor it. That is a type error rather than a runtime
 * one — the registry's synchronous resolution is written so it can never meet an async decider.
 *
 * `Timing` is tuple-wrapped so the conditional does not distribute, and the test is for `"async"`
 * rather than `"sync"` so that anything less specific than `"async"` lands on the synchronous side.
 * Both halves are load-bearing: `timing` is a covariant `readonly` property, so a `"sync"` decidable
 * widens to `Decidable<Event, Answer, "sync" | "async">` with no cast, and a distributing conditional
 * would evaluate at each member and union the results — `Sync | Decider`, which admits exactly the
 * async decider `resolveSync` would then meet inside a native callback.
 */
export type DeciderFor<Event, Answer, Timing extends "sync" | "async", R = never> = [
  Timing,
] extends ["async"]
  ? Decider<Event, Answer, R>
  : Sync<Event, Answer>;

/**
 * What an owner exposes so a caller can decide the owner's events. Every owner in this wave
 * implements it with the builder in `internal/DecisionRegistry.ts`.
 *
 * The install lives for the caller's scope and removes itself when that scope closes: a decider is
 * not consulted by any resolution that *begins* after its scope closes, which is the property the
 * shapes this replaces lack. That is narrower than "cannot outlive the code that installed it" — a
 * resolution already in flight when the scope closes is unaffected by the removal and still completes
 * with every decider installed when it began, this one included, because the registry resolves
 * against a snapshot of its entries taken at the start of each resolution, not against the live list.
 * Installing on an owner that has already closed fails `Closed` rather than registering a decider
 * nothing will ever consult. An asynchronous decider's services reach the returned Effect's
 * requirements, because the owner runs that decider later, with the context its installer had.
 *
 * `O` is the owner's own kind, so a decidable belonging to a *different* owner is a compile error at
 * the call site rather than an install nothing ever consults — see {@link OwnerKind}. An owner has
 * one kind and no default: naming it is what each owner's handle does, and what makes
 * `contents.decide(Decidables.Window.Close, …)` say `Type '"window"' is not assignable to type
 * '"contents"'`.
 */
export interface Owner<O extends OwnerKind> {
  readonly decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
    decidable: Decidable<Event, Answer, Timing, Composition, O>,
    decider: DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
  ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope | R>;
}

/**
 * Declares a decidable native event. The declaration is inert: it installs nothing and creates no
 * native object. It does validate itself, and fails `Protocol` rather than let a broken decidable
 * reach installation:
 *
 * - `owner` must be an {@link OwnerKind}. The type says so, so this is for a caller who is not
 *   compiling against it — a `.mjs` fixture, a JavaScript consumer — and the refusal names the
 *   kinds there are, which is the JavaScript half of the `TS2820 Did you mean '"window"'?` a
 *   misspelling gets in TypeScript.
 * - `key` must carry its own owner's prefix (`internal/OwnerKind.ts`). Every shipped key already
 *   spells its owner — `"window/close"`, `"contents/navigation"` — and that convention is now what
 *   a reader of a diagnostic goes by, so this is what stops the two drifting apart: a decidable
 *   declared `owner: "contents"` under a `window/` key would read as a window's in every log and
 *   refuse every window install.
 * - A restrictive decidable must declare the order its answers rank in, because "most restrictive"
 *   is data rather than a convention.
 * - Any other composition must not declare an order: `first` means the earliest non-`Pass` answer
 *   wins and `chain` folds rather than ranks, so an order would have no meaning in either, and
 *   honoring it as a filter would blur compositions that are deliberately distinct.
 * - `order`, when declared, cannot repeat an entry.
 * - A `chain` decidable must declare its `chain`, and only a `chain` decidable may: the fold is what
 *   the composition *is*, and a `chain` block anywhere else is data nothing reads.
 * - A `chain` decidable must be `"async"`. Nothing needs a synchronous fold, so no synchronous fold
 *   is built, and a `"sync"` one would otherwise declare cleanly and never be resolvable.
 * - `chain.stop`, like `order`, cannot repeat an entry.
 * - `fallback` must decode against `answer` — it is what a registry answers when no candidate is
 *   eligible, and, absent a declared `failure`, it is also what each broken decider contributes, so
 *   an invalid one is the least acceptable place for a typo to hide.
 * - Under restrictive composition, `fallback`'s own discriminant must appear in `order`, or nothing
 *   a decider could ever return would rank below it.
 * - `failure`, when declared, is validated exactly as `fallback` is, for the same reasons: it
 *   decodes against `answer`, and under restrictive composition its discriminant must appear in
 *   `order` — an unrankable failure would be filtered out and a broken decider would contribute
 *   nothing, which is the hole the whole field exists to close.
 * - A `first` decidable must not declare a `failure`: there a broken decider contributes nothing, so
 *   the field would read as if it mattered while changing nothing.
 *
 * The returned decidable is frozen, and `order` and `chain` are copied, so a caller cannot change
 * resolution for every registry by mutating the object it declared.
 *
 * An already-declared decidable is refused rather than re-declared: a registry keys its deciders by
 * decidable identity, so a second declaration would answer with the same `key` while being invisible
 * to every decider installed on the first. The optional `never` brand on the parameter is what makes
 * that a type error instead of a decidable that silently decides nothing.
 */
export const decidable = <
  Event,
  Answer,
  Timing extends "sync" | "async",
  C extends Composition,
  O extends OwnerKind,
>(
  options: DecidableOptions<Event, Answer, Timing, C, O> & {
    readonly [decidableIdentity]?: never;
  },
): Decidable<Event, Answer, Timing, C, O> => {
  const order = options.order;
  const chain = options.chain;
  // The kind first, then its prefix: reading the prefix of a kind that does not exist would report
  // a missing `"undefined/"` key and send a JavaScript caller looking for a prefix rather than
  // telling them what they actually got wrong.
  if (!OwnerKinds.is(options.owner))
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} declares owner "${options.owner}", which is not an owner kind (${OwnerKinds.names})`,
    });
  const prefix = OwnerKinds.prefixes[options.owner];
  if (!options.key.startsWith(`${prefix}/`))
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} is owned by "${options.owner}" and must have a "${prefix}/" key`,
    });
  if (options.composition === "restrictive" && (order ?? []).length === 0)
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} composes restrictively and must declare its answer order`,
    });
  if (options.composition !== "restrictive" && order !== undefined)
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} composes "${options.composition}" and must not declare an order`,
    });
  if (order !== undefined) {
    const duplicate = order.find((value, index) => order.indexOf(value) !== index);
    if (duplicate !== undefined)
      throw new SewedError({
        code: "Protocol",
        message: `Decidable ${options.key}'s order repeats "${duplicate}"`,
      });
  }
  if (options.composition === "chain" && chain === undefined)
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} composes as a chain and must declare how it advances`,
    });
  if (options.composition !== "chain" && chain !== undefined)
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} composes "${options.composition}" and must not declare a chain`,
    });
  if (chain !== undefined) {
    if (options.timing !== "async")
      throw new SewedError({
        code: "Protocol",
        message: `Decidable ${options.key} composes as a chain and must be "async"`,
      });
    const stop = chain.stop;
    const duplicate = stop.find((value, index) => stop.indexOf(value) !== index);
    if (duplicate !== undefined)
      throw new SewedError({
        code: "Protocol",
        message: `Decidable ${options.key}'s chain repeats the stop "${duplicate}"`,
      });
  }
  const decodeAnswer = Schema.decodeUnknownSync(options.answer);
  // Widened to a plain `readonly string[]`, not narrowed: `discriminantOf` reads a decoded `Answer`
  // value at runtime and cannot know `order`'s declared element type, so the membership check itself
  // stays over `string` — the covariant assignment needs no cast, since `DiscriminantOf<Answer>`
  // always extends `string`.
  const declaredOrder: readonly string[] = order ?? [];
  const ranks = (answer: Answer): boolean => {
    const discriminant = discriminantOf(answer);
    return discriminant !== undefined && declaredOrder.includes(discriminant);
  };
  let fallback: Answer;
  try {
    fallback = decodeAnswer(options.fallback);
  } catch (cause) {
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key}'s fallback is not a valid answer`,
      cause,
    });
  }
  if (options.composition === "restrictive" && !ranks(fallback))
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key}'s fallback is not in its declared order`,
    });
  const declaredFailure = options.failure;
  let failure: Answer | undefined;
  if (declaredFailure !== undefined) {
    if (options.composition === "first")
      throw new SewedError({
        code: "Protocol",
        message: `Decidable ${options.key} composes "first", where a failing decider contributes nothing, and must not declare a failure`,
      });
    try {
      failure = decodeAnswer(declaredFailure);
    } catch (cause) {
      throw new SewedError({
        code: "Protocol",
        message: `Decidable ${options.key}'s failure is not a valid answer`,
        cause,
      });
    }
    if (options.composition === "restrictive" && !ranks(failure))
      throw new SewedError({
        code: "Protocol",
        message: `Decidable ${options.key}'s failure is not in its declared order`,
      });
  }
  const declared: Decidable<Event, Answer, Timing, C, O> = {
    ...options,
    [decidableIdentity]: true,
    decodeAnswer,
    fallback,
    ...(failure === undefined ? {} : { failure }),
    ...(order === undefined ? {} : { order: Object.freeze([...order]) }),
    ...(chain === undefined
      ? {}
      : { chain: Object.freeze({ ...chain, stop: Object.freeze([...chain.stop]) }) }),
  };
  return Object.freeze(declared);
};

/**
 * A decider Electron can run inside its own callback. It cannot suspend, so it returns no Effect.
 *
 * A single signature deliberately: an earlier overloaded form (one signature for a decider that only
 * ever passes, one for the general case) broke contextual typing at every call site instead of
 * helping it. Overload resolution does not apply the contextual type a decidable's `decide` parameter
 * offers, so `Decision.sync(() => "quit")` inferred `Sync<Event, string>` — the literal widened —
 * instead of `Sync<Event, "quit" | "stay">`, and every answer needed an `as const` or an annotated
 * return type to compile. A single signature lets the argument context flow through normally, so the
 * natural spelling infers the literal answer type with no annotation. See {@link pass} for a decider
 * that only ever passes.
 */
export const sync = <Event, Answer>(
  decide: (event: Event) => Answer | Pass,
): Sync<Event, Answer> => ({ _tag: "sync", decide });

/** A decider for a decidable whose answer may arrive later. See {@link sync} for why this is a single signature. */
export const async = <Event, Answer, R>(
  decide: (event: Event) => Effect.Effect<Answer | Pass, never, R>,
): Async<Event, Answer, R> => ({ _tag: "async", decide });

/**
 * A decider that never answers: always `Pass`, so it never contributes to any resolution and the
 * remaining deciders and the fallback apply. `Answer` is `never` rather than `Pass`'s own type, which
 * is a real decider answer's subtype and so installs on any decidable, whatever its event or answer
 * shape — this is what {@link sync}'s dropped overload used to buy through inference; naming the
 * decider instead reads better than an overload that silently broke every other call site.
 */
export const pass: Sync<unknown, never> = sync<unknown, never>(() => Pass);

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

/**
 * Rule data plus the compile that turns it into a decider. A policy is declared once, by the module
 * that owns the matching logic (`Navigation.Policy`, `Permission.Policy`, `Certificate.Policy`), and
 * installed by a caller through {@link policy}, which supplies only the rule data. The rule the whole
 * wave's policies follow: a policy answers only for what its rules match, and answers {@link Pass}
 * for everything else, so two features' policies compose as a union of grants instead of vetoing each
 * other. A decider that must deny on a miss — a cap nobody can widen — is a plain {@link sync}
 * decider instead, not a `Policy`.
 */
export interface Policy<Rules, Event, Answer> {
  readonly rules: Schema.Codec<Rules>;
  readonly compile: (rules: Rules) => (event: Event) => Answer | Pass;
}

/**
 * Declares a policy: rule data plus the compile that turns it into a decider. `compile`'s own `rules`
 * parameter is `NoInfer`d against the `rules` schema so a policy's `Rules` type is fixed by its schema
 * alone — the same idiom `DecidableOptions.fallback` uses against `answer`, for the same reason: a
 * type parameter shared by two properties would otherwise infer to the union of both instead of
 * requiring them equal. The declaration is inert like {@link decidable}'s: nothing is installed until
 * {@link policy} compiles it against rule data and a caller installs the result.
 */
export const definePolicy = <Rules, Event, Answer>(options: {
  readonly rules: Schema.Codec<Rules>;
  readonly compile: (rules: NoInfer<Rules>) => (event: Event) => Answer | Pass;
}): Policy<Rules, Event, Answer> => Object.freeze({ ...options });

/**
 * Compiles `rules` against a declared {@link Policy}, decoding them through the policy's own schema
 * into a synchronous decider. It throws immediately, at construction, before anything is installed:
 * rule data is usually static, so a defect here is the right failure mode, and a caller with dynamic
 * rules can wrap this call.
 */
export const policy = <Rules, Event, Answer>(
  kind: Policy<Rules, Event, Answer>,
  rules: NoInfer<Rules>,
): Sync<Event, Answer> => sync(kind.compile(Schema.decodeUnknownSync(kind.rules)(rules)));
