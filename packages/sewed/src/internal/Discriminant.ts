/**
 * Reads an answer's discriminant without a cast: a bare literal answer is its own discriminant, and
 * a tagged answer carries it in `kind`. `in` narrowing is what keeps this free of `as`. Shared by
 * `Decision.ts` (declaration-time order validation) and `internal/DecisionRegistry.ts` (resolution-time
 * ranking) so the two never check discriminants a different way.
 *
 * Reading a discriminant is total: a value this cannot read has none, rather than throwing one out
 * of whatever called it. Both callers hand it a `Schema`-decoded value today — the registry ranks
 * decoded candidates, and a decidable decodes its fallback before checking its order — so neither
 * can reach the `catch`, and no test covers it. It stays because the guarantee belongs to the reader
 * rather than to its callers: `"kind" in answer` and the read that follows are both property access
 * on a value this function does not own, either can run code (a `has` trap, a getter), and the
 * registry's own call happens inside Electron's callback, where a throw cannot be caught.
 */
export const discriminantOf = (answer: unknown): string | undefined => {
  if (typeof answer === "string") return answer;
  if (typeof answer !== "object" || answer === null) return undefined;
  try {
    if (!("kind" in answer)) return undefined;
    const { kind } = answer;
    return typeof kind === "string" ? kind : undefined;
  } catch {
    return undefined;
  }
};
