import { Effect, Schema } from "effect";
import * as Decision from "../Decision.ts";
import { discriminantOf } from "./Discriminant.ts";

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
 * A decider whose timing fits the decidable it is installed on. A sync-timing decidable refuses an
 * async decider outright: the answer is required inside Electron's own callback, which cannot wait,
 * so a decider that might suspend could never honor it. This is a type error, not a runtime one —
 * `resolveSync` (below) is written so it can never actually meet an async entry.
 */
type DeciderFor<Event, Answer, Timing extends "sync" | "async"> = Timing extends "sync"
  ? Decision.Sync<Event, Answer>
  : Decision.Decider<Event, Answer, never>;

/**
 * `install`'s decider parameter is written in terms of `Event`/`Answer`/`Timing` only to be
 * *checked* against them, never to help infer them: without `NoInfer`, a decider whose own event or
 * answer type differs from the decidable's would still type-check, because a type parameter shared
 * across two parameters infers to the union of both instead of requiring them equal. Inferring
 * solely from `decidable` is what makes such a decider a type error on that decidable — a decider
 * built for a *structurally identical* decidable (same event and answer types, different key) still
 * installs freely, which is ordinary structural typing rather than a gap.
 */
type Fits<Event, Answer, Timing extends "sync" | "async"> = DeciderFor<
  NoInfer<Event>,
  NoInfer<Answer>,
  NoInfer<Timing>
>;

/**
 * Applies a decidable's composition rule to its candidates (already Pass-filtered; failure
 * contributions already added by `resolveCore`, per composition), decoding the winner back into
 * `Answer`. An answer that fails to decode is treated exactly like a decider that never answered:
 * `first` moves on to the next candidate, and `restrictive` (whose only candidates here already
 * ranked below `Infinity`, i.e. matched a declared order entry) falls back.
 */
const pickAnswer = <Answer>(
  candidates: readonly unknown[],
  decidable: Pick<
    Decision.Decidable<unknown, Answer, "sync" | "async">,
    "composition" | "order" | "fallback" | "answer"
  >,
): Answer => {
  const decodeAnswer = Schema.decodeUnknownSync(decidable.answer);
  const finalize = (candidate: unknown): Answer | Decision.Pass => {
    try {
      return decodeAnswer(candidate);
    } catch {
      return Decision.Pass;
    }
  };
  if (decidable.composition === "first") {
    for (const candidate of candidates) {
      const decoded = finalize(candidate);
      if (decoded !== Decision.Pass) return decoded;
    }
    return decidable.fallback;
  }
  const order = decidable.order ?? [];
  let bestRank = Number.POSITIVE_INFINITY;
  let best: unknown;
  let found = false;
  for (const candidate of candidates) {
    const rank = rankOf(candidate, order);
    if (rank < bestRank) {
      bestRank = rank;
      best = candidate;
      found = true;
    }
  }
  if (!found) return decidable.fallback;
  const decoded = finalize(best);
  return decoded === Decision.Pass ? decidable.fallback : decoded;
};

/**
 * Runs every entry installed for `key` against `event`, in install order, then applies `decidable`'s
 * composition. A decider that throws, or an async decider whose Effect fails, is logged naming
 * `key`, and then contributes per composition: `restrictive` contributes the fallback, because it is
 * itself a ranked candidate and (for a well-formed decidable) the restrictive end, so contributing it
 * on failure stays safe; `first` contributes nothing, because contributing the fallback would let one
 * broken decider both win outright and silence every later one — which defeats the composition. When
 * every decider fails there are no candidates either way, so the fallback still answers.
 *
 * Each entry's own call is suspended inside its own `Effect` before `Effect.exit` observes it, so a
 * throw that happens before an async decider even returns its `Effect` is caught the same way as one
 * that happens inside it, rather than escaping as a defect of this function's own `Effect<Answer,
 * never>` — the idiom this repository already uses for the same hazard in
 * `internal/ContentsDownloads.ts`.
 */
const resolveCore = <Answer>(
  key: string,
  entries: readonly Entry[],
  event: unknown,
  decidable: Pick<
    Decision.Decidable<unknown, Answer, "sync" | "async">,
    "composition" | "order" | "fallback" | "answer"
  >,
): Effect.Effect<Answer, never> =>
  Effect.gen(function* () {
    const candidates: unknown[] = [];
    for (const entry of entries) {
      const exit =
        entry.tag === "sync"
          ? yield* Effect.exit(Effect.sync(() => entry.decide(event)))
          : yield* Effect.exit(Effect.suspend(() => entry.decide(event)));
      if (exit._tag === "Success") {
        if (exit.value !== Decision.Pass) candidates.push(exit.value);
        continue;
      }
      const contributes = decidable.composition === "restrictive";
      yield* Effect.logError(
        `Decider failed for decidable "${key}"; contributing ${contributes ? "the fallback" : "nothing"}`,
        exit.cause,
      );
      if (contributes) candidates.push(decidable.fallback);
    }
    return pickAnswer(candidates, decidable);
  });

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
    install: <Event, Answer, Timing extends "sync" | "async">(
      decidable: Decision.Decidable<Event, Answer, Timing>,
      decider: Fits<Event, Answer, Timing>,
    ): (() => void) => {
      const list = listFor(decidable.key);
      const entry: Entry =
        decider._tag === "sync"
          ? { tag: "sync", decide: decider.decide }
          : { tag: "async", decide: decider.decide };
      list.push(entry);
      return () => {
        const index = list.indexOf(entry);
        if (index !== -1) list.splice(index, 1);
      };
    },
    /**
     * Resolves synchronously. Only a `"sync"`-timing decidable may be resolved this way: `install`
     * refuses an async decider on one, so every entry this ever iterates is a `sync` entry — there is
     * no async-entry branch here to fall back silently, because there is nothing left for it to do.
     */
    resolveSync: <Event, Answer>(
      decidable: Decision.Decidable<Event, Answer, "sync">,
      event: Event,
    ): Answer =>
      Effect.runSync(
        resolveCore(decidable.key, entries.get(decidable.key) ?? [], event, decidable),
      ),
    /** Resolves as an Effect, running the deciders in order and awaiting each. */
    resolveAsync: <Event, Answer>(
      decidable: Decision.Decidable<Event, Answer, "sync" | "async">,
      event: Event,
    ): Effect.Effect<Answer, never> =>
      resolveCore(decidable.key, entries.get(decidable.key) ?? [], event, decidable),
  };
};
