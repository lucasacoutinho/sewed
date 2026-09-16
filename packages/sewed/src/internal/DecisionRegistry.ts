import { Context, Effect } from "effect";
import * as Decision from "../Decision.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { discriminantOf } from "./Discriminant.ts";
import type { Scope } from "effect";

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
 */
const pickAnswer = <Answer>(
  candidates: readonly Answer[],
  decidable: Pick<
    Decision.Decidable<unknown, Answer, "sync" | "async">,
    "composition" | "order" | "fallback"
  >,
): Answer => {
  const eligible =
    decidable.composition === "first" ? candidates : byRank(candidates, decidable.order ?? []);
  const [winner = decidable.fallback] = eligible;
  return winner;
};

/**
 * Runs every entry installed for `key` against `event`, in install order, decoding each answer as it
 * arrives, then applies `decidable`'s composition.
 *
 * A decider that fails is logged naming `key`, and then contributes per composition: `restrictive`
 * contributes the fallback, so a broken decider can never leave the outcome less restrictive than
 * its decidable declared; `first` contributes nothing, because contributing the fallback there would
 * let one broken decider both win outright and silence every later one, which defeats the
 * composition. When every decider fails there are no candidates either way, so the fallback still
 * answers.
 *
 * Failing means one of three things, treated alike because nobody chose to treat them differently:
 * throwing, returning an `Effect` that fails, or answering something the decidable's own `answer`
 * schema rejects. The third is a broken decider exactly as much as the first two are, and dropping
 * it silently is what let a fail-closed decidable resolve less restrictively than its own declared
 * fallback, with no diagnostic.
 *
 * Each entry's own call is suspended inside its own `Effect` before `Effect.exit` observes it, so a
 * throw that happens before an async decider even returns its `Effect` is caught the same way as one
 * that happens inside it, rather than escaping as a defect of this function's own `Effect<Answer,
 * never>` — the idiom this repository already uses for the same hazard in
 * `internal/ContentsDownloads.ts`. Decoding runs inside that same `Effect`, which is also what
 * contains an answer whose discriminant throws only when it is read.
 *
 * Candidates are decoded here, before they are ranked, so the value that ranks is the value that is
 * returned. `Schema` decoding builds the answer afresh, so a decider answering with a computed
 * `kind` accessor cannot rank at one position and be returned at another.
 */
const resolveCore = <Answer>(
  key: string,
  entries: readonly Entry[],
  event: unknown,
  decidable: Pick<
    Decision.Decidable<unknown, Answer, "sync" | "async">,
    "composition" | "order" | "fallback" | "decodeAnswer"
  >,
): Effect.Effect<Answer, never> =>
  Effect.gen(function* () {
    const answerOf = (answered: unknown): Answer | Decision.Pass =>
      answered === Decision.Pass ? Decision.Pass : decidable.decodeAnswer(answered);
    const candidates: Answer[] = [];
    for (const entry of entries) {
      const exit =
        entry.tag === "sync"
          ? yield* Effect.exit(Effect.sync(() => answerOf(entry.decide(event))))
          : yield* Effect.exit(Effect.suspend(() => Effect.map(entry.decide(event), answerOf)));
      if (exit._tag === "Success") {
        if (exit.value !== Decision.Pass) candidates.push(exit.value);
        continue;
      }
      const contributes = decidable.composition === "restrictive";
      const reason = `Decider failed or answered off-schema for decidable "${key}"; contributing ${contributes ? "the fallback" : "nothing"}`;
      // Rendering a cause reads properties off the value the decider threw, and that value is as
      // decider-controlled as its answer is: an `Error` whose `message` getter throws, or a Proxy
      // whose traps do, would abort this resolution from inside the native callback the composition
      // exists to survive — the hostile-answer hazard again, one step later and in the diagnostic
      // rather than the decision. Containing it leaves a diagnostic either way: the cause when it
      // renders, the fact that it would not when it does not.
      yield* Effect.catchDefect(Effect.logError(reason, exit.cause), () =>
        Effect.logError(`${reason} (its cause could not be rendered)`),
      );
      if (contributes) candidates.push(decidable.fallback);
    }
    return pickAnswer(candidates, decidable);
  });

export const make = () => {
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
   */
  const installOne = <Event, Answer, Timing extends "sync" | "async", R>(
    decidable: Decision.Decidable<Event, Answer, Timing>,
    decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
    context: Context.Context<R>,
  ): (() => void) => {
    const list = listFor(decidable);
    const entry: Entry =
      decider._tag === "sync"
        ? { tag: "sync", decide: decider.decide }
        : {
            tag: "async",
            decide: (event: Event) => Effect.provideContext(decider.decide(event), context),
          };
    list.push(entry);
    return () => {
      const index = list.indexOf(entry);
      if (index !== -1) list.splice(index, 1);
    };
  };
  return {
    installOne,
    /** Installs a decider and returns its removal. Install order is the `first` composition's order. */
    install: <Event, Answer, Timing extends "sync" | "async">(
      decidable: Decision.Decidable<Event, Answer, Timing>,
      decider: Fits<Event, Answer, Timing>,
    ): (() => void) => installOne(decidable, decider, Context.empty()),
    /**
     * Resolves synchronously. Only a `"sync"`-timing decidable may be resolved this way: `install`
     * refuses an async decider on one, so every entry installed *for this same decidable* is a
     * `sync` entry — there is no async-entry branch here to fall back silently, because there is
     * nothing left for it to do.
     */
    resolveSync: <Event, Answer>(
      decidable: Decision.Decidable<Event, Answer, "sync">,
      event: Event,
    ): Answer =>
      Effect.runSync(resolveCore(decidable.key, entries.get(decidable) ?? [], event, decidable)),
    /** Resolves as an Effect, running the deciders in order and awaiting each. */
    resolveAsync: <Event, Answer>(
      decidable: Decision.Decidable<Event, Answer, "sync" | "async">,
      event: Event,
    ): Effect.Effect<Answer, never> =>
      resolveCore(decidable.key, entries.get(decidable) ?? [], event, decidable),
  };
};

/** What an owner must expose for its deciders to refuse installation after it closes. */
export interface Control {
  readonly isClosed: () => boolean;
}

/**
 * Builds the `decide` an owner exposes, which is {@link Decision.Owner}'s method: a scoped install.
 * The decider starts deciding when this Effect runs and is removed when the caller's scope closes,
 * so a decider cannot outlive the code that installed it.
 *
 * An owner that has already closed refuses with `Closed` rather than registering a decider nothing
 * will consult. The check runs inside the acquire, not when the Effect is built, so an owner that
 * closes in between still refuses.
 *
 * An asynchronous decider's services are provided from the installing Effect's own context, the way
 * `internal/CloseGate.ts:30-31` captures it, so the decider runs inside a native callback later with
 * the services its installer had. That is why the returned Effect requires the decider's `R`.
 */
export const decide =
  (registry: ReturnType<typeof make>, control: Control) =>
  <Event, Answer, Timing extends "sync" | "async", R = never>(
    decidable: Decision.Decidable<Event, Answer, Timing>,
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
            : Effect.sync(() => registry.installOne(decidable, decider, context)),
        ),
        (remove) => Effect.sync(() => remove()),
      );
    });
