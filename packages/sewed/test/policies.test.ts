import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import * as Certificate from "../src/Certificate.ts";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Navigation from "../src/Navigation.ts";
import * as Permission from "../src/Permission.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

const certificate = { fingerprint: "AA:BB:CC" };

test("two permission policies each grant their own document", () => {
  const registry = Registry.make();
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
    });
  assert.equal(check("https://a.example/page"), "allow");
  assert.equal(check("https://b.example/page"), "allow");
  assert.equal(check("https://c.example/page"), "deny");
});

test("a permission policy grants only the permissions its rule names", () => {
  const registry = Registry.make();
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
    });
  assert.equal(check("notifications"), "allow");
  assert.equal(check("geolocation"), "deny");
});

test("an origin rule grants a device check and a document rule does not", () => {
  const originRegistry = Registry.make();
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
    }),
    "allow",
    "an origin rule grants a device check",
  );

  // The root document, not a deeper path: a device check's own document key for this origin is
  // "https://origin.example/" (UrlRule.documentKey of the origin URL), the exact key a root-document
  // rule shares. A deeper path's document key could never equal that, so it would leave this test
  // passing even under base's leak — pin the collision that actually happens.
  const documentRegistry = Registry.make();
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
    }),
    "deny",
    "a document rule does not grant a device check, whose document is always null",
  );
});

test("a certificate policy does not match a lookalike suffix", async () => {
  const registry = Registry.make();
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
  const registry = Registry.make();
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
  const registry = Registry.make();
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
  const registry = Registry.make();
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
        certificate: { fingerprint },
      }),
    );
  assert.equal(await resolve("AA:BB:CC"), "trust");
  assert.equal(await resolve("00:11:22"), "reject");
});

test("a certificate policy leaves a system rule and an unmatched host to Chromium", async () => {
  const registry = Registry.make();
  registry.install(
    Decidables.Session.Certificate,
    Decision.policy(Certificate.Policy, [{ hostname: "system.example", trust: "system" }]),
  );
  registry.install(
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
      registry.resolveAsync(Decidables.App.CertificateError, {
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

test("a certificate policy refuses a malformed hostname pattern", () => {
  // Every pattern here reads as a hostname rule but matches nothing, or something other than
  // what it reads as: "*.." and "." match the literal host ".", "*" is an exact rule that matches
  // no real host, "a..b"/"*.*.x"/"x*"/"*x.example" match nothing at all, and a pasted leading or
  // trailing space matters most — a fingerprint pin on a pattern that never matches contributes
  // nothing, so Chromium's ordinary verdict stands while the author believes the host is pinned.
  const refused = [
    "*.",
    "*..",
    ".",
    "*",
    "a..b",
    "*.*.x",
    "x*",
    "*x.example",
    " a.example",
    "a.example ",
    "",
  ];
  for (const hostname of refused) {
    let threw = false;
    try {
      Decision.policy(Certificate.Policy, [{ hostname, trust: "always" }]);
    } catch {
      threw = true;
    }
    assert.equal(threw, true, `expected ${JSON.stringify(hostname)} to be refused`);
  }
});

test("a certificate policy accepts every well-formed hostname pattern", () => {
  // An over-eager check would silently break a legitimate rule — IDN, punycode, an IP or IPv6
  // literal, and the FQDN trailing dot all have to keep working.
  const accepted = [
    "example.com",
    "*.internal.example",
    "EXAMPLE.com",
    "example.com.",
    "*.example.com.",
    "192.168.1.1",
    "localhost",
    "xn--bcher-kva.example",
    "bücher.example",
    "[::1]",
    "a-b.example",
  ];
  for (const hostname of accepted) {
    try {
      Decision.policy(Certificate.Policy, [{ hostname, trust: "always" }]);
    } catch (cause) {
      assert.fail(`expected ${JSON.stringify(hostname)} to be accepted: ${String(cause)}`);
    }
  }
});

test("a certificate policy passes on an empty hostname", () => {
  // Bypasses Certificate.Rule's own schema refusal of a bare "*." pattern (calling compile
  // directly, not through Decision.policy, so nothing decodes this rule list) to prove the
  // compiled decider's own guard — not just the schema — is what keeps an empty hostname, what
  // App.CertificateError's event carries for an unparseable URL, from matching it.
  const decide = Certificate.Policy.compile([{ hostname: "*.", trust: "always" }]);
  assert.equal(decide({ hostname: "", certificate }), Decision.Pass);
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
