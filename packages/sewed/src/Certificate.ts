import { Schema } from "effect";
import * as Decision from "./Decision.ts";

/** How a host's certificate is judged: Chromium's verdict, unconditional trust, or one pinned fingerprint. */
export const Trust = Schema.Union([
  Schema.Literal("system"),
  Schema.Literal("always"),
  Schema.Struct({ fingerprint: Schema.String.check(Schema.isMinLength(1)) }),
]);
export type Trust = typeof Trust.Type;

/**
 * A hostname pattern: dot-separated non-empty labels, `*` appearing only as one leading `*.`
 * label, no whitespace, with an optional trailing dot for the FQDN form still legal
 * (`example.com.`, `*.example.com.`). Refuses the whole family of degenerate patterns that read as
 * a rule but match nothing or something other than what they read as — `"*."`, `"*.."`, `"."`,
 * `"*"`, `"a..b"`, `"*.*.x"`, `"x*"`, `"*x.example"`, and a pasted leading or trailing space.
 */
const HostnamePattern = /^(\*\.)?[^.*\s]+(\.[^.*\s]+)*\.?$/u;

/**
 * Hostnames are exact or a `*.` suffix; hosts without a rule keep Chromium's verdict — see
 * {@link HostnamePattern} for exactly what shape a hostname pattern must have. A malformed
 * *grant* fails closed: it matches nothing, so nothing new is trusted. A malformed **pin** fails
 * open instead, and that asymmetry is why this is checked at decode rather than left silently
 * inert: `{ hostname: "api.example.com ", trust: { fingerprint } }` — one pasted trailing space —
 * would otherwise never match, so the pin contributes nothing, Chromium's ordinary verdict stands,
 * and the author believes the host is pinned.
 */
export const Rule = Schema.Struct({
  hostname: Schema.String.check(
    Schema.isPattern(HostnamePattern, {
      message:
        'A hostname pattern must be dot-separated non-empty labels, with "*" only as one leading "*." label, no whitespace, and an optional trailing dot',
    }),
  ),
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
 * `{ fingerprint }` rule trusts on equality and rejects on mismatch. An empty `hostname` — what
 * `App.CertificateError`'s event carries for a URL Chromium could not parse — always answers
 * {@link Decision.Pass}, ahead of matching any rule: `Rule`'s own {@link HostnamePattern} check
 * already refuses every malformed pattern that could otherwise match it, but this is the belt to
 * that schema's braces — it covers the event this compiles against, not the rules.
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
      if (hostname === "") return Decision.Pass;
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
