import assert from "node:assert/strict";
import { test } from "node:test";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Schema } from "effect";
import * as Binding from "../src/PublicBinding.ts";
import * as Renderer from "../src/Renderer.ts";
import { SewedError } from "../src/SewedError.ts";

const Protocol = RpcGroup.make(Rpc.make("ping", { success: Schema.Boolean }));
const CrashScreen = Binding.slot("renderer-test/crash-screen", Protocol);

test("local resolves the given path against importMetaUrl to a file: URL, carrying its bindings", () => {
  const document = Renderer.local("crash/index.html", "file:///app/lib/main.js", {
    bindings: [CrashScreen],
  });
  assert.equal(document.url.href, "file:///app/lib/crash/index.html");
  assert.deepEqual(document.bindings, [CrashScreen]);
});

test("local declares no bindings when none are given", () => {
  const document = Renderer.local("documents/local.html", "file:///app/lib/main.js");
  assert.equal(document.url.href, "file:///app/lib/documents/local.html");
  assert.deepEqual(document.bindings, []);
});

test("inline base64-encodes the given HTML into a data: URL with no bindings", () => {
  const html = "<!doctype html><title>Sewed stopped</title>";
  const document = Renderer.inline(html);
  assert.equal(
    document.url.href,
    `data:text/html;base64,${Buffer.from(html, "utf8").toString("base64")}`,
  );
  assert.deepEqual(document.bindings, []);
});

test("inline refuses an empty string with Protocol", () => {
  assert.throws(
    () => Renderer.inline(""),
    (error: unknown) => {
      assert.ok(error instanceof SewedError);
      assert.equal(error.code, "Protocol");
      return true;
    },
  );
});
