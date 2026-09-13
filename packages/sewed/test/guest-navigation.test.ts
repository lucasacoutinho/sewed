import assert from "node:assert/strict";
import { test } from "node:test";
import { SewedError } from "../src/SewedError.ts";
import type { Blocked } from "../src/GuestView.ts";
import * as GuestNavigation from "../src/internal/GuestNavigation.ts";

const protocolFailure = (error: unknown) =>
  error instanceof SewedError && error.code === "Protocol";

test("a pattern policy allows matching URLs and nothing when empty", () => {
  const policy = GuestNavigation.make(["https://*.example.com/*"]);
  assert.equal(policy.allows(new URL("https://jobs.example.com/apply")), true);
  assert.equal(policy.allows(new URL("http://jobs.example.com/apply")), false);
  policy.replace([]);
  assert.equal(policy.allows(new URL("https://jobs.example.com/apply")), false);
});

test("an invalid replacement fails Protocol and leaves the current rules", () => {
  const policy = GuestNavigation.make(["https://a/*"]);
  assert.throws(() => policy.replace(["nope"]), protocolFailure);
  assert.equal(policy.allows(new URL("https://a/x")), true);
  assert.throws(() => GuestNavigation.make(["example.com"]), protocolFailure);
});

test("check returns the parsed URL or fails Protocol", () => {
  const policy = GuestNavigation.make(["http://localhost:*/*"]);
  assert.equal(policy.check("http://localhost:4000/a").pathname, "/a");
  assert.throws(() => policy.check("https://other/"), protocolFailure);
  assert.throws(() => policy.check("https://other/"), /outside/);
  assert.throws(() => policy.check("not a url"), /Invalid/);
});

test("the guard reports what the core prevents", () => {
  const blocked: Blocked[] = [];
  const policy = GuestNavigation.make(["https://a/*"]);
  const guard = GuestNavigation.guard(policy, (value) => blocked.push(value));
  assert.equal(guard.allows(new URL("https://a/")), true);
  assert.equal(guard.allows(new URL("https://b/")), false);
  guard.blocked?.("redirect", "https://b/");
  guard.blocked?.("popup", "https://c/");
  assert.deepEqual(blocked, [
    { kind: "redirect", url: "https://b/" },
    { kind: "popup", url: "https://c/" },
  ]);
});
