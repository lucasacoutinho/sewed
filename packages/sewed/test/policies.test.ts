import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Schema } from "effect";
import * as Certificate from "../src/Certificate.ts";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Navigation from "../src/Navigation.ts";
import * as Permission from "../src/Permission.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

const certificate: Certificate.Presented = {
  fingerprint: "AA:BB:CC",
  subjectName: "example.com",
  issuerName: "test-ca",
  validStart: 0,
  validExpiry: 1,
};

test("two permission policies each grant their own document", () => {
  const registry = Registry.make({ owner: "session" });
  registry.install(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "document", url: "https://a.example/page", permissions: ["notifications"] },
    ]),
  );
  registry.install(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "document", url: "https://b.example/page", permissions: ["notifications"] },
    ]),
  );
  const check = (document: string) =>
    registry.resolveSync(Decidables.Session.Permission, {
      name: "notifications",
      origin: null,
      document,
      mediaTypes: [],
    });
  assert.equal(check("https://a.example/page"), "allow");
  assert.equal(check("https://b.example/page"), "allow");
  assert.equal(check("https://c.example/page"), "deny");
});

test("a permission policy grants only the permissions its rule names", () => {
  const registry = Registry.make({ owner: "session" });
  registry.install(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "document", url: "https://a.example/page", permissions: ["notifications"] },
    ]),
  );
  const check = (name: string) =>
    registry.resolveSync(Decidables.Session.Permission, {
      name,
      origin: null,
      document: "https://a.example/page",
      mediaTypes: [],
    });
  assert.equal(check("notifications"), "allow");
  assert.equal(check("geolocation"), "deny");
});

test("a permission rule's mediaTypes grants a media request only when every type it asks for is named", () => {
  const registry = Registry.make({ owner: "session" });
  registry.install(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      {
        kind: "document",
        url: "https://a.example/page",
        permissions: ["media"],
        mediaTypes: ["audio"],
      },
    ]),
  );
  const check = (mediaTypes: readonly ("audio" | "video")[]) =>
    registry.resolveSync(Decidables.Session.Permission, {
      name: "media",
      origin: null,
      document: "https://a.example/page",
      mediaTypes,
    });
  assert.equal(check(["audio"]), "allow", "the one named type is granted");
  assert.equal(
    check(["audio", "video"]),
    "deny",
    "video is not named, so the whole request misses",
  );
  assert.equal(check(["video"]), "deny");
});

test("a permission rule with no mediaTypes still grants any media request, as it did before the field existed", () => {
  const registry = Registry.make({ owner: "session" });
  registry.install(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "document", url: "https://a.example/page", permissions: ["media"] },
    ]),
  );
  const check = (mediaTypes: readonly ("audio" | "video")[]) =>
    registry.resolveSync(Decidables.Session.Permission, {
      name: "media",
      origin: null,
      document: "https://a.example/page",
      mediaTypes,
    });
  assert.equal(check(["audio"]), "allow");
  assert.equal(check(["audio", "video"]), "allow");
  assert.equal(check([]), "allow");
});

test("mediaTypes beside a rule that does not name media is refused at decode", () => {
  const decode = Schema.decodeUnknownExit(Permission.Rule);
  assert.equal(
    decode({
      kind: "document",
      url: "https://a.example/page",
      permissions: ["notifications"],
      mediaTypes: ["audio"],
    })._tag,
    "Failure",
  );
  assert.equal(
    decode({
      kind: "document",
      url: "https://a.example/page",
      permissions: ["notifications", "media"],
      mediaTypes: ["audio"],
    })._tag,
    "Success",
    "naming media alongside another permission still allows mediaTypes",
  );
});

test("an origin rule grants a device check and a document rule does not", () => {
  const originRegistry = Registry.make({ owner: "session" });
  originRegistry.install(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "origin", origin: "https://origin.example", permissions: ["hid"] },
    ]),
  );
  assert.equal(
    originRegistry.resolveSync(Decidables.Session.Permission, {
      name: "hid",
      origin: "https://origin.example",
      document: null,
      mediaTypes: [],
    }),
    "allow",
    "an origin rule grants a device check",
  );

  // The root document, not a deeper path: a device check's own document key for this origin is
  // "https://origin.example/" (UrlRule.documentKey of the origin URL), the exact key a root-document
  // rule shares. A deeper path's document key could never equal that, so it would leave this test
  // passing even under base's leak — pin the collision that actually happens.
  const documentRegistry = Registry.make({ owner: "session" });
  documentRegistry.install(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "document", url: "https://origin.example/", permissions: ["hid"] },
    ]),
  );
  assert.equal(
    documentRegistry.resolveSync(Decidables.Session.Permission, {
      name: "hid",
      origin: "https://origin.example",
      document: null,
      mediaTypes: [],
    }),
    "deny",
    "a document rule does not grant a device check, whose document is always null",
  );
});

test("a certificate policy does not match a lookalike suffix", async () => {
  const registry = Registry.make({ owner: "session" });
  registry.install(
    Decidables.Session.Certificate,
    Decision.policy(Certificate.Policy, [{ hostname: "*.internal.example", trust: "always" }]),
  );
  const answer = await Effect.runPromise(
    registry.resolveAsync(Decidables.Session.Certificate, {
      hostname: "notinternal.example",
      certificate,
    }),
  );
  assert.equal(answer, "system");
});

test("a navigation policy installs on navigation and on popup", () => {
  const registry = Registry.make({ owner: "contents" });
  const decider = Decision.policy(Navigation.Policy, [
    { kind: "origin", origin: "https://example.com" },
  ]);
  registry.install(Decidables.WebContents.Navigation, decider);
  registry.install(Decidables.WebContents.Popup, decider);
  assert.equal(
    registry.resolveSync(Decidables.WebContents.Navigation, {
      url: "https://example.com/a",
      kind: "navigation",
    }),
    "allow",
  );
  assert.equal(
    registry.resolveSync(Decidables.WebContents.Popup, { url: "https://example.com/b" }),
    "allow",
  );
  assert.equal(
    registry.resolveSync(Decidables.WebContents.Navigation, {
      url: "https://other.example/",
      kind: "navigation",
    }),
    "deny",
  );
});

// Moved from decidables-app.test.ts: the hand-written compile it used has no replacement now that
// Certificate.Policy carries its own. Pins the *.-suffix and lowercasing semantics Certificate.Policy
// guarantees.
test("a certificate policy matches exact and *.-suffix hostnames, case-insensitively", async () => {
  const registry = Registry.make({ owner: "app" });
  registry.install(
    Decidables.App.CertificateError,
    Decision.policy(Certificate.Policy, [
      { hostname: "Exact.example", trust: "always" },
      { hostname: "*.Wild.example", trust: "always" },
    ]),
  );
  const resolve = (hostname: string) =>
    Effect.runPromise(
      registry.resolveAsync(Decidables.App.CertificateError, {
        url: `https://${hostname}/`,
        hostname,
        certificate,
      }),
    );
  assert.equal(await resolve("exact.example"), "trust", "an exact hostname matches");
  assert.equal(await resolve("a.wild.example"), "trust", "a *.-suffix pattern matches a subdomain");
  assert.equal(
    await resolve("wild.example"),
    "trust",
    "a *.-suffix pattern also matches the bare domain",
  );
  assert.equal(
    await resolve("other.example"),
    "reject",
    "a hostname with no matching rule falls back to reject",
  );
});

test("a certificate policy rejects a pinned fingerprint that does not match", async () => {
  const registry = Registry.make({ owner: "session" });
  registry.install(
    Decidables.Session.Certificate,
    Decision.policy(Certificate.Policy, [
      { hostname: "pinned.example", trust: { fingerprint: "AA:BB:CC" } },
    ]),
  );
  const resolve = (fingerprint: string) =>
    Effect.runPromise(
      registry.resolveAsync(Decidables.Session.Certificate, {
        hostname: "pinned.example",
        certificate: { ...certificate, fingerprint },
      }),
    );
  assert.equal(await resolve("AA:BB:CC"), "trust");
  assert.equal(await resolve("00:11:22"), "reject");
});

test("a certificate policy leaves a system rule and an unmatched host to Chromium", async () => {
  // Two registries, because the two decidables have two owners: `Session.Certificate` is a
  // session's and `App.CertificateError` the application's, and a registry now takes one owner's
  // decidables alone. The point of the test is unchanged — one policy value, installed on both.
  const registry = Registry.make({ owner: "session" });
  const application = Registry.make({ owner: "app" });
  registry.install(
    Decidables.Session.Certificate,
    Decision.policy(Certificate.Policy, [{ hostname: "system.example", trust: "system" }]),
  );
  application.install(
    Decidables.App.CertificateError,
    Decision.policy(Certificate.Policy, [{ hostname: "system.example", trust: "system" }]),
  );
  assert.equal(
    await Effect.runPromise(
      registry.resolveAsync(Decidables.Session.Certificate, {
        hostname: "system.example",
        certificate,
      }),
    ),
    "system",
    "a system rule on Session.Certificate leaves Chromium's own verdict",
  );
  assert.equal(
    await Effect.runPromise(
      application.resolveAsync(Decidables.App.CertificateError, {
        url: "https://system.example/",
        hostname: "system.example",
        certificate,
      }),
    ),
    "reject",
    "the same system rule on App.CertificateError falls back to reject, which has no system answer",
  );
  assert.equal(
    await Effect.runPromise(
      registry.resolveAsync(Decidables.Session.Certificate, {
        hostname: "unmatched.example",
        certificate,
      }),
    ),
    "system",
    "an unmatched host also leaves Chromium's own verdict",
  );
});

/**
 * Escapes a control or non-ASCII character in a subtest label so an invisible character, a
 * homoglyph, or a byte-order mark reads as `\uXXXX` instead of vanishing or looking identical to
 * something else in terminal output.
 */
const describePattern = (pattern: string): string =>
  JSON.stringify(pattern).replace(/[\u0000-\u001f\u007f-￿]/gu, (char) => {
    const code = char.codePointAt(0);
    return code === undefined ? char : `\\u${code.toString(16).padStart(4, "0")}`;
  });

// Every pattern here reads as a hostname rule but names no host a decider could ever see, or
// names something other than what it reads as — so a fingerprint pin on it contributes nothing:
// Chromium's ordinary verdict stands and the author believes the host is pinned. Combines every
// refused pattern from task-6b-fix-3-probe.ts and task-6b-fix-3-shipped-holes.ts.
const malformedHostnamePatterns: ReadonlyArray<readonly [string, string]> = [
  ["*.", "bare wildcard, no suffix"],
  ["*", "lone star"],
  [".", "lone dot"],
  ["*..", "empty label after a wildcard"],
  ["a..b", "empty label"],
  ["*.*.x", "inner wildcard"],
  ["x*", "trailing star"],
  ["*x.example", "glued star"],
  [" a.example", "leading space"],
  ["a.example ", "trailing space"],
  ["", "empty"],
  ["exa​mple.com", "zero-width space"],
  ["exa‌mple.com", "zero-width non-joiner"],
  ["exa‍mple.com", "zero-width joiner"],
  ["exa­mple.com", "soft hyphen"],
  ["﻿example.com", "byte-order mark"],
  ["a .example", "non-breaking space"],
  ["a\t.example", "tab"],
  ["example.com:443", "a port"],
  ["*.example.com:8443", "a wildcard with a port"],
  ["https://example.com", "a URL, not a hostname"],
  ["user@example.com", "userinfo"],
  ["example.com/", "a path"],
  ["example.com?", "a query"],
  ["example.com#", "a fragment"],
  ["bücher.example", "Unicode: Chromium reports punycode, so this never matches"],
  ["example。com", "an ideographic full stop in place of a dot"],
  ["exаmple.com", 'a Cyrillic homoglyph for "a"'],
  ["*.168.1.1", "a wildcard over an IPv4 address"],
  ["*.1", "a wildcard whose suffix canonicalizes to an address"],
  ["[::1]:443", "an IPv6 literal with a port"],
  ["[]", "empty brackets"],
  ["[zz]", "non-hex brackets"],
  ["*.[::1]", "a wildcard over an IPv6 literal"],
  ["*.1.0x7f", "a wildcard whose suffix canonicalizes to an address, hex-ish spelling"],
  ["[:]", "a malformed IPv6 literal"],
  ["[....]", "a malformed IPv6 literal"],
  ["[1.2.3.4]", "an IPv4 address in brackets, not IPv6"],
  ["[::1", "an unterminated bracket"],
  ["foo.123", "a final label the host parser treats as an IPv4 candidate"],
];

test("a certificate policy refuses a malformed hostname pattern", async (t) => {
  for (const [hostname, why] of malformedHostnamePatterns) {
    await t.test(`${describePattern(hostname)} — ${why}`, () => {
      assert.throws(() => Decision.policy(Certificate.Policy, [{ hostname, trust: "always" }]));
    });
  }
});

/**
 * The probe's accepted list, each paired with the hosts a decider must report for a decider to
 * see it as matched — canonical spellings the WHATWG host parser itself produces from a
 * non-canonical one (`192.168.01.1`, `0xC0.0xA8.1.1`, an uncompressed IPv6 literal), so accepting
 * a pattern and matching the real event hostnames it names are proven from the same list.
 * `bücher.example` is deliberately not here: Chromium reports hosts in punycode, so a Unicode
 * pattern never matches and belongs on the refused list instead — see the "Unicode" subtest above.
 */
const certificateCases: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["example.com", ["example.com", "example.com."]],
  ["EXAMPLE.com.", ["example.com", "example.com."]],
  ["*.internal.example", ["internal.example", "api.internal.example", "a.b.internal.example."]],
  ["xn--bcher-kva.example", ["xn--bcher-kva.example"]],
  ["my_host.internal", ["my_host.internal"]],
  ["localhost", ["localhost"]],
  ["192.168.1.1", ["192.168.1.1"]],
  ["192.168.01.1", ["192.168.1.1"]],
  ["0xC0.0xA8.1.1", ["192.168.1.1"]],
  ["[::1]", ["::1", "[::1]"]],
  ["[2001:db8:0:0:0:0:0:1]", ["2001:db8::1", "[2001:db8::1]"]],
  ["[2001:DB8::1]", ["2001:db8::1"]],
  ["[::ffff:192.0.2.1]", ["::ffff:c000:201", "[::ffff:c000:201]"]],
];

test("a certificate policy accepts every well-formed hostname pattern", async (t) => {
  // An over-eager check would silently break a legitimate rule — IDN in its punycode form, an IP
  // or IPv6 literal (canonical or not), and the FQDN trailing dot all have to keep working.
  for (const [hostname] of certificateCases) {
    await t.test(describePattern(hostname), () => {
      try {
        Decision.policy(Certificate.Policy, [{ hostname, trust: "always" }]);
      } catch (cause) {
        assert.fail(`expected ${describePattern(hostname)} to be accepted: ${String(cause)}`);
      }
    });
  }
});

test("an accepted hostname pattern matches the host it names in every form it arrives", async (t) => {
  const addTrailingDot = (host: string) => (host.endsWith(".") ? host : `${host}.`);
  for (const [pattern, must] of certificateCases) {
    await t.test(describePattern(pattern), () => {
      const decide = Certificate.Policy.compile([{ hostname: pattern, trust: "always" }]);
      // Canonical, upper-case, and trailing-dot forms; a bracketed/unbracketed IPv6 host already
      // appears in `must` itself where it applies.
      const forms = [
        ...must,
        ...must.map((host) => host.toUpperCase()),
        ...must.map(addTrailingDot),
      ];
      for (const host of forms) {
        assert.equal(
          decide({ hostname: host, certificate }),
          "trust",
          `expected ${describePattern(pattern)} to match ${JSON.stringify(host)}`,
        );
      }
      const plainHost = must[0];
      if (plainHost !== undefined) {
        for (const lookalike of [`not${plainHost}`, `${plainHost}.evil.test`, ""]) {
          assert.notEqual(
            decide({ hostname: lookalike, certificate }),
            "trust",
            `expected ${describePattern(pattern)} not to match lookalike ${JSON.stringify(lookalike)}`,
          );
        }
      }
    });
  }
});

test("a pinned host is still pinned when requested with a trailing dot", async () => {
  // At base, and until this fix, a request to "example.com." missed a rule for "example.com", so
  // the pin contributed nothing and Chromium's ordinary verdict stood — a pin bypass by appending
  // a dot. Both sides now drop one trailing dot before comparing.
  const registry = Registry.make({ owner: "session" });
  registry.install(
    Decidables.Session.Certificate,
    Decision.policy(Certificate.Policy, [
      { hostname: "example.com", trust: { fingerprint: "AA:BB:CC" } },
    ]),
  );
  const answer = await Effect.runPromise(
    registry.resolveAsync(Decidables.Session.Certificate, {
      hostname: "example.com.",
      certificate: { ...certificate, fingerprint: "00:11:22" },
    }),
  );
  assert.equal(answer, "reject");
});

test("a wildcard over an address is refused", () => {
  assert.throws(() =>
    Decision.policy(Certificate.Policy, [{ hostname: "*.168.1.1", trust: "always" }]),
  );
});

test("a certificate policy passes on an empty hostname", () => {
  // What App.CertificateError's event carries for a URL Chromium could not parse. Passes ahead
  // of matching any rule, whatever rules are installed.
  const decide = Certificate.Policy.compile([{ hostname: "example.com", trust: "always" }]);
  assert.equal(decide({ hostname: "", certificate }), Decision.Pass);
});

test("a bracketed event hostname is not the host it brackets", () => {
  // A pattern is validated at decode; an *event's* hostname is not, and the normalization both go
  // through used to strip brackets from anything. `[example.com]` therefore matched a rule for
  // `example.com` — a host no parser produces, given a trust nobody wrote a rule for. Only an
  // IPv6-shaped literal is unbracketed now.
  const decide = Certificate.Policy.compile([{ hostname: "example.com", trust: "always" }]);
  assert.equal(decide({ hostname: "[example.com]", certificate }), Decision.Pass);
  // The IPv6 form still normalizes both ways, which is why the strip exists at all.
  const loopback = Certificate.Policy.compile([{ hostname: "[::1]", trust: "always" }]);
  assert.equal(loopback({ hostname: "[::1]", certificate }), "trust");
  assert.equal(loopback({ hostname: "::1", certificate }), "trust");
});

test("a certificate policy refuses a hostname no DNS name could be", async (t) => {
  // The WHATWG host parser applies no length bound, so these canonicalize cleanly and can never
  // match a host a decider sees. A grant that matches nothing is inert; a *pin* that matches
  // nothing fails open, which is the asymmetry every other refusal here exists for.
  const label = "a".repeat(63);
  const cases = [
    [`${"a".repeat(64)}.example`, "a label longer than 63 octets"],
    [`${label}.${label}.${label}.${label}.example`, "a name longer than 253 octets"],
  ] as const;
  for (const [hostname, why] of cases)
    await t.test(why, () => {
      assert.throws(() => Decision.policy(Certificate.Policy, [{ hostname, trust: "always" }]));
    });
});

test("a policy refuses rule data its schema rejects", () => {
  assert.throws(() => Decision.policy(Certificate.Policy, [{ hostname: "", trust: "always" }]));
});

test("a policy refuses a non-canonical origin", () => {
  assert.throws(() =>
    Decision.policy(Permission.Policy, [
      { kind: "origin", origin: "https://example.com/", permissions: ["notifications"] },
    ]),
  );
});
