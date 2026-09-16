import { Effect, Schema, SubscriptionRef } from "effect";
import { SewedError } from "./SewedError.ts";

/** Returned by a decider that declines to answer, so the remaining deciders and the fallback apply. */
export const Pass = Symbol.for("sewed/Decision/Pass");
export type Pass = typeof Pass;

export interface Decidable<Event, Answer, Timing extends "sync" | "async"> {
  readonly key: string;
  readonly event: Schema.Codec<Event>;
  readonly answer: Schema.Codec<Answer>;
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
  schema: Schema.Codec<Rules>,
  rules: Rules,
  compile: (rules: Rules) => (event: Event) => Answer | Pass,
): Sync<Event, Answer> => sync(compile(Schema.decodeUnknownSync(schema)(rules)));
