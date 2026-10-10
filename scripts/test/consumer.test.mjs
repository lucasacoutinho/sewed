import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readManifest, typedExports } from "../internal/package-manifest.mjs";
import { test } from "node:test";

const workspace = fileURLToPath(new URL("../../", import.meta.url));

test("consumer checks reject arguments before packing or installing", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sewed-consumer-arguments-")));
  try {
    mkdirSync(join(root, "scripts/internal"), { recursive: true });
    mkdirSync(join(root, "node_modules"));
    symlinkSync(
      join(createRequire(import.meta.url).resolve("tinyexec/package.json"), ".."),
      join(root, "node_modules/tinyexec"),
      "junction",
    );
    for (const file of ["check-consumer.mjs", "internal/package-manifest.mjs"])
      cpSync(join(workspace, "scripts", file), join(root, "scripts", file));
    const marker = join(root, "invoked");
    const fault = join(root, "fault.mjs");
    writeFileSync(
      fault,
      `
      import cp from "node:child_process";
      import { writeFileSync } from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      cp.execFileSync = () => { writeFileSync(${JSON.stringify(marker)}, "invoked"); throw new Error("unexpected child command"); };
      cp.spawnSync = cp.execFileSync;
      syncBuiltinESMExports();
    `,
    );
    for (const args of [["--unknown"], ["--help"], ["extra"]]) {
      const result = spawnSync(
        process.execPath,
        ["--import", pathToFileURL(fault).href, join(root, "scripts/check-consumer.mjs"), ...args],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Usage:/);
      assert.equal(existsSync(marker), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest boundaries validate targets and dependency maps and retain other fields", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sewed-manifest-")));
  const file = join(root, "package.json");
  const valid = {
    name: "fixture",
    version: "1.0.0",
    private: true,
    exports: { ".": { types: "./lib/index.d.ts", import: "./lib/index.js" }, "./disabled": null },
    bin: { fixture: "./bin/fixture.mjs" },
    dependencies: { effect: "4.0.0-rc.115" },
  };
  try {
    for (const malformed of [
      { name: null },
      { version: 7 },
      { exports: { ".": { types: 7 } } },
      { bin: ["bin"] },
      { dependencies: { effect: 7 } },
      { dependencies: null },
      { devDependencies: [] },
    ]) {
      writeFileSync(file, JSON.stringify({ ...valid, ...malformed }));
      assert.throws(() => readManifest(file), /package.json/);
    }
    writeFileSync(file, JSON.stringify(valid));
    const pkg = readManifest(file);
    assert.equal(pkg.private, true);
    assert.deepEqual(typedExports(pkg), [["fixture", "./lib/index.d.ts"]]);
    writeFileSync(file, JSON.stringify({ name: "app", version: "1.0.0" }));
    const app = readManifest(file);
    assert.equal(Object.hasOwn(app, "exports"), false);
    assert.equal(Object.hasOwn(app, "bin"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
