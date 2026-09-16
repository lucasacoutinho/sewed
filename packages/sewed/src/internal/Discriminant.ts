/**
 * Reads an answer's discriminant without a cast: a bare literal answer is its own discriminant, and
 * a tagged answer carries it in `kind`. `in` narrowing is what keeps this free of `as`. Shared by
 * `Decision.ts` (declaration-time order validation) and `internal/DecisionRegistry.ts` (resolution-time
 * ranking) so the two never check discriminants a different way.
 *
 * `"kind" in answer` only checks the property exists; reading it can still invoke a getter, so a
 * decider answering `{ get kind() { throw ... } }` must not abort the read here the way it would
 * abort a resolution reached outside every `try` — a decider's own answer shape is exactly the kind
 * of thing this task's whole composition exists to survive.
 */
export const discriminantOf = (answer: unknown): string | undefined => {
  if (typeof answer === "string") return answer;
  if (typeof answer === "object" && answer !== null && "kind" in answer) {
    try {
      const { kind } = answer;
      return typeof kind === "string" ? kind : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
};
