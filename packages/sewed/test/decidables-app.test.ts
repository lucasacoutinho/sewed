import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Redacted } from "effect";
import * as Certificate from "../src/Certificate.ts";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

test("two quit deciders both run and a denial is not widened by a later allow", async () => {
  const registry = Registry.make();
  registry.install(
    Decidables.App.Quit,
    Decision.async(() => Effect.succeed("allow")),
  );
  registry.install(
    Decidables.App.Quit,
    Decision.async(() => Effect.succeed("deny")),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(Decidables.App.Quit, {}));
  assert.equal(answer, "deny");
});

// Stubs process.platform and re-imports Decidables.ts under a cache-busting query so the module body
// (which reads process.platform once, at load) re-evaluates against the stub. This is what closes the
// blind spot the first report disclosed: a bare comparison against this process's own platform cannot
// tell "the real ternary" apart from a hardcoded constant that happens to match this OS, but exercising
// both branches on one machine can.
const loadLastWindowClosedFallback = async (platform: string) => {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    const module = await import(`../src/Decidables.ts?platform=${platform}`);
    return module.App.LastWindowClosed.fallback;
  } finally {
    if (original !== undefined) Object.defineProperty(process, "platform", original);
  }
};

test("the last-window fallback follows the platform on both branches", async () => {
  assert.equal(await loadLastWindowClosedFallback("darwin"), "stay");
  assert.equal(await loadLastWindowClosedFallback("linux"), "quit");
  assert.equal(await loadLastWindowClosedFallback("win32"), "quit");
});

test("a login decider that fails cancels its challenge and logs", async () => {
  const registry = Registry.make();
  registry.install(
    Decidables.App.Login,
    Decision.async(() => Effect.die(new Error("login decider boom"))),
  );
  const challenge = {
    url: "https://example.com/",
    isProxy: false,
    scheme: "basic",
    host: "example.com",
    port: 443,
    realm: "Members",
    isRequestForNavigation: true,
  };
  const answer = await Effect.runPromise(registry.resolveAsync(Decidables.App.Login, challenge));
  assert.deepEqual(answer, { kind: "cancel" });
});

// The only other login test covers the failure path, where the answer happens to be {kind:"cancel"} —
// the same value Schema.Redacted rejecting the password would also produce. Nothing before this test
// ever decoded a successful credentials answer, so a regression in that round-trip (resolveCore's
// decodeAnswer, or Schema.Redacted itself no longer accepting an already-Redacted value) would leave
// every login silently cancelled with the whole suite still green.
test("a credentials answer survives resolution with its password still redacted", async () => {
  const registry = Registry.make();
  registry.install(
    Decidables.App.Login,
    Decision.async(() =>
      Effect.succeed({
        kind: "credentials",
        username: "sewed",
        password: Redacted.make("hunter2"),
      }),
    ),
  );
  const challenge = {
    url: "https://example.com/",
    isProxy: false,
    scheme: "basic",
    host: "example.com",
    port: 443,
    realm: "Members",
    isRequestForNavigation: true,
  };
  const answer = await Effect.runPromise(registry.resolveAsync(Decidables.App.Login, challenge));
  assert.equal(answer.kind, "credentials");
  if (answer.kind === "credentials") {
    assert.equal(Redacted.value(answer.password), "hunter2");
    // The redaction itself, not just the round-trip: the value is not the plaintext on its own face.
    assert.notEqual(String(answer.password), "hunter2");
  }
});

test("a certificate decider that rejects is not widened by one that trusts", async () => {
  const registry = Registry.make();
  const certificate = {
    fingerprint: "AA:BB:CC",
    subjectName: "example.com",
    issuerName: "Example CA",
    validStart: 0,
    validExpiry: 1_000_000,
  };
  registry.install(
    Decidables.App.CertificateError,
    Decision.async(() => Effect.succeed("trust")),
  );
  registry.install(
    Decidables.App.CertificateError,
    Decision.async(() => Effect.succeed("reject")),
  );
  const answer = await Effect.runPromise(
    registry.resolveAsync(Decidables.App.CertificateError, {
      url: "https://example.com/",
      certificate,
    }),
  );
  assert.equal(answer, "reject");
});

// The migration path fix round 1's review found missing: the hostname matcher App.ts used to run
// inline, now expressible only as a consumer-compiled Decision.policy(Certificate.Policy, ...)
// decider. Pins the *.-suffix and lowercasing semantics the old certificateErrors option guaranteed.
const compileCertificatePolicy =
  (rules: Certificate.Policy) =>
  (event: { readonly url: string; readonly certificate: Certificate.Presented }) => {
    const hostname = URL.parse(event.url)?.hostname.toLowerCase();
    if (hostname === undefined) return Decision.Pass;
    const rule = rules.find(({ hostname: pattern }) => {
      const value = pattern.toLowerCase();
      return value.startsWith("*.")
        ? hostname === value.slice(2) || hostname.endsWith(value.slice(1))
        : hostname === value;
    });
    if (rule === undefined || rule.trust === "system") return Decision.Pass;
    return rule.trust === "always" || event.certificate.fingerprint === rule.trust.fingerprint
      ? "trust"
      : "reject";
  };

test("a certificate policy compiled via Decision.policy matches exact and *.-suffix hostnames, case-insensitively", async () => {
  const registry = Registry.make();
  registry.install(
    Decidables.App.CertificateError,
    Decision.policy(
      Certificate.Policy,
      [
        { hostname: "Exact.example", trust: "always" },
        { hostname: "*.Wild.example", trust: "always" },
      ],
      compileCertificatePolicy,
    ),
  );
  const certificate = {
    fingerprint: "AA:BB:CC",
    subjectName: "example.com",
    issuerName: "Example CA",
    validStart: 0,
    validExpiry: 1_000_000,
  };
  const resolve = (url: string) =>
    Effect.runPromise(registry.resolveAsync(Decidables.App.CertificateError, { url, certificate }));
  assert.equal(await resolve("https://exact.example/"), "trust", "an exact hostname matches");
  assert.equal(
    await resolve("https://a.wild.example/"),
    "trust",
    "a *.-suffix pattern matches a subdomain",
  );
  assert.equal(
    await resolve("https://wild.example/"),
    "trust",
    "a *.-suffix pattern also matches the bare domain",
  );
  assert.equal(
    await resolve("https://other.example/"),
    "reject",
    "a hostname with no matching rule falls back to reject",
  );
});

test("with no certificate decider installed, Chromium's rejection stands", async () => {
  const registry = Registry.make();
  const certificate = {
    fingerprint: "AA:BB:CC",
    subjectName: "example.com",
    issuerName: "Example CA",
    validStart: 0,
    validExpiry: 1_000_000,
  };
  const answer = await Effect.runPromise(
    registry.resolveAsync(Decidables.App.CertificateError, {
      url: "https://example.com/",
      certificate,
    }),
  );
  assert.equal(answer, "reject");
});
