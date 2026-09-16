/**
 * Reads an answer's discriminant without a cast: a bare literal answer is its own discriminant, and
 * a tagged answer carries it in `kind`. `in` narrowing is what keeps this free of `as`. Shared by
 * `Decision.ts` (declaration-time order validation) and `internal/DecisionRegistry.ts` (resolution-time
 * ranking) so the two never check discriminants a different way.
 */
export const discriminantOf = (answer: unknown): string | undefined => {
  if (typeof answer === "string") return answer;
  if (typeof answer === "object" && answer !== null && "kind" in answer) {
    const { kind } = answer;
    return typeof kind === "string" ? kind : undefined;
  }
  return undefined;
};
