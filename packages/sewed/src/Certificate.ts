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
 * A hostname pattern's spelling, checked against an **allowlist**: dot-separated labels of
 * `[A-Za-z0-9_-]`, one optional leading `*.` label, an optional trailing dot for the FQDN form, or
 * a bracketed IPv6 literal. Nothing is permitted that is not named here, which is what a denylist
 * of forbidden characters cannot give: this check has shipped as a denylist twice
 * (`Schema.isMinLength` plus one excluded literal, then `[^.*\s]`) and been found to still admit a
 * port, a full URL, a homoglyph, and an invisible Unicode format character each time, because a
 * denylist can only enumerate the instances someone thought to exclude. See {@link canonicalPattern}
 * for the second step this alone cannot do.
 */
const spelling = /^(?:\[[0-9A-Fa-f:.]+\]|(?:\*\.)?[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.?)$/;

/** True for an address form (an IPv4 dotted quad, or bracketed) — a wildcard must never suffix one. */
const isAddress = (host: string): boolean =>
  host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host);

/** A bracketed IPv6 literal's spelling, the only form {@link bare} may unbracket. */
const bracketed = /^\[[0-9A-Fa-f:.]+\]$/;

/**
 * Lowercase, strip one trailing dot, strip IPv6 brackets — the one normalization both a pattern's
 * canonical form and an event's own `hostname` go through before they are ever compared.
 *
 * The bracket strip is gated on {@link bracketed} rather than unconditional, because only one side
 * of that comparison is validated. A *pattern* reaches here having already canonicalized through
 * the WHATWG host parser, so a bracketed one is an IPv6 literal by construction; an *event's*
 * `hostname` reaches here as whatever the caller built the event with — `Certificate.Policy` is
 * public and compiles against a structural `{ hostname }`. Stripping unconditionally therefore made
 * `[example.com]` normalize to `example.com` and match a rule written for the real host, which is a
 * trust nobody granted for a name no parser produces.
 */
const bare = (host: string): string => {
  const lowered = host.toLowerCase().replace(/\.$/, "");
  return bracketed.test(lowered) ? lowered.slice(1, -1) : lowered;
};

/**
 * RFC 1035's length bounds, which the WHATWG host parser does not apply: 63 octets per label and
 * 253 for the name. A pattern outside them canonicalizes cleanly and can never match a host a
 * decider sees, so it is refused at decode for the reason every other refusal here gives — a grant
 * that matches nothing is inert, while a *pin* that matches nothing fails open. Measured on the
 * canonical host, after {@link bare}, so a bracketed IPv6 literal is not counted with its brackets
 * and a trailing dot is not counted as a label.
 */
const withinDnsBounds = (host: string): boolean =>
  host.length <= 253 && host.split(".").every((label) => label.length <= 63);

/**
 * The canonical form a hostname pattern names, or `undefined` when it names no host a decider
 * could ever see. Two steps, deliberately kept as one function so what {@link Rule}'s schema
 * accepts and what `Certificate.Policy` matches against cannot drift apart. First the pattern's
 * {@link spelling}. Then the *value* is canonicalized through the WHATWG host parser
 * (`URL.parse("https://" + body)?.hostname`) — the same canonicalizer that produces the `hostname`
 * a decider actually receives — so `192.168.01.1` and `0xC0.0xA8.1.1` both name `192.168.1.1`, and
 * a spelling the parser cannot turn into a host (`foo.123`, `[:]`, `[1.2.3.4]`) is refused even
 * though {@link spelling} alone would admit it. A wildcard whose suffix canonicalizes to an
 * address is refused too: no certificate wildcards an IP, and so is a host outside
 * {@link withinDnsBounds}, which the parser itself does not check. Only the global `URL` is used,
 * never `node:url` — this is a root-package module and must stay importable in a renderer.
 */
const canonicalPattern = (
  pattern: string,
): { readonly wildcard: boolean; readonly host: string } | undefined => {
  if (!spelling.test(pattern)) return undefined;
  const wildcard = pattern.startsWith("*.");
  const parsed = URL.parse(`https://${wildcard ? pattern.slice(2) : pattern}`)?.hostname;
  if (parsed === undefined || parsed === "") return undefined;
  if (wildcard && isAddress(parsed)) return undefined;
  const host = bare(parsed);
  return withinDnsBounds(host) ? { wildcard, host } : undefined;
};

/**
 * Hostnames are exact or a `*.` suffix; hosts without a rule keep Chromium's verdict. A pattern
 * {@link canonicalPattern} cannot resolve to a real host is refused at decode: write a bare
 * hostname with no scheme, port, or path; an internationalized host in its punycode (`xn--`) form,
 * since Chromium reports a host that way and a Unicode spelling would never match it; or an IPv6
 * address in brackets; and within DNS's own length bounds, which the host parser does not apply.
 * A malformed *grant* fails closed: it matches nothing, so nothing new is trusted. A malformed
 * **pin** fails open instead, and that asymmetry is why this is checked at decode rather than left
 * silently inert: `{ hostname: "api.example.com ", trust: { fingerprint } }` — one pasted trailing
 * space — would otherwise never match, so the pin contributes nothing, Chromium's ordinary verdict
 * stands, and the author believes the host is pinned.
 *
 * Two differences from base, deliberate: a pin now also fires for the trailing-dot form of its
 * host — at base, a request to `example.com.` missed a rule for `example.com`, so appending a dot
 * was a pin bypass, and both sides now drop one trailing dot before comparing — and an IPv6
 * pattern matches whether the event's own hostname arrives bracketed or not, because
 * `Session.Certificate`'s event brackets one (`URL.hostname` does) while `App.CertificateError`'s
 * need not.
 */
export const Rule = Schema.Struct({
  hostname: Schema.String.check(
    Schema.makeFilter((value) =>
      canonicalPattern(value) === undefined
        ? 'A hostname pattern must be a bare hostname with no scheme, port, or path, within DNS length limits; an internationalized host in its punycode ("xn--") form; or an IPv6 address in brackets'
        : undefined,
    ),
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
  validStart: Schema.Finite,
  /** Seconds since the epoch, as Electron's `Certificate.validExpiry` reports it. */
  validExpiry: Schema.Finite,
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
 * {@link Decision.Pass}, ahead of matching any rule: `Rule`'s own schema already refuses every
 * malformed pattern that could otherwise match it, but this is the belt to that schema's braces —
 * it covers the event this compiles against, not the rules.
 */
export const Policy = Decision.definePolicy({
  rules: Rules,
  compile: (rules) => {
    // `Rule`'s own schema already proved every hostname here decodes through canonicalPattern —
    // calling it again is the one definition serving both what a rule accepts and what a policy
    // matches against, so the two cannot drift apart, rather than a second, redundant computation.
    const compiled = rules.map((rule) => ({
      pattern: canonicalPattern(rule.hostname),
      trust: rule.trust,
    }));
    return (event: {
      readonly hostname: string;
      readonly certificate: { readonly fingerprint: string };
    }) => {
      const hostname = bare(event.hostname);
      if (hostname === "") return Decision.Pass;
      const rule = compiled.find(
        ({ pattern }) =>
          pattern !== undefined &&
          (hostname === pattern.host ||
            (pattern.wildcard && hostname.endsWith(`.${pattern.host}`))),
      );
      if (rule === undefined || rule.trust === "system") return Decision.Pass;
      return rule.trust === "always" || event.certificate.fingerprint === rule.trust.fingerprint
        ? "trust"
        : "reject";
    };
  },
});
