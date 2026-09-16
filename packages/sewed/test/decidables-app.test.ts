import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
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

test("the last-window fallback follows the platform", () => {
  assert.equal(
    Decidables.App.LastWindowClosed.fallback,
    process.platform === "darwin" ? "stay" : "quit",
  );
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
