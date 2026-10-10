import { Schema } from "effect";
import type { Effect } from "effect";
import * as Decision from "../src/Decision.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const Event = Schema.Struct({ kind: Schema.Literal("native") });
const Answer = Schema.Literals(["allow", "block"]);
const Sync = Decision.decidable({
  key: "contents/resolver-types-sync",
  owner: "contents",
  event: Event,
  answer: Answer,
  fallback: "allow",
  timing: "sync",
  composition: "first",
});
const Chain = Decision.decidable({
  key: "contents/resolver-types-chain",
  owner: "contents",
  event: Event,
  answer: Answer,
  fallback: "allow",
  timing: "async",
  composition: "chain",
  chain: { stop: ["block"], advance: (event) => event },
});
const registry = Registry.make({ owner: "contents" });
const syncAnswer = registry.resolveSync(Sync, { kind: "native" });
const asyncAnswer = registry.resolveAsync(Sync, { kind: "native" });
const chainAnswer = registry.resolveChain(Chain, { kind: "native" });

export type ResolverContracts = [
  Assert<Equal<typeof syncAnswer, Schema.Schema.Type<typeof Answer>>>,
  Assert<Equal<typeof asyncAnswer, Effect.Effect<Schema.Schema.Type<typeof Answer>>>>,
  Assert<
    Equal<
      typeof chainAnswer,
      Effect.Effect<
        Decision.ChainOutcome<Schema.Schema.Type<typeof Event>, Schema.Schema.Type<typeof Answer>>
      >
    >
  >,
];
