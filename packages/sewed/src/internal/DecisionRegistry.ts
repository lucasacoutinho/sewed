import { Effect, Schema } from "effect";
import * as Decision from "../Decision.ts";

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

/**
 * One installed decider, stripped to the shape resolution needs. Event and answer are erased to
 * `unknown` here: the decider's own closure (built in `install`, where its decidable's `Event` and
 * `Answer` are still concrete) is the only thing that ever needs to know their real types. A `sync`
 * decider answers directly; an `async` one already requires no services, because `install` refuses
 * to accept one that does — see its signature below.
 */
type Entry =
  | { readonly tag: "sync"; readonly decide: (event: unknown) => unknown }
  | { readonly tag: "async"; readonly decide: (event: unknown) => Effect.Effect<unknown, never> };

/** A decider whose timing fits the decidable it is installed on. Sync decidables refuse async deciders outright: the answer is required inside Electron's own callback, so a decider that might suspend could never honor it. */
type DeciderFor<Event, Answer, Timing extends "sync" | "async"> = Timing extends "sync"
  ? Decision.Sync<Event, Answer>
  : Decision.Decider<Event, Answer, never>;

/**
 * `install`'s decider parameter is written in terms of `Event`/`Answer`/`Timing` only to be
 * *checked* against them, never to help infer them: without `NoInfer`, a decider whose own answer
 * differs from the decidable's would still type-check, because a type parameter shared across two
 * parameters infers to the union of both instead of requiring them equal. Inferring solely from
 * `decidable` is what makes a decider for one decidable a type error on another.
 */
type Fits<Event, Answer, Timing extends "sync" | "async"> = DeciderFor<
  NoInfer<Event>,
  NoInfer<Answer>,
  NoInfer<Timing>
>;

/** Runs every installed decider against `event`, in install order, contributing a candidate per entry. */
const candidatesOf = (
  entries: readonly Entry[],
  fallback: unknown,
  event: unknown,
): readonly unknown[] => {
  const candidates: unknown[] = [];
  for (const entry of entries) {
    if (entry.tag === "async") {
      candidates.push(fallback);
      continue;
    }
    try {
      const result = entry.decide(event);
      if (result !== Decision.Pass) candidates.push(result);
    } catch (cause) {
      Effect.runFork(Effect.logError("Decider failed; contributing the fallback", cause));
      candidates.push(fallback);
    }
  }
  return candidates;
};

/** Applies a decidable's composition rule to its candidates, decoding the winner back into `Answer`. */
const pickAnswer = <Answer>(
  candidates: readonly unknown[],
  decidable: Pick<
    Decision.Decidable<unknown, Answer, "sync" | "async">,
    "composition" | "order" | "fallback" | "answer"
  >,
): Answer => {
  const decodeAnswer = Schema.decodeUnknownSync(decidable.answer);
  const finalize = (candidate: unknown): Answer => {
    try {
      return decodeAnswer(candidate);
    } catch {
      return decidable.fallback;
    }
  };
  if (decidable.composition === "first") {
    for (const candidate of candidates) return finalize(candidate);
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
  return found ? finalize(best) : decidable.fallback;
};

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
      const decodeEvent = Schema.decodeUnknownSync(decidable.event);
      const entry: Entry =
        decider._tag === "sync"
          ? { tag: "sync", decide: (raw: unknown) => decider.decide(decodeEvent(raw)) }
          : { tag: "async", decide: (raw: unknown) => decider.decide(decodeEvent(raw)) };
      list.push(entry);
      return () => {
        const index = list.indexOf(entry);
        if (index !== -1) list.splice(index, 1);
      };
    },
    /** Resolves synchronously. An installed `async` decider cannot suspend here, so it contributes the fallback, exactly like a throw. */
    resolveSync: <Event, Answer, Timing extends "sync" | "async">(
      decidable: Decision.Decidable<Event, Answer, Timing>,
      event: Event,
    ): Answer => {
      const list = entries.get(decidable.key) ?? [];
      const candidates = candidatesOf(list, decidable.fallback, event);
      return pickAnswer(candidates, decidable);
    },
    /** Resolves as an Effect, running the deciders in order and awaiting each. */
    resolveAsync: <Event, Answer, Timing extends "sync" | "async">(
      decidable: Decision.Decidable<Event, Answer, Timing>,
      event: Event,
    ): Effect.Effect<Answer, never> =>
      Effect.gen(function* () {
        const list = entries.get(decidable.key) ?? [];
        const candidates: unknown[] = [];
        for (const entry of list) {
          if (entry.tag === "sync") {
            try {
              const result = entry.decide(event);
              if (result !== Decision.Pass) candidates.push(result);
            } catch (cause) {
              yield* Effect.logError("Decider failed; contributing the fallback", cause);
              candidates.push(decidable.fallback);
            }
            continue;
          }
          const exit = yield* Effect.exit(entry.decide(event));
          if (exit._tag === "Success") {
            if (exit.value !== Decision.Pass) candidates.push(exit.value);
          } else {
            yield* Effect.logError("Decider failed; contributing the fallback", exit.cause);
            candidates.push(decidable.fallback);
          }
        }
        return pickAnswer(candidates, decidable);
      }),
  };
};
