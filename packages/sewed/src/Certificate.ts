import { Schema } from "effect";

/** How a host's certificate is judged: Chromium's verdict, unconditional trust, or one pinned fingerprint. */
export const Trust = Schema.Union([
  Schema.Literal("system"),
  Schema.Literal("always"),
  Schema.Struct({ fingerprint: Schema.String.check(Schema.isMinLength(1)) }),
]);
export type Trust = typeof Trust.Type;

/** Hostnames are exact or a `*.` suffix; hosts without a rule keep Chromium's verdict. */
export const Rule = Schema.Struct({
  hostname: Schema.String.check(Schema.isMinLength(1)),
  trust: Trust,
});
export type Rule = typeof Rule.Type;
export const Policy = Schema.Array(Rule);
export type Policy = typeof Policy.Type;
