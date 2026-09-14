import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import * as ShellPolicy from "../src/internal/ShellPolicy.ts";
import * as Shell from "../src/Shell.ts";

test("the shell policy accepts one exact mailto address and rejects lists and bare names", () => {
  const decode = Schema.decodeUnknownExit(Shell.Policy);
  assert.equal(decode([{ kind: "mailto", address: "support@jobwright.io" }])._tag, "Success");
  assert.equal(decode([{ kind: "mailto", address: "support" }])._tag, "Failure");
  assert.equal(
    decode([{ kind: "mailto", address: "a@example.com,b@example.com" }])._tag,
    "Failure",
  );
  assert.equal(decode([{ kind: "mailto", address: "a@b@example.com" }])._tag, "Failure");
});

test("a mailto rule allows one exact recipient with a subject or body and nothing else", () => {
  const allows = ShellPolicy.compile([
    { kind: "mailto", address: "support@jobwright.io" },
    { kind: "origin", origin: "https://jobwright.io" },
  ]);
  assert.equal(allows(new URL("mailto:Support@Jobwright.io?subject=Crash%20report&body=Hi")), true);
  assert.equal(allows(new URL("mailto:support%40jobwright.io")), true);
  assert.equal(allows(new URL("mailto:support@jobwright.io,other@example.com")), false);
  assert.equal(allows(new URL("mailto:other@example.com")), false);
  assert.equal(allows(new URL("mailto:?to=support@jobwright.io")), false);
  assert.equal(allows(new URL("mailto:support@jobwright.io?cc=other@example.com")), false);
  assert.equal(allows(new URL("mailto:support@jobwright.io?BCC=other@example.com")), false);
  assert.equal(allows(new URL("mailto:support@jobwright.io?to=other@example.com")), false);
  assert.equal(allows(new URL("https://jobwright.io/help")), true);
  assert.equal(allows(new URL("https://example.com/")), false);
});
