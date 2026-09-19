import { Schema } from "effect";
import * as Decision from "./Decision.ts";

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
export const Rules = Schema.Array(Rule);
export type Rules = typeof Rules.Type;

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

/**
 * A certificate policy: it names the least it needs from an event — `{ hostname, certificate:
 * { fingerprint } }` — and answers `"trust" | "reject" | Pass`. The first matching rule within one
 * policy wins; hostnames compare lowercased; a `*.` pattern matches the bare suffix and any
 * subdomain. `trust: "system"` and no match both answer {@link Decision.Pass}, which is why the same
 * policy installs on `Session.Certificate` (a three-answer decidable: `"reject" | "system" |
 * "trust"`) and on `App.CertificateError` (two: `"reject" | "trust"`) alike. `"always"` trusts; a
 * `{ fingerprint }` rule trusts on equality and rejects on mismatch.
 */
export const Policy = Decision.definePolicy({
  rules: Rules,
  compile: (rules) => {
    const compiled = rules.map((rule) => ({
      pattern: rule.hostname.toLowerCase(),
      trust: rule.trust,
    }));
    return (event: {
      readonly hostname: string;
      readonly certificate: { readonly fingerprint: string };
    }) => {
      const hostname = event.hostname.toLowerCase();
      const rule = compiled.find(({ pattern }) =>
        pattern.startsWith("*.")
          ? hostname === pattern.slice(2) || hostname.endsWith(pattern.slice(1))
          : hostname === pattern,
      );
      if (rule === undefined || rule.trust === "system") return Decision.Pass;
      return rule.trust === "always" || event.certificate.fingerprint === rule.trust.fingerprint
        ? "trust"
        : "reject";
    };
  },
});
