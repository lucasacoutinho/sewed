import { Context, Effect, Scope } from "effect";
import * as Decision from "../Decision.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { discriminantOf } from "./Discriminant.ts";
import * as OwnerKinds from "./OwnerKind.ts";

/** Lower ranks are more restrictive. An answer outside the declared order never wins. */
const rankOf = (answer: unknown, order: readonly string[]): number => {
  const discriminant = discriminantOf(answer);
  if (discriminant === undefined) return Number.POSITIVE_INFINITY;
  const index = order.indexOf(discriminant);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
};

/**
 * One installed decider, stripped to what resolution needs. `decide` is declared with **method**
 * syntax deliberately, not as an arrow-typed property: TypeScript checks a method's parameter
 * bivariantly, while `strictFunctionTypes` checks an arrow-typed property's parameter strictly
 * (contravariantly). That is what lets a decider's own `(event: Event) => ...` assign into this
 * erased `(event: unknown) => ...` slot with no cast and no decode — the event that reaches a
 * decider is the exact value `resolveSync`/`resolveAsync` was called with, untouched, so nothing an
 * Electron event carries (a handle, an item, a method) is lost. Calling it back is sound regardless
 * of how it got here: `unknown` accepts any argument.
 */
type Entry =
  | { readonly tag: "sync"; decide(event: unknown): unknown }
  | { readonly tag: "async"; decide(event: unknown): Effect.Effect<unknown, never> };

/**
 * `install`'s decider parameter is written in terms of `Event`/`Answer`/`Timing` only to be
 * *checked* against them, never to help infer them: without `NoInfer`, a decider whose own event or
 * answer type differs from the decidable's would still type-check, because a type parameter shared
 * across two parameters infers to the union of both instead of requiring them equal. Inferring
 * solely from `decidable` is what makes such a decider a type error on that decidable — a decider
 * built for a *structurally identical* decidable (same event and answer types, different key) still
 * installs freely, which is ordinary structural typing rather than a gap.
 */
type Fits<Event, Answer, Timing extends "sync" | "async"> = Decision.DeciderFor<
  NoInfer<Event>,
  NoInfer<Answer>,
  NoInfer<Timing>
>;

/** Restrictive order: most restrictive first, with answers outside the declared order dropped. */
const byRank = <Answer>(
  candidates: readonly Answer[],
  order: readonly string[],
): readonly Answer[] =>
  candidates
    .map((candidate) => ({ candidate, rank: rankOf(candidate, order) }))
    .filter(({ rank }) => rank !== Number.POSITIVE_INFINITY)
    .sort((left, right) => left.rank - right.rank)
    .map(({ candidate }) => candidate);

/**
 * Applies a decidable's composition rule to its candidates — every one of them already decoded by
 * `resolveCore`, with the failure contributions its composition calls for already among them.
 * `first` keeps the earliest, which is install order; `restrictive` keeps the best-ranked, and
 * `Array.prototype.sort` is stable, so same-ranked answers keep install order too. The fallback is
 * the floor rather than a participant: it answers only when the branch leaves no candidate at all.
 *
 * `fallback` is a thunk, not a value: it is what `make` builds from either the decidable's own
 * `fallback` or the registry's own override for it (see `Fallback`), and it must decode afresh on
 * every call rather than once. `decidable` is declaration-time `Object.freeze`d, but that freeze is
 * shallow, so an object-typed fallback (`App.Login`'s `{ kind: "cancel" }`, for one) is still mutable
 * through the reference a caller receives. Handing out the one stored object every time no decider is
 * installed means mutating a returned answer corrupts every later resolution that also falls back —
 * decoding it afresh each time is what `resolveCore`'s own doc already promises for a decider's
 * answer, extended to the fallback path so it is true of both, whichever source it comes from.
 */
const pickAnswer = <Answer>(
  candidates: readonly Answer[],
  decidable: Pick<Decision.Decidable<unknown, Answer, "sync" | "async">, "composition" | "order">,
  fallback: () => Answer,
): Answer => {
  const eligible =
    decidable.composition === "first" ? candidates : byRank(candidates, decidable.order ?? []);
  const [winner = fallback()] = eligible;
  return winner;
};

/**
 * Reports a failure without letting the report become one. Rendering a cause reads properties off
 * the value a decider threw, and that value is as decider-controlled as its answer: an `Error` whose
 * `message` getter throws, or a Proxy whose traps do, would abort the resolution from inside the
 * native callback the composition exists to survive — the hostile-answer hazard again, one step
 * later and in the diagnostic rather than the decision. Containing it leaves a diagnostic either
 * way: the cause when it renders, the fact that it would not when it does not.
 */
const reported = (reason: string, cause: unknown): Effect.Effect<void> =>
  Effect.catchDefect(Effect.logError(reason, cause), () =>
    Effect.logError(`${reason} (its cause could not be rendered)`),
  );

/** What consulting one decider produced. A failed decider's *contribution* is the caller's to choose. */
type Consulted<Answer> =
  | { readonly tag: "answered"; readonly answer: Answer }
  | { readonly tag: "passed" }
  | { readonly tag: "failed" };

/**
 * Runs one entry against `event`, decodes what it answered, and reports it if it failed. This is the
 * single definition of "what counts as a failed decider", shared by every composition so the ranking
 * resolutions and the chain cannot drift apart on it.
 *
 * Failing means one of three things, treated alike because nobody chose to treat them differently:
 * throwing, returning an `Effect` that fails, or answering something the decidable's own `answer`
 * schema rejects. The third is a broken decider exactly as much as the first two are, and dropping
 * it silently is what let a fail-closed decidable resolve less restrictively than its own declared
 * fallback, with no diagnostic.
 *
 * The entry's own call is suspended inside its own `Effect` before `Effect.exit` observes it, so a
 * throw that happens before an async decider even returns its `Effect` is caught the same way as one
 * that happens inside it, rather than escaping as a defect of the caller's own `Effect<_, never>` —
 * the idiom this repository already uses for the same hazard in `internal/ContentsDownloads.ts`.
 * Decoding runs inside that same `Effect`, which is also what contains an answer whose discriminant
 * throws only when it is read.
 *
 * Answers are decoded here, before anything ranks or folds them, so the value that ranks is the
 * value that is returned. `Schema` decoding builds the answer afresh, so a decider answering with a
 * computed `kind` accessor cannot rank at one position and be returned at another.
 *
 * `contributes` names, for the log alone, what the caller will do with a failure ("the fallback",
 * "the declared failure", "nothing") — the only trace a consumer gets of a decidable that keeps
 * answering something nobody decided.
 */
const consult = <Answer>(
  key: string,
  entry: Entry,
  event: unknown,
  decodeAnswer: (candidate: unknown) => Answer,
  contributes: string,
): Effect.Effect<Consulted<Answer>> =>
  Effect.gen(function* () {
    const answerOf = (answered: unknown): Answer | Decision.Pass =>
      answered === Decision.Pass ? Decision.Pass : decodeAnswer(answered);
    const exit =
      entry.tag === "sync"
        ? yield* Effect.exit(Effect.sync(() => answerOf(entry.decide(event))))
        : yield* Effect.exit(Effect.suspend(() => Effect.map(entry.decide(event), answerOf)));
    if (exit._tag === "Success")
      return exit.value === Decision.Pass
        ? ({ tag: "passed" } as const)
        : ({ tag: "answered", answer: exit.value } as const);
    yield* reported(
      `Decider failed or answered off-schema for decidable "${key}"; contributing ${contributes}`,
      exit.cause,
    );
    return { tag: "failed" } as const;
  });

/**
 * What a failing decider contributes for one decidable, and the name the failure log gives it.
 * `contribute` decodes afresh on every call rather than handing back one stored object — see
 * {@link pickAnswer} for why — whichever of the two sources it reads from.
 */
interface Contribution<Answer> {
  readonly contribute: () => Answer;
  readonly named: string;
}

/**
 * Runs every entry installed for `key` against `event`, in install order, decoding each answer as it
 * arrives, then applies `decidable`'s composition.
 *
 * The entry list is snapshotted (`[...entries]`) before the walk starts, rather than iterated live.
 * `entries` is the same array `installOne`'s removal closure splices with `list.splice(index, 1)`, and
 * a resolution suspends between entries (`yield* Effect.exit(...)`) to await each one — a removal
 * landing during that suspension shifts later elements to the index the `for...of` iterator is about
 * to read next, so a live walk can skip a still-installed, not-yet-consulted decider outright, without
 * it ever answering. That is not a timing curiosity: on a `restrictive` decidable it lets a denial
 * vanish and the resolution answer less restrictively than every installed decider would have allowed.
 * The snapshot is what makes the in-flight semantic a deliberate choice instead of an accident: a
 * resolution consults exactly the deciders installed when it began, including ones removed while it
 * runs, and a decider is simply never consulted by a resolution that begins after its own removal. See
 * {@link Decision.Owner} for the guarantee this gives a caller.
 *
 * That guarantee depends on `resolveSync`/`resolveAsync` passing `listFor(decidable)`, not a fresh
 * `entries.get(decidable) ?? []`: the latter is evaluated eagerly, when resolution is *called*, while
 * `[...entries]` above is evaluated lazily, when it *runs* — the same gap the snapshot itself closes,
 * one call frame earlier. For a decidable that already has an entry list the two happen to coincide,
 * but for one that has never had a decider, `?? []` freezes a disconnected empty literal at call time,
 * and a decider installed a moment later — before the resolution actually runs — lands in a *different*
 * array the lazy snapshot never sees. `listFor` always returns the one persistent array a decidable
 * keeps, so a resolution's snapshot point is uniformly "when it runs", never "when it was called",
 * whether or not anything had been installed on the decidable before.
 *
 * A decider that fails is logged by {@link consult} naming `key`, and then contributes per
 * composition: `restrictive` contributes `failure` — the decidable's own declared one, or this
 * registry's effective fallback when it declared none — so a broken decider can never leave the
 * outcome less restrictive than its decidable declared; `first` contributes nothing, because
 * contributing anything there would let one broken decider both win outright and silence every later
 * one, which defeats the composition. When every decider fails there are no candidates either way,
 * so the fallback still answers.
 *
 * A contribution is decoded afresh, and so is the fallback `pickAnswer` returns when no candidate
 * survives at all — see its own doc for why: whichever source either reads from is one shared, only
 * shallowly frozen reference, and returning it as-is would let a caller's mutation of one answer
 * reach every later resolution that also falls back.
 *
 * `fallback` and `failure` arrive as thunks built by `make` rather than read off `decidable` here,
 * because both depend on the registry doing the resolving — see `Fallback` — and this function has
 * no registry of its own to consult.
 */
const resolveCore = <Answer>(
  key: string,
  entries: readonly Entry[],
  event: unknown,
  decidable: Pick<
    Decision.Decidable<unknown, Answer, "sync" | "async">,
    "composition" | "order" | "decodeAnswer"
  >,
  fallback: () => Answer,
  failure: Contribution<Answer>,
): Effect.Effect<Answer, never> =>
  Effect.gen(function* () {
    const candidates: Answer[] = [];
    const snapshot = [...entries];
    const contributes = decidable.composition === "restrictive";
    for (const entry of snapshot) {
      const consulted = yield* consult(
        key,
        entry,
        event,
        decidable.decodeAnswer,
        contributes ? failure.named : "nothing",
      );
      if (consulted.tag === "answered") candidates.push(consulted.answer);
      else if (consulted.tag === "failed" && contributes) candidates.push(failure.contribute());
    }
    return pickAnswer(candidates, decidable, fallback);
  });

/**
 * Folds instead of ranking: walks the same start-of-resolution snapshot, in install order, holding a
 * `current` event that starts as the exact object it was given and becomes whatever `advance`
 * returns. Each decider is handed `current`, so a later one sees what an earlier one produced —
 * which is the whole point, and what a ranking cannot express: two `headers` answers rank equal, so
 * under `restrictive` the first-installed would win and the second feature's headers would silently
 * vanish, which is Electron's own single-listener clobbering reintroduced one level up.
 *
 * - A `Pass` moves on, leaving `current` exactly as it was.
 * - An answer whose discriminant is in `stop` ends the resolution with it, and **later deciders are
 *   not consulted**.
 * - Any other answer becomes `advance(current, answer)`.
 * - A failing decider contributes `failure` — {@link consult} has already logged it — and that
 *   contribution is then treated exactly like an answer, so it stops the chain when it is a stop
 *   answer. That is what makes a `failure` of `block` fail closed on a request stage.
 * - The end of the list is `{ kind: "completed" }` carrying `current`; with no decider installed at
 *   all, that is the original object, untouched.
 *
 * `advance` is the library's own code rather than a decider's, so it must not throw; one that does is
 * a defect in Sewed, not in a caller. It is still run contained, and a throw is logged and its
 * decider treated as failed: that decider's own answer is discarded, and the chain then stops with
 * `failure` when that is a stop answer. When it is not, nothing is contributed at all — folding a
 * contribution in would take the same `advance` that just threw — so `current` walks on exactly as
 * the throwing `advance` was handed it, and the log says which of the two happened rather than
 * promising a contribution in both. Letting the throw escape instead would abort the whole
 * resolution from inside a native callback, which is the one outcome every other failure path here
 * exists to prevent.
 *
 * The snapshot is taken here, when the resolution *runs*, over the persistent array `listFor` hands
 * across — identical to `resolveCore`'s, and load-bearing for identical reasons; see its own doc.
 */
const chainCore = <Event, Answer>(
  key: string,
  entries: readonly Entry[],
  event: Event,
  decidable: Pick<
    Decision.Decidable<Event, Answer, "sync" | "async", "chain">,
    "chain" | "decodeAnswer"
  >,
  failure: Contribution<Answer>,
): Effect.Effect<Decision.ChainOutcome<Event, Answer>> =>
  Effect.gen(function* () {
    const snapshot = [...entries];
    // Read through a default the way `pickAnswer` reads `order`, and guaranteed by the same thing:
    // `decidable()` refuses a `"chain"` composition that declares no `chain`, and refuses a `chain`
    // on every other composition, so this default is unreachable rather than a second behaviour.
    const chain: Decision.Chain<Event, Answer> = decidable.chain ?? {
      stop: [],
      advance: (current) => current,
    };
    // Widened to a plain `readonly string[]` for the reason `Decision.ts`'s own order check gives.
    const stop: readonly string[] = chain.stop;
    const stops = (answer: Answer): boolean => {
      const discriminant = discriminantOf(answer);
      return discriminant !== undefined && stop.includes(discriminant);
    };
    let current = event;
    for (const entry of snapshot) {
      const consulted = yield* consult(key, entry, current, decidable.decodeAnswer, failure.named);
      if (consulted.tag === "passed") continue;
      const answer = consulted.tag === "answered" ? consulted.answer : failure.contribute();
      if (stops(answer)) return { kind: "stopped", answer } as const;
      const advanced = yield* Effect.exit(Effect.sync(() => chain.advance(current, answer)));
      if (advanced._tag === "Success") {
        current = advanced.value;
        continue;
      }
      // The contribution is computed before the log, not after it, because what happens next is what
      // the log has to say: a failure that stops this chain ends it, and one that does not is
      // discarded outright — the `advance` that would have folded it in is the one that just threw,
      // so nothing is contributed and the event walks on exactly as it arrived. The log used to
      // promise a contribution in both cases, which was true in only one of them.
      const contributed = failure.contribute();
      const stopping = stops(contributed);
      yield* reported(
        stopping
          ? `Chain advance failed for decidable "${key}"; the chain stops with ${failure.named}`
          : `Chain advance failed for decidable "${key}"; discarding this decider's answer and leaving the event unchanged, since ${failure.named} does not stop this chain`,
        advanced.cause,
      );
      if (stopping) return { kind: "stopped", answer: contributed } as const;
    }
    return { kind: "completed", event: current } as const;
  });

/**
 * What a decidable carries for an owner check: enough to refuse it and to name it in the refusal.
 * A `Pick` rather than a whole `Decidable` so every caller can hand one over whatever its event,
 * answer, timing or composition is.
 */
type Owned = Pick<Decision.Decidable<never, unknown, "sync" | "async">, "key" | "owner">;

/** How a foreign decidable is named wherever one is refused, so every refusal reads the same. */
const foreignMessage = (owner: Decision.OwnerKind, decidable: Owned, action: string): string =>
  `Decidable "${decidable.key}" is owned by "${decidable.owner}" and cannot be ${action} a "${owner}" owner`;

/**
 * Refuses a decidable that belongs to a different owner than the registry it reached — the runtime
 * half of the guarantee `Decision.Owner`'s own `O` makes at compile time.
 *
 * Both halves are needed. The playground's fixtures are `.mjs`, an agent may be writing plain
 * JavaScript, and a `Decidable` widened through an internal that means "any decidable" carries no
 * owner in its type either; a wrong-owner install compiles in none of those and runs in all of them,
 * and what it does is *nothing* — it registers, it is never consulted, and the resolution it was
 * meant to influence answers the fallback forever. Throwing names all three facts a reader needs:
 * the decidable, the owner it belongs to, and the owner it was handed to.
 *
 * This is the **install** shape of the refusal, and it throws because every door that uses it is a
 * consumer's own call: `install`, `installOne`, the `decide` an owner publishes, and a `Fallback` or
 * `Hook` applied at `make`. Nothing is registered and nothing native has run when it fires, so the
 * loudest possible failure is the right one. The *consult* path is deliberately different — see
 * `make`'s `resolvable` and `foreignSync` — because every one of its call sites is inside a native
 * Electron callback.
 */
const refuseForeign = (owner: Decision.OwnerKind, decidable: Owned, action: string): void => {
  if (decidable.owner === owner) return;
  throw new SewedError({ code: "Protocol", message: foreignMessage(owner, decidable, action) });
};

/**
 * Reports something that has no cause to render, contained the way {@link reported} is. There is no
 * shorter message to fall back to here — the reason *is* the whole report — so a sink that cannot
 * take it (a patched `console`, a closed stream) leaves nothing rather than a second attempt.
 */
const noted = (reason: string): Effect.Effect<void> =>
  Effect.catchDefect(Effect.logError(reason), () => Effect.void);

const fallbackIdentity: unique symbol = Symbol("sewed/Fallback");

/**
 * One owner's override of a decidable's own `fallback`, built by {@link fallback} and consumed only
 * by {@link make}. `WebContents.Download`'s catalog fallback is `deny`, the safe end for any owner
 * that declares nothing; a plain web contents' own registry overrides it to `prompt` at its
 * construction site, visible there rather than requiring a reader to cross-reference the decidable's
 * own declaration. See `Decidables.ts`'s doc on `Download` for why one decidable needs two postures.
 *
 * Not a `ReadonlyMap<string, unknown>`: keying by the decidable's own `key` string reopens exactly
 * the collision `entries` above was keyed by identity to close — two decidables sharing a `key` could
 * override each other's fallback — and a value erased to `unknown` would need a cast to read back
 * typed, which is the one erasure this whole module is written to avoid: nothing here ever recovers
 * a type it lost. `apply` closes over `Event`, `Answer`, and `Timing` where {@link fallback} is
 * called, with them fully in scope, so nothing downstream — `make`, `resolveSync`, `resolveAsync` —
 * ever needs one to use it.
 *
 * The brand is why: an object literal satisfies `{ apply: (overrides) => void }` structurally, so
 * without it a hand-built `{ apply: (o) => o.set(SomeDecidable, "whatever") }` would install into
 * `make`'s `fallbacks` with no cast, skipping every check `fallback` makes — an unvalidated override
 * included, and the first resolution that falls back to it would throw a decode error out of
 * `resolveSync`, inside the native callback the construction-time check exists to keep clean. Mirrors
 * `Decision.ts`'s `decidableIdentity` exactly, including why it works: `fallbackIdentity` is not
 * exported, so nothing outside this module can write the property key at all.
 */
export interface Fallback {
  readonly [fallbackIdentity]: true;
  readonly apply: (owner: Decision.OwnerKind, overrides: WeakMap<object, unknown>) => void;
}

/**
 * Declares one owner's override of `decidable`'s own fallback. Validated when the registry that
 * receives it is built (`make`, not here) — so a bad override fails at construction rather than
 * inside an Electron callback — against everything `decidable()` itself validates its own `fallback`
 * against: the answer schema, and, under restrictive composition, membership in the decidable's own
 * `order`. The second check matters for the same reason it matters in `Decision.decidable`'s own
 * fallback check: an override outside the declared order cannot rank, so a decider that fails would
 * contribute nothing instead of the fallback, and the resolution could answer less restrictively
 * than the decidable itself declares — the exact guarantee restrictive composition exists to give.
 *
 * The owner check happens there too, and for the same reason: an override for another owner's
 * decidable is data this registry can never reach, and a posture nobody applies is exactly the
 * silent kind of wrong this wave exists to end. `decidable` keeps the "any decidable" spelling —
 * `fallback` is declared long before it meets a registry, and which owner it is for is the
 * registry's question, not this one's.
 */
export const fallback = <Event, Answer, Timing extends "sync" | "async">(
  decidable: Decision.Decidable<Event, Answer, Timing>,
  value: NoInfer<Answer>,
): Fallback => ({
  [fallbackIdentity]: true,
  apply: (owner, overrides) => {
    refuseForeign(owner, decidable, "given a fallback override on");
    let decoded: Answer;
    try {
      decoded = decidable.decodeAnswer(value);
    } catch (cause) {
      throw new SewedError({
        code: "Protocol",
        message: `Fallback override for decidable "${decidable.key}" is not a valid answer`,
        cause,
      });
    }
    if (decidable.composition === "restrictive") {
      const discriminant = discriminantOf(decoded);
      // Widened to a plain `readonly string[]`, the same way `Decision.ts`'s own declaration-time
      // check is: `discriminantOf` reads a decoded `Answer` value at runtime and does not know
      // `order`'s declared element type.
      const declaredOrder: readonly string[] = decidable.order ?? [];
      if (discriminant === undefined || !declaredOrder.includes(discriminant))
        throw new SewedError({
          code: "Protocol",
          message: `Fallback override for decidable "${decidable.key}" is not in its declared order`,
        });
    }
    overrides.set(decidable, value);
  },
});

const hookIdentity: unique symbol = Symbol("sewed/Hook");

/** What a hook attaches and detaches: the native installer/remover pair {@link hook} wraps. */
interface NativeHook {
  readonly attach: () => void;
  readonly detach: () => void;
}
type HookMap = WeakMap<object, NativeHook>;

/**
 * One owner's declaration that a decidable has a native counterpart that should exist only while
 * the decidable has at least one decider — the certificate proc and the display-media handler are
 * the two `internal/Session.ts` declares, and a plain web contents' input gate
 * (`internal/ContentsInput.ts`) is the third; `internal/WebRequest.ts`'s own tap bookkeeping is the
 * same idea grown by hand before this existed. Built by {@link hook} and consumed only by
 * {@link make}.
 *
 * Mirrors `Fallback` exactly, including why it works: the brand makes a hook impossible to
 * *assemble* — a hand-built `{ apply: (hooks) => hooks.set(SomeDecidable, { attach, detach }) }`
 * satisfies the structural shape with no cast, which would skip the duplicate check `hook` makes.
 * `hookIdentity` is not exported, so nothing outside this module can write the property key at all.
 */
export interface Hook {
  readonly [hookIdentity]: true;
  readonly apply: (owner: Decision.OwnerKind, hooks: HookMap) => void;
}

/**
 * Declares that `decidable`'s registry should call `native.attach()` the moment its entry count
 * goes from zero to one, and `native.detach()` the moment it goes back to zero — see `installOne`'s
 * own doc for exactly when, relative to the entry list, each runs. A second hook for the same
 * decidable fails when the registry that receives both is built, the same way a bad fallback does:
 * two hooks would leave `installOne` unable to tell which one owns the transition. A hook for
 * another owner's decidable fails there too, for the reason {@link fallback}'s own owner check
 * gives: its entry count would never move, so its native counterpart would never attach.
 */
export const hook = <Event, Answer, Timing extends "sync" | "async">(
  decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition>,
  native: NativeHook,
): Hook => ({
  [hookIdentity]: true,
  apply: (owner, hooks) => {
    refuseForeign(owner, decidable, "given a native hook on");
    if (hooks.has(decidable))
      throw new SewedError({
        code: "Protocol",
        message: `Decidable "${decidable.key}" already has a native hook`,
      });
    hooks.set(decidable, native);
  },
});

/**
 * The three resolutions, which are the only thing a helper that merely *consults* a registry needs —
 * `internal/CloseGate.ts`, `internal/ContentsInput.ts`, `internal/DisplayMedia.ts`,
 * `internal/Session.ts`'s two permission gates, and `internal/WebRequest.ts`'s three native
 * listeners.
 *
 * All three name `O` on the *decidable* they resolve, not on `owner` alone. Carrying it on `owner`
 * alone constrained which registry a consumer would accept and said nothing about which decidable it
 * would then hand that registry, so `sessionResolver.resolveSync(Decidables.WebContents.Navigation,
 * …)` compiled clean — the consult path's own version of the install-elsewhere hole `O` exists to
 * close, and the one that matters most, since every consult site is inside a native Electron
 * callback where the refusal can only be a log and a fallback. The pairing is a compile error now,
 * and `foreignSync`/`resolvable` stay as the runtime half for a caller who is not compiling against
 * these types.
 *
 * It costs no call site a type argument: each of the eleven passes a decidable whose own declared
 * owner kind fixes `O` by inference, exactly as `Event` and `Answer` are already fixed. What it does
 * cost is the `Decidable<Event, Answer, Timing>` "any owner" default here — a helper that genuinely
 * means "whoever owns it" is `Registry.fallback` and `Registry.hook`, which keep it.
 *
 * `C` is spelled out rather than left to its default only because reaching the fifth parameter
 * requires naming the fourth; each resolution keeps exactly the compositions it could already fold
 * or rank, so a chain decidable stays out of the two ranking resolutions and a ranked one out of
 * `resolveChain`.
 */
export interface Resolver<O extends Decision.OwnerKind> {
  /** The kind of owner this registry decides for; every decidable installed on it must name it. */
  readonly owner: O;
  /**
   * Resolves synchronously. Only a `"sync"`-timing decidable may be resolved this way: `install`
   * refuses an async decider on one, so every entry installed *for this same decidable* is a
   * `sync` entry — there is no async-entry branch here to fall back silently, because there is
   * nothing left for it to do.
   */
  readonly resolveSync: <Event, Answer>(
    decidable: Decision.Decidable<Event, Answer, "sync", "first" | "restrictive", O>,
    event: NoInfer<Event>,
  ) => Answer;
  /** Resolves as an Effect, running the deciders in order and awaiting each. */
  readonly resolveAsync: <Event, Answer>(
    decidable: Decision.Decidable<Event, Answer, "sync" | "async", "first" | "restrictive", O>,
    event: NoInfer<Event>,
  ) => Effect.Effect<Answer, never>;
  /**
   * Resolves a chain decidable: a fold over the installed deciders rather than a ranking of their
   * answers — see {@link chainCore}. Only a `"chain"` decidable reaches it, and `resolveAsync`
   * refuses one, so neither resolution can be asked for an outcome it has no way to produce.
   */
  readonly resolveChain: <Event, Answer>(
    decidable: Decision.Decidable<Event, Answer, "sync" | "async", "chain", O>,
    event: NoInfer<Event>,
  ) => Effect.Effect<Decision.ChainOutcome<Event, Answer>>;
}

/**
 * One owner's decision registry, tagged with the kind of owner it belongs to. `O` is what makes
 * every install door take that owner's decidables and refuse every other owner's, and it is
 * threaded from here into {@link decide}, so the `decide` an owner publishes carries the same
 * refusal — a construction site that names the wrong kind is a compile error wherever that owner's
 * handle says which kind it is.
 *
 * `owner` (declared on {@link Resolver}) is a plain property rather than a phantom, for three
 * reasons: the runtime checks read it; a covariant property is what lets `O` be *inferred* at a
 * `decide(registry, control)` call site with nothing annotated there; and it is the only thing
 * carrying `O` through to a consult-only helper, whose three resolutions name no owner at all.
 */
export interface Registry<O extends Decision.OwnerKind> extends Resolver<O> {
  readonly installOne: <Event, Answer, Timing extends "sync" | "async", R>(
    decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, O>,
    decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
    context: Context.Context<R>,
  ) => () => void;
  /**
   * Installs a decider and returns its removal. Install order is the `first` composition's order,
   * and the `chain` composition's walking order. Every composition installs through this one door,
   * which is what keeps a hook's entry-count edges true whatever a decidable composes as.
   */
  readonly install: <Event, Answer, Timing extends "sync" | "async">(
    decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, O>,
    decider: Fits<Event, Answer, Timing>,
  ) => () => void;
}

export const make = <O extends Decision.OwnerKind>(options: {
  /**
   * Which owner this registry decides for. Required and never defaulted: a registry that did not
   * know its own owner could not refuse another owner's decidable, and refusing is the whole point.
   */
  readonly owner: O;
  readonly fallbacks?: readonly Fallback[];
  readonly hooks?: readonly Hook[];
}): Registry<O> => {
  // The type requires it; this is for a caller who is not compiling against the type. A registry
  // built with an owner that is not an owner kind matches nothing, so it would refuse every
  // decidable it was ever handed, for the lifetime of the owner that built it — and say so naming
  // `"undefined"`. Shares one definition of "is an owner kind" with `Decision.decidable`.
  if (!OwnerKinds.is(options.owner))
    throw new SewedError({
      code: "Protocol",
      message: `A decision registry declares owner "${options.owner}", which is not an owner kind (${OwnerKinds.names})`,
    });
  // Keyed by the decidable's own identity, not its `key` string: two distinct decidables that
  // happen to share a `key` (a plausible slip, since nothing enforces uniqueness across
  // declarations) must stay independent, or one declared `"async"` and one `"sync"` sharing a
  // string would let `resolveSync` meet an async entry installed through the other and throw
  // inside a native callback. `key` still names the decidable in diagnostics below — this only
  // changes what indexes the registry's storage.
  const entries = new WeakMap<object, Entry[]>();
  const listFor = (decidable: object): Entry[] => {
    const existing = entries.get(decidable);
    if (existing !== undefined) return existing;
    const created: Entry[] = [];
    entries.set(decidable, created);
    return created;
  };
  // Overrides are applied once, up front: each entry's own `apply` is what validates it, so a bad
  // override fails here, at construction, rather than the first time something falls back to it
  // inside a native callback.
  const overrides = new WeakMap<object, unknown>();
  for (const one of options.fallbacks ?? []) one.apply(options.owner, overrides);
  // Hooks are applied the same way and for the same reason: a duplicate hook for one decidable
  // fails here, at construction, rather than the first time an install would not know which one to
  // run.
  const hooks: HookMap = new WeakMap();
  for (const one of options.hooks ?? []) one.apply(options.owner, hooks);
  /**
   * The effective fallback for `decidable`: this registry's own override when one was declared for
   * it, or the decidable's own `fallback` otherwise. Returns a thunk, not a value, so the caller
   * (`resolveSync`/`resolveAsync`) can hand it to `resolveCore` and have it decode afresh on every
   * call — see `pickAnswer`'s doc for why a fallback must never be handed out as the same reference
   * twice. The override itself is read once here, when the thunk is built, but decoded fresh each
   * time the thunk runs, exactly like the decidable's own `fallback` always has been.
   */
  const fallbackFor = <Answer>(
    decidable: Pick<
      Decision.Decidable<unknown, Answer, "sync" | "async">,
      "fallback" | "decodeAnswer"
    >,
  ): (() => Answer) => {
    const source = overrides.has(decidable) ? overrides.get(decidable) : decidable.fallback;
    return () => decidable.decodeAnswer(source);
  };
  /**
   * What a failing decider contributes for `decidable`, and the name the failure log gives it: the
   * decidable's own declared `failure` when it has one, and the *effective* fallback — this
   * registry's override included — when it has none. Routing the undeclared case through
   * `fallbackFor` rather than `decidable.fallback` is what makes an undeclared `failure` change
   * nothing anywhere, per-owner postures included. Decoded afresh on every call for the same reason
   * a fallback is; see `pickAnswer`.
   */
  const failureFor = <Answer>(
    decidable: Pick<
      Decision.Decidable<unknown, Answer, "sync" | "async">,
      "fallback" | "failure" | "decodeAnswer"
    >,
  ): Contribution<Answer> => {
    const declared = decidable.failure;
    return declared === undefined
      ? { contribute: fallbackFor(decidable), named: "the fallback" }
      : { contribute: () => decidable.decodeAnswer(declared), named: "the declared failure" };
  };
  /**
   * Installs one decider, providing an asynchronous decider's services from `context` when the
   * registry comes to run it. `install` below passes an empty context, for a decider that needs
   * none; `decide` passes its installer's own.
   *
   * Providing the services *here* rather than into the decider before it arrives is what lets every
   * door into this registry keep `DeciderFor`'s conditional parameter: a decider that has been
   * wrapped to satisfy `R = never` has lost the `Timing` its type was checked against, and putting
   * that wrapped decider back would need either a cast or a parameter erased to
   * `Decidable<Event, Answer, "sync" | "async">` — which is how an async decider reaches a `"sync"`
   * decidable and throws `AsyncFiberError` out of an Electron callback. The `(event: Event) => ...`
   * wrapper below relies on the same method-parameter bivariance `Entry` documents above.
   *
   * Every service but one comes from that captured context. `Scope` is the exception, and it is
   * replaced with a fresh one per decision: the context captured at install carries the *installing*
   * scope, so a decider that opens anything scoped — a dialog, a lease, a subscription — would hold
   * one per resolution for the life of the install, and nothing in the types would say so, since
   * `Scope` is already among `decide`'s own requirements. `Context.add` overwrites, so the scope
   * `scopedWith` opens is the one the decider sees, and it closes when that decider's own decision
   * completes, fails, or is interrupted. A decision is the unit of work here, so it is the unit a
   * decider's resources live for.
   *
   * When `decidable` has a hook, its transitions run at the entry-count edges, not on every install
   * or removal: `attach` runs once, before the entry that takes the count from zero to one is added
   * — a throw there leaves the list untouched, so nothing is registered and the caller sees the
   * failure instead of a decider that silently never runs. `detach` runs once, after the entry that
   * takes the count from one back to zero is removed; a throw there is logged and swallowed, because
   * by then the decider is already gone and there is nothing left to roll back — see the removal
   * closure below for why the entry is removed regardless either way.
   *
   * The owner check runs first, before `attach` and before anything is registered, so a wrong-owner
   * install leaves the registry exactly as it was — see {@link refuseForeign}. It is the one place
   * both install doors share, so `install`, `installOne` and the `decide` an owner publishes all
   * refuse identically; `decide` wraps this call in `Effect.try` and already surfaces a thrown
   * `SewedError` as itself, so a consumer sees `Protocol` rather than a defect.
   *
   * That ordering is belt and braces rather than the only thing holding the promise: a foreign
   * decidable cannot carry a hook on this registry at all, because `Hook.apply` refuses one when the
   * registry is built, and the entry list `listFor` would create for it is read by nothing — every
   * resolution refuses it too. So no test can observe the check moving *after* either line — short of
   * mutating a decidable's own `owner` between `make` and `install`, which `Decision.ts`'s brand doc
   * already places out of scope — which is worth saying out loud rather than leaving a reader to
   * assume a test guards it.
   */
  const installOne = <Event, Answer, Timing extends "sync" | "async", R>(
    decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, O>,
    decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
    context: Context.Context<R>,
  ): (() => void) => {
    refuseForeign(options.owner, decidable, "installed on");
    const list = listFor(decidable);
    if (list.length === 0) hooks.get(decidable)?.attach();
    const entry: Entry =
      decider._tag === "sync"
        ? { tag: "sync", decide: decider.decide }
        : {
            tag: "async",
            decide: (event: Event) =>
              Effect.scopedWith((scope) =>
                Effect.provideContext(
                  decider.decide(event),
                  Context.add(context, Scope.Scope, scope),
                ),
              ),
          };
    list.push(entry);
    return () => {
      const index = list.indexOf(entry);
      if (index === -1) return;
      list.splice(index, 1);
      if (list.length !== 0) return;
      try {
        hooks.get(decidable)?.detach();
      } catch (cause) {
        Effect.runFork(
          Effect.logError(`Hook detach failed for decidable "${decidable.key}"`, cause),
        );
      }
    };
  };
  /**
   * The consult path's refusal, and it is shaped nothing like the install path's — see
   * {@link refuseForeign} for that one.
   *
   * A resolution of a foreign decidable is a bug in Sewed, not a consumer's mistake: the type
   * refuses one at every door a consumer can reach, and the five internals that only consult a
   * registry each name the owner kind they consult. But every one of the eleven call sites is
   * *inside a native Electron callback* — `will-navigate`, `setWindowOpenHandler`, `will-download`,
   * `before-input-event`, `preconnect`, `page-title-updated`, `will-prevent-unload`,
   * `window-all-closed`, the certificate proc, the display-media handler, the close/quit gate — and
   * all but two of them are uncontained. Throwing there turns a silent inert gate into an uncaught
   * main-process exception, and at the `internal/NativeAnswer.ts` sites into a native callback that
   * is never answered at all, after `event.preventDefault()` has already been called on it.
   *
   * So the two asynchronous resolutions refuse **inside the Effect they return** rather than at the
   * call site: the refusal becomes a defect of an Effect whose caller already contains it —
   * `internal/CloseGate.ts`'s own `catchCause` logs and denies, `internal/NativeAnswer.ts` runs its
   * `failed()` closed form and logs. Moving the body inside `Effect.suspend` also moves
   * `listFor(decidable)` from "when it was called" to "when it runs", which is where every other
   * read point in this file already is, and which `resolveCore`'s own doc argues for at length.
   *
   * `resolveSync` cannot fail an Effect — it answers inside the callback — so it never throws: see
   * {@link foreignSync}.
   */
  const resolvable = (decidable: Owned): void =>
    refuseForeign(options.owner, decidable, "resolved by");
  /**
   * What a synchronous resolution of a foreign decidable answers, since it can neither throw into a
   * native callback nor fail an Effect: the decidable's own declared `failure`, or its `fallback`
   * when it declares none, decoded afresh the way every other fallback in this file is (see
   * {@link pickAnswer}). Every guard in the catalog declares a closed `failure` — `Window.Close`
   * `"deny"`, `WebContents.Download` `deny`, `Session.Certificate` `"reject"` — so this fails
   * closed, and it is deliberately *not* routed through this registry's own overrides: an override
   * for a foreign decidable cannot exist here, because `Fallback.apply` refuses one at `make`.
   *
   * It is loud on **every** resolution, not once: the silent-inert-gate failure this whole task
   * exists to end is exactly the one that leaves no trace, and a bug that fires on every navigation
   * should say so every time rather than scroll past once.
   */
  const foreignSync = <Answer>(
    decidable: Pick<
      Decision.Decidable<unknown, Answer, "sync">,
      "key" | "owner" | "fallback" | "failure" | "decodeAnswer"
    >,
  ): Answer => {
    const answer = decidable.failure ?? decidable.fallback;
    Effect.runFork(
      noted(
        `${foreignMessage(options.owner, decidable, "resolved by")}; this is a bug in Sewed. Answering the decidable's own ${decidable.failure === undefined ? "fallback" : "failure"} instead`,
      ),
    );
    return decidable.decodeAnswer(answer);
  };
  return {
    owner: options.owner,
    installOne,
    install: <Event, Answer, Timing extends "sync" | "async">(
      decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, O>,
      decider: Fits<Event, Answer, Timing>,
    ): (() => void) => installOne(decidable, decider, Context.empty()),
    resolveSync: <Event, Answer>(
      decidable: Decision.Decidable<Event, Answer, "sync">,
      event: NoInfer<Event>,
    ): Answer =>
      decidable.owner !== options.owner
        ? foreignSync(decidable)
        : Effect.runSync(
            resolveCore(
              decidable.key,
              listFor(decidable),
              event,
              decidable,
              fallbackFor(decidable),
              failureFor(decidable),
            ),
          ),
    resolveAsync: <Event, Answer>(
      decidable: Decision.Decidable<Event, Answer, "sync" | "async">,
      event: NoInfer<Event>,
    ): Effect.Effect<Answer, never> =>
      Effect.suspend(() => {
        resolvable(decidable);
        return resolveCore(
          decidable.key,
          listFor(decidable),
          event,
          decidable,
          fallbackFor(decidable),
          failureFor(decidable),
        );
      }),
    resolveChain: <Event, Answer>(
      decidable: Decision.Decidable<Event, Answer, "sync" | "async", "chain">,
      event: NoInfer<Event>,
    ): Effect.Effect<Decision.ChainOutcome<Event, Answer>> =>
      Effect.suspend(() => {
        resolvable(decidable);
        return chainCore(
          decidable.key,
          listFor(decidable),
          event,
          decidable,
          failureFor(decidable),
        );
      }),
  };
};

/** What an owner must expose for its deciders to refuse installation after it closes. */
export interface Control {
  readonly isClosed: () => boolean;
}

/**
 * Builds the `decide` an owner exposes, which is {@link Decision.Owner}'s method: a scoped install.
 * The decider starts deciding when this Effect runs and is removed when the caller's scope closes: it
 * is not consulted by any resolution that begins after that. A resolution already in flight when the
 * scope closes is unaffected — `resolveCore` snapshots its entry list at the start of each resolution,
 * so it still completes with every decider installed when it began, this one included.
 *
 * An owner that has already closed refuses with `Closed` rather than registering a decider nothing
 * will consult. `isClosed` is read when this Effect runs rather than when it is built — the body is
 * deferred, the way every `Effect.gen` body is — so an owner that closes between building the
 * install and running it still refuses.
 *
 * An asynchronous decider's services are provided from the installing Effect's own context, the way
 * `internal/CloseGate.ts`'s `make` captures it, so the decider runs inside a native callback later
 * with the services its installer had. That is why the returned Effect requires the decider's `R`.
 *
 * `installOne` itself can throw now — a hook's `attach`, run when this decider is the decidable's
 * first, and a decidable belonging to another owner — so the install step is `Effect.try`, not
 * `Effect.sync`, and it re-raises a thrown `SewedError` as itself: a thrown `attach` surfaces here
 * as code `Native` and a foreign decidable as the `Protocol` `installOne` threw, both typed failures
 * this Effect already declares rather than a defect the caller never asked for the shape of.
 *
 * `O` is inferred from `registry`'s own `owner` and threaded into the returned function's decidable
 * parameter, which is what makes this the `decide` of {@link Decision.Owner}`<O>` and nothing
 * wider. Every owner's handle publishes the result of one of these calls, so the owner kind its
 * registry was built with is the owner kind its `decide` accepts — a construction site that names
 * the wrong one is a compile error against that handle's own contract assertions.
 */
export const decide =
  <O extends Decision.OwnerKind>(registry: Registry<O>, control: Control) =>
  <Event, Answer, Timing extends "sync" | "async", R = never>(
    decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, O>,
    decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
  ): Effect.Effect<void, SewedError, MainContext | Scope.Scope | R> =>
    Effect.gen(function* () {
      yield* MainContext;
      const context = yield* Effect.context<R>();
      yield* Effect.acquireRelease(
        Effect.suspend(() =>
          control.isClosed()
            ? Effect.fail(
                new SewedError({
                  code: "Closed",
                  message: `Cannot install a decider for ${decidable.key}: its owner is closed`,
                }),
              )
            : Effect.try({
                try: () => registry.installOne(decidable, decider, context),
                catch: (cause) =>
                  cause instanceof SewedError
                    ? cause
                    : new SewedError({
                        code: "Native",
                        message: `Could not install a decider for ${decidable.key}`,
                        cause,
                      }),
              }),
        ),
        (remove) => Effect.sync(() => remove()),
      );
    });
