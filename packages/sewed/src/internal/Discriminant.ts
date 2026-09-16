/**
 * Reads an answer's discriminant without a cast: a bare literal answer is its own discriminant, and
 * a tagged answer carries it in `kind`. `in` narrowing is what keeps this free of `as`. Shared by
 * `Decision.ts` (declaration-time order validation) and `internal/DecisionRegistry.ts` (resolution-time
 * ranking) so the two never check discriminants a different way.
 *
 * Both the `in` check and the read that follows it sit inside the `try`, because either can run
 * caller-controlled code: reading `kind` invokes a getter, and `"kind" in answer` invokes a Proxy's
 * `has` trap. Neither may abort the caller — the registry resolves inside Electron's own callback,
 * and a decidable validates its own fallback at declaration — so an answer this cannot read has no
 * discriminant rather than throwing one out.
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
