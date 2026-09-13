import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { Certificate, Cookie, Proxy, WebRequest } from "sewed";

const matches = (pattern: string, url: string) => WebRequest.compilePattern(pattern)(new URL(url));

test("match patterns follow Chromium's scheme, host, port, and path rules", () => {
  assert.equal(matches("<all_urls>", "ftp://x/y"), true);
  assert.equal(matches("*://example.com/*", "https://example.com/"), true);
  assert.equal(matches("*://example.com/*", "ftp://example.com/"), false);
  assert.equal(matches("https://*.example.com/api/*", "https://api.example.com/api/v1"), true);
  assert.equal(matches("https://*.example.com/api/*", "https://example.com/api/"), true);
  assert.equal(matches("https://*.example.com/api/*", "https://example.org/api/"), false);
  assert.equal(matches("https://*.example.com/api/*", "https://api.example.com/other"), false);
  assert.equal(matches("http://127.0.0.1:8080/*", "http://127.0.0.1:8080/x"), true);
  assert.equal(matches("http://127.0.0.1:8080/*", "http://127.0.0.1:9090/x"), false);
  assert.equal(matches("http://127.0.0.1:*/*", "http://127.0.0.1:9090/x"), true);
  assert.equal(matches("file:///*", "file:///home/x.txt"), true);
  assert.equal(matches("https://example.com/a?*", "https://example.com/a?b=1"), true);
  assert.throws(() => WebRequest.compilePattern("example.com/*"));
  assert.throws(() => WebRequest.compilePattern("https://"));
  assert.throws(() => WebRequest.compilePattern("https://example.com"));
});

test("request filters and decisions validate at the boundary", () => {
  const filter = Schema.decodeUnknownExit(WebRequest.Filter);
  assert.equal(filter({ urls: ["<all_urls>"] })._tag, "Success");
  assert.equal(filter({ urls: [] })._tag, "Failure");
  assert.equal(filter({ urls: ["nope"] })._tag, "Failure");
  assert.equal(filter({ urls: ["<all_urls>"], types: ["other"] })._tag, "Success");
  const decision = Schema.decodeUnknownExit(WebRequest.RequestDecision);
  assert.equal(decision({ kind: "redirect", url: "https://x" })._tag, "Success");
  assert.equal(decision({ kind: "rewrite" })._tag, "Failure");
});

test("request events carry their stage and the request fields", () => {
  const decode = Schema.decodeUnknownExit(WebRequest.Event);
  const base = {
    id: 1,
    url: "https://example.com/",
    method: "GET",
    resourceType: "xhr",
    referrer: "",
    timestamp: 0,
  };
  assert.equal(decode({ ...base, stage: "sent", headers: { a: "b" } })._tag, "Success");
  assert.equal(
    decode({ ...base, stage: "completed", statusCode: 200, statusLine: "OK", fromCache: false })
      ._tag,
    "Success",
  );
  assert.equal(decode({ ...base, stage: "started" })._tag, "Failure");
});

test("session policies keep their closed sets", () => {
  const proxy = Schema.decodeUnknownExit(Proxy.Config);
  assert.equal(proxy({ mode: "direct" })._tag, "Success");
  assert.equal(proxy({ mode: "fixed_servers", proxyRules: "" })._tag, "Failure");
  const certificates = Schema.decodeUnknownExit(Certificate.Policy);
  assert.equal(certificates([{ hostname: "a.example", trust: "always" }])._tag, "Success");
  assert.equal(certificates([{ hostname: "", trust: "always" }])._tag, "Failure");
  const cookies = Schema.decodeUnknownExit(Cookie.Policy);
  assert.equal(cookies([{ kind: "origin", origin: "https://example.com" }])._tag, "Success");
  assert.equal(cookies([{ kind: "document", url: "https://example.com/a" }])._tag, "Failure");
  const tags = [...Cookie.protocol.requests.keys()].sort();
  assert.deepEqual(tags, ["changes", "flush", "get", "remove", "set"]);
});
