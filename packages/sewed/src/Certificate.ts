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

/**
 * What Electron's `certificate-error` callback hands over about the offending certificate, narrowed
 * to the fields a trust decision actually needs: the fingerprint a rule pins against, the subject and
 * issuer names a decider can show or match, and the validity window. Electron's own `Certificate`
 * carries more (the PEM data, the full principal objects, a recursive issuer certificate, and the
 * serial number); none of it is needed to answer "trust" or "reject", so it stays out of the
 * decidable's event.
 */
export const Presented = Schema.Struct({
  fingerprint: Schema.String.check(Schema.isMinLength(1)),
  subjectName: Schema.String,
  issuerName: Schema.String,
  /** Seconds since the epoch, as Electron's `Certificate.validStart` reports it. */
  validStart: Schema.Number,
  /** Seconds since the epoch, as Electron's `Certificate.validExpiry` reports it. */
  validExpiry: Schema.Number,
});
export type Presented = typeof Presented.Type;
