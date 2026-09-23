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

test("local refuses a path the URL constructor cannot resolve, naming the path, with Protocol", () => {
  // "//" makes the URL parser read what follows as authority, and "%zz" is not a valid
  // percent-escape there (unlike in an ordinary path segment, where percent content is not
  // validated at all) — `new URL` throws a raw TypeError for it; `local` must not let that
  // escape as an undocumented native error.
  assert.throws(
    () => Renderer.local("//%zz/crash.html", "file:///app/lib/main.js"),
    (error: unknown) => {
      assert.ok(error instanceof SewedError);
      assert.equal(error.code, "Protocol");
      assert.match(error.message, /\/\/%zz\/crash\.html/);
      return true;
    },
  );
});

test("local refuses a path whose resolved URL is not file:, naming the path, with Protocol", () => {
  assert.throws(
    () => Renderer.local("http://evil.example/x.html", "file:///app/lib/main.js"),
    (error: unknown) => {
      assert.ok(error instanceof SewedError);
      assert.equal(error.code, "Protocol");
      assert.match(error.message, /http:\/\/evil\.example\/x\.html/);
      return true;
    },
  );
});

test("local refuses a path that escapes importMetaUrl's own directory, naming the path, with Protocol", () => {
  assert.throws(
    () => Renderer.local("../../etc/passwd", "file:///app/lib/main.js"),
    (error: unknown) => {
      assert.ok(error instanceof SewedError);
      assert.equal(error.code, "Protocol");
      assert.match(error.message, /\.\.\/\.\.\/etc\/passwd/);
      return true;
    },
  );
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
