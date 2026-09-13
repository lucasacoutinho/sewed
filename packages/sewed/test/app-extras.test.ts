import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { Application } from "sewed";

test("application schemas keep Electron's closed sets and switch syntax", () => {
  const flag = Schema.decodeUnknownExit(Application.CommandLineSwitch);
  assert.equal(flag({ name: "enable-features", value: "x" })._tag, "Success");
  assert.equal(flag({ name: "--no-sandbox" })._tag, "Failure");
  assert.equal(flag({ name: "" })._tag, "Failure");
  const client = Schema.decodeUnknownExit(Application.ProtocolClient);
  assert.equal(client({ scheme: "sewed-app" })._tag, "Success");
  assert.equal(client({ scheme: "Sewed" })._tag, "Failure");
  assert.equal(client({ scheme: "1x" })._tag, "Failure");
  const badge = Schema.decodeUnknownExit(Application.Badge);
  assert.equal(badge(0)._tag, "Success");
  assert.equal(badge(-1)._tag, "Failure");
  const pathName = Schema.decodeUnknownExit(Application.PathName);
  assert.equal(pathName("userData")._tag, "Success");
  assert.equal(pathName("cache")._tag, "Failure");
  const gone = Schema.decodeUnknownExit(Application.ChildProcessGone);
  assert.equal(gone({ type: "GPU", reason: "crashed", exitCode: 1 })._tag, "Success");
  assert.equal(gone({ type: "Browser", reason: "crashed", exitCode: 1 })._tag, "Failure");
});
