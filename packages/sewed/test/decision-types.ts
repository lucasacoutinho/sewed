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

export const suspends = Decision.sync<{ readonly url: string }, "allow" | "block">(
  // @ts-expect-error A synchronous decider cannot return an Effect, so it cannot suspend
  () => Effect.succeed("block" as const),
);

export const wrongAnswer = Decision.sync<{ readonly url: string }, "allow" | "block">(
  // @ts-expect-error An answer outside the decidable's schema does not type-check
  () => "maybe",
);

void Sync;
