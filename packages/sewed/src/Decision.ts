import { Effect, Schema, SubscriptionRef } from "effect";
import { discriminantOf } from "./internal/Discriminant.ts";
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
 * What {@link decidable} is declared with.
 *
 * `event` and `answer` are `Schema.Codec`, not the more general `Schema.Schema`: a decidable is
 * decoded synchronously (`resolveSync`, and every declaration-time check below), which requires a
 * schema that needs no decoding services. `Schema.Codec` defaults its `Encoded` type to `Type`, so a
 * transforming codec (`Schema.NumberFromString`, `Schema.DateFromString`, ...) is a declaration-time
 * type error here — describe the decoded shape directly instead.
 */
export interface DecidableOptions<Event, Answer, Timing extends "sync" | "async"> {
  readonly key: string;
  readonly event: Schema.Codec<Event>;
  readonly answer: Schema.Codec<Answer>;
  /**
   * `NoInfer`d so `Answer` is fixed by `answer` alone: without it, a `fallback` outside `answer`'s
   * type would still type-check, because a type parameter shared by two properties infers to the
   * union of both instead of requiring them equal.
   */
  readonly fallback: NoInfer<Answer>;
  readonly timing: Timing;
  readonly composition: "restrictive" | "first";
  /**
   * Discriminant values, most restrictive first. Required when composition is "restrictive". Typed
   * against `Answer`'s own discriminants ({@link DiscriminantOf}) rather than a bare string, so a
   * misspelled entry is a compile error rather than a candidate that silently never wins.
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
 */
export interface Decidable<Event, Answer, Timing extends "sync" | "async"> extends DecidableOptions<
  Event,
  Answer,
  Timing
> {
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
 */
export interface Owner {
  readonly decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
    decidable: Decidable<Event, Answer, Timing>,
    decider: DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
  ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope | R>;
}

/**
 * Declares a decidable native event. The declaration is inert: it installs nothing and creates no
 * native object. It does validate itself, and fails `Protocol` rather than let a broken decidable
 * reach installation:
 *
 * - A restrictive decidable must declare the order its answers rank in, because "most restrictive"
 *   is data rather than a convention.
 * - A `first` decidable must not declare an order: `first` means the earliest non-`Pass` answer
 *   wins, so an order would have no meaning there, and honoring it as a filter would blur two
 *   compositions that are deliberately distinct.
 * - `order`, when declared, cannot repeat an entry.
 * - `fallback` must decode against `answer` — it is what a registry answers when no candidate is
 *   eligible, and under restrictive composition it is also what each broken decider contributes, so
 *   an invalid one is the least acceptable place for a typo to hide.
 * - Under restrictive composition, `fallback`'s own discriminant must appear in `order`, or nothing
 *   a decider could ever return would rank below it.
 *
 * The returned decidable is frozen, and `order` is copied, so a caller cannot change resolution for
 * every registry by mutating the object it declared.
 *
 * An already-declared decidable is refused rather than re-declared: a registry keys its deciders by
 * decidable identity, so a second declaration would answer with the same `key` while being invisible
 * to every decider installed on the first. The optional `never` brand on the parameter is what makes
 * that a type error instead of a decidable that silently decides nothing.
 */
export const decidable = <Event, Answer, Timing extends "sync" | "async">(
  options: DecidableOptions<Event, Answer, Timing> & {
    readonly [decidableIdentity]?: never;
  },
): Decidable<Event, Answer, Timing> => {
  const order = options.order;
  if (options.composition === "restrictive" && (order ?? []).length === 0)
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} composes restrictively and must declare its answer order`,
    });
  if (options.composition === "first" && order !== undefined)
    throw new SewedError({
      code: "Protocol",
      message: `Decidable ${options.key} composes "first" and must not declare an order`,
    });
  if (order !== undefined) {
    const duplicate = order.find((value, index) => order.indexOf(value) !== index);
    if (duplicate !== undefined)
      throw new SewedError({
        code: "Protocol",
        message: `Decidable ${options.key}'s order repeats "${duplicate}"`,
      });
  }
  const decodeAnswer = Schema.decodeUnknownSync(options.answer);
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
  if (options.composition === "restrictive" && order !== undefined) {
    const discriminant = discriminantOf(fallback);
    // Widened to a plain `readonly string[]`, not narrowed: `discriminantOf` reads a decoded
    // `Answer` value at runtime and cannot know `order`'s declared element type, so the membership
    // check itself stays over `string` — the covariant assignment below needs no cast, since
    // `DiscriminantOf<Answer>` always extends `string`.
    const declaredOrder: readonly string[] = order;
    if (discriminant === undefined || !declaredOrder.includes(discriminant))
      throw new SewedError({
        code: "Protocol",
        message: `Decidable ${options.key}'s fallback is not in its declared order`,
      });
  }
  const declared: Decidable<Event, Answer, Timing> = {
    ...options,
    [decidableIdentity]: true,
    decodeAnswer,
    fallback,
    ...(order === undefined ? {} : { order: Object.freeze([...order]) }),
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
