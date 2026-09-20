import type { OwnerKind } from "../Decision.ts";

/**
 * One definition of "is an owner kind", and one table of what each kind's decidables are keyed
 * under. Both `Decision.decidable` and `internal/DecisionRegistry.ts`'s `make` have to answer that
 * question at runtime — the first about a declaration, the second about a registry — and answering
 * it twice is how the two would drift.
 *
 * It lives in its own internal module rather than in `Decision.ts` because `Decision.ts` is
 * re-exported wholesale from the root entry: anything exported there is public API, and this is a
 * guard against a caller who is not compiling against these types at all, not a surface a consumer
 * needs. The type-only import back into `Decision.ts` is erased, so there is no runtime cycle.
 */

/**
 * The `key` prefix each owner kind's decidables carry, so the convention every shipped key already
 * follows (`"window/close"`, `"contents/navigation"`) cannot drift away from the field that now
 * means it. `"requests"` shares the session's prefix, since a request stage belongs to a session
 * however it is installed.
 */
export const prefixes: Record<OwnerKind, string> = {
  app: "app",
  window: "window",
  contents: "contents",
  session: "session",
  requests: "session",
};

/** Every owner kind, quoted, for a refusal that has to tell a reader what the valid ones are. */
export const names: string = Object.keys(prefixes)
  .map((kind) => `"${kind}"`)
  .join(", ");

/**
 * Whether a value is an owner kind. Deliberately a plain `boolean` rather than a type predicate:
 * both callers already hold a value whose *type* says it is an `OwnerKind`, so narrowing would make
 * the refusing branch `never` and read as dead code. It is not — the playground's fixtures are
 * `.mjs`, `Decision.decidable` is public, and a JavaScript caller can hand either of them anything
 * at all. `Object.hasOwn` rather than `in`, so `"toString"` is not an owner kind.
 */
export const is = (value: unknown): boolean =>
  typeof value === "string" && Object.hasOwn(prefixes, value);
