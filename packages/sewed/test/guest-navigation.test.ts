import assert from "node:assert/strict";
import { test } from "node:test";
import { SewedError } from "../src/SewedError.ts";
import * as GuestNavigation from "../src/internal/GuestNavigation.ts";

const protocolFailure = (error: unknown) =>
  error instanceof SewedError && error.code === "Protocol";

test("a pattern policy allows matching URLs, and an empty policy allows nothing", () => {
  const policy = GuestNavigation.make(["https://*.example.com/*"]);
  assert.equal(policy.allows(new URL("https://jobs.example.com/apply")), true);
  assert.equal(policy.allows(new URL("http://jobs.example.com/apply")), false);
  const empty = GuestNavigation.make([]);
  assert.equal(empty.allows(new URL("https://jobs.example.com/apply")), false);
});

test("a rule policy allows matching URLs too, since the two navigation shapes now merge into one policy", () => {
  const policy = GuestNavigation.make([{ kind: "document", url: "https://example.com/apply" }]);
  assert.equal(policy.allows(new URL("https://example.com/apply")), true);
  assert.equal(policy.allows(new URL("https://example.com/other")), false);
});

test("an invalid initial policy fails Protocol, whichever rule shape is malformed", () => {
  assert.throws(() => GuestNavigation.make(["example.com"]), protocolFailure);
  assert.throws(
    () => GuestNavigation.make([{ kind: "document", url: "not a url" }]),
    protocolFailure,
  );
});

test("check returns the parsed URL or fails Protocol", () => {
  const policy = GuestNavigation.make(["http://localhost:*/*"]);
  assert.equal(policy.check("http://localhost:4000/a").pathname, "/a");
  assert.throws(() => policy.check("https://other/"), protocolFailure);
  assert.throws(() => policy.check("https://other/"), /outside/);
  assert.throws(() => policy.check("not a url"), /Invalid/);
});
