import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { makeConfig } from "../lib/config.js";
import * as CrashReporter from "../lib/CrashReporterSchema.js";
import * as Updater from "../lib/UpdaterSchema.js";

test("the configuration helper references makers and the GitHub publisher by name", () => {
  const config = makeConfig({
    name: "sewed-app",
    icon: "./assets/icon",
    makers: ["squirrel", "deb"],
    github: { owner: "sewed", repo: "app" },
  });
  assert.equal(config.packagerConfig.asar, true);
  assert.equal(config.packagerConfig.executableName, "sewed-app");
  assert.deepEqual(
    config.makers.map((maker) => [maker.name, maker.platforms]),
    [
      ["@electron-forge/maker-squirrel", ["win32"]],
      ["@electron-forge/maker-deb", ["linux"]],
    ],
  );
  assert.deepEqual(config.publishers[0]?.config?.repository, { owner: "sewed", name: "app" });
  assert.equal(makeConfig().makers.length, 5);
  assert.deepEqual(makeConfig().publishers, []);
});

test("the update feed follows update.electronjs.org's path layout", () => {
  assert.equal(
    Updater.feedUrl({ owner: "sewed", repo: "app" }, "darwin", "arm64", "1.2.3"),
    "https://update.electronjs.org/sewed/app/darwin-arm64/1.2.3",
  );
  assert.equal(
    Updater.feedUrl(
      { owner: "o", repo: "r", host: "updates.example.com" },
      "win32",
      "x64",
      "2.0.0",
    ),
    "https://updates.example.com/o/r/win32-x64/2.0.0",
  );
  const feed = Schema.decodeUnknownExit(Updater.Feed);
  assert.equal(feed({ url: "https://updates.example.com/feed" })._tag, "Success");
  assert.equal(feed({ url: "ftp://updates.example.com" })._tag, "Failure");
  const state = Schema.decodeUnknownExit(Updater.State);
  assert.equal(state({ status: "downloaded" })._tag, "Failure");
});

test("crash parameters keep Electron's byte limits", () => {
  const decode = Schema.decodeUnknownExit(CrashReporter.Parameters);
  assert.equal(decode({ channel: "beta" })._tag, "Success");
  assert.equal(decode({ ["k".repeat(40)]: "v" })._tag, "Failure");
  assert.equal(decode({ key: "v".repeat(128) })._tag, "Failure");
  const options = Schema.decodeUnknownExit(CrashReporter.Options);
  assert.equal(options({ submitUrl: "not a url" })._tag, "Failure");
  assert.equal(options({ uploadToServer: false, extra: { a: "b" } })._tag, "Success");
});
