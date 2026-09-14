import assert from "node:assert/strict";
import { test } from "node:test";
import * as StandardSchemes from "../src/internal/StandardSchemes.ts";
import * as UrlRule from "../src/UrlRule.ts";

test("rules for an unregistered custom scheme are rejected as opaque", () => {
  assert.throws(
    () => UrlRule.compile({ kind: "origin", origin: "sewed-unregistered://app" }),
    /canonical non-opaque origin/,
  );
  assert.throws(
    () => UrlRule.compile({ kind: "document", url: "sewed-unregistered://app/" }),
    /document rule requires/,
  );
});

test("a registered standard scheme has a host origin that origin and document rules can name", () => {
  StandardSchemes.register(["sewed-standard"]);
  assert.equal(
    UrlRule.originOf(new URL("sewed-standard://app/settings?tab=1")),
    "sewed-standard://app",
  );
  const origin = UrlRule.compile({ kind: "origin", origin: "sewed-standard://app" });
  assert.equal(origin(new URL("sewed-standard://app/settings")), true);
  assert.equal(origin(new URL("sewed-standard://other/")), false);
  const document = UrlRule.compile({ kind: "document", url: "sewed-standard://app/" });
  assert.equal(document(new URL("sewed-standard://app/#section")), true);
  assert.equal(document(new URL("sewed-standard://app/other")), false);
});

test("an origin rule for a registered scheme must still be canonical", () => {
  StandardSchemes.register(["sewed-canonical"]);
  assert.throws(
    () => UrlRule.compile({ kind: "origin", origin: "sewed-canonical://app/path" }),
    /canonical/,
  );
});

test("web origins keep their standard origin", () => {
  assert.equal(UrlRule.originOf(new URL("http://127.0.0.1:4100/path")), "http://127.0.0.1:4100");
  const origin = UrlRule.compile({ kind: "origin", origin: "https://example.com" });
  assert.equal(origin(new URL("https://example.com/a")), true);
  assert.equal(origin(new URL("https://example.com.evil.test/")), false);
});
