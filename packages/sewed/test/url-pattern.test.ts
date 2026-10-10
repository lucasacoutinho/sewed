import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import * as WebRequest from "../src/WebRequest.ts";

for (const [scheme, port] of [
  ["http", 80],
  ["https", 443],
  ["ftp", 21],
  ["ws", 80],
  ["wss", 443],
] as const) {
  test(`an explicit ${scheme} default port matches its canonical URL and rejects another port`, () => {
    const matches = WebRequest.compilePattern(`${scheme}://example.com:${port}/*`);
    assert.equal(matches(new URL(`${scheme}://example.com/path`)), true);
    assert.equal(matches(new URL(`${scheme}://example.com:${port}/path`)), true);
    assert.equal(matches(new URL(`${scheme}://example.com:9010/path`)), false);
  });
}

test("a wildcard scheme still restricts an explicit port across HTTP and HTTPS", () => {
  const matches = WebRequest.compilePattern("*://example.com:443/*");
  assert.equal(matches(new URL("https://example.com/")), true);
  assert.equal(matches(new URL("http://example.com:443/")), true);
  assert.equal(matches(new URL("http://example.com/")), false);
  assert.equal(matches(new URL("https://example.com:8443/")), false);
});

test("numeric pattern ports and URL ports use the same canonical spelling", () => {
  const matches = WebRequest.compilePattern("http://example.com:00080/*");
  assert.equal(matches(new URL("http://example.com/")), true);
  assert.equal(matches(new URL("http://example.com:00080/")), true);
  assert.equal(matches(new URL("http://example.com:8080/")), false);
});

test("out-of-range pattern ports fail before a policy or request filter is installed", () => {
  for (const pattern of ["https://example.com:65536/*", "http://example.com:99999/*"]) {
    assert.throws(() => WebRequest.compilePattern(pattern), /port/);
    assert.equal(Schema.decodeExit(WebRequest.Pattern)(pattern)._tag, "Failure");
  }
});

test("an explicit nondefault port retains exact matching at the valid endpoints", () => {
  for (const port of [0, 65535]) {
    const matches = WebRequest.compilePattern(`http://example.com:${port}/*`);
    assert.equal(matches(new URL(`http://example.com:${port}/`)), true);
    assert.equal(matches(new URL("http://example.com/")), false);
  }
});
