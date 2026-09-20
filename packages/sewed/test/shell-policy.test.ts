import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Schema } from "effect";
import { SewedError } from "../src/SewedError.ts";
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

test("a match pattern grants every http and https URL, ports and IP literals included, and nothing else", () => {
  const allows = ShellPolicy.compile(["*://*/*"]);
  for (const url of [
    "https://jobs.example/listing?id=1",
    "http://example.com/",
    "https://example.com:8443/x",
    "http://127.0.0.1:4100/",
    "https://[::1]/",
  ])
    assert.equal(allows(new URL(url)), true, url);
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,x",
    "mailto:a@b.c",
    "ftp://example.com/",
  ])
    assert.equal(allows(new URL(url)), false, url);
});

test("the shell refuses a pattern that grants a scheme the OS should not get", () => {
  for (const pattern of ["<all_urls>", "javascript://x/*", "data://x/*", "ftp://*/*"])
    assert.throws(() => ShellPolicy.compile([pattern]), TypeError, pattern);
  assert.doesNotThrow(() => ShellPolicy.compile(["file:///tmp/*", "https://*.example.com/*"]));
});

test("openExternal refuses a URL carrying credentials whatever the rule", async () => {
  const calls: string[] = [];
  const core: ShellPolicy.Core<never> = {
    openExternal: (href) =>
      Effect.sync(() => {
        calls.push(href);
      }),
    openPath: () => Effect.succeed({ opened: true, message: "" }),
    showItemInFolder: () => Effect.void,
    trashItem: () => Effect.void,
    beep: Effect.void,
  };
  const operations = await Effect.runPromise(
    ShellPolicy.operations(
      { policy: ["*://*/*", { kind: "origin", origin: "https://example.com" }] },
      core,
    ),
  );
  for (const url of ["https://user:pass@example.com/", "https://example.com@evil.example/"]) {
    const exit = await Effect.runPromiseExit(operations.openExternal(url));
    assert.equal(exit._tag, "Failure", url);
    if (exit._tag === "Failure") {
      const error = Cause.squash(exit.cause);
      assert.ok(error instanceof SewedError, url);
      assert.equal(error.code, "Protocol", url);
      assert.match(error.message, /credentials/, url);
    }
  }
  assert.deepEqual(calls, []);
});
