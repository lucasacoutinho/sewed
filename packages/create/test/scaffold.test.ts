import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/create-sewed.mjs", import.meta.url));
const own = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { readonly version: string };

const run = (...args: string[]) =>
  execFileSync(process.execPath, [bin, ...args], { encoding: "utf8", stdio: "pipe" });

test("create-sewed writes a complete project named after its directory", () => {
  const root = mkdtempSync(join(tmpdir(), "create-sewed-"));
  try {
    const target = join(root, "clock-app");
    const output = run(target);
    assert.match(output, /Created clock-app/);
    for (const file of [
      ".gitignore",
      "package.json",
      "README.md",
      "tsconfig.json",
      "tsconfig.electron.json",
      "vite.config.ts",
      "src/shared/contracts.ts",
      "src/shared/bindings.ts",
      "src/worker/clock.ts",
      "src/main/app.ts",
      "src/renderer/index.html",
      "src/renderer/main.tsx",
      "src/renderer/App.tsx",
      "src/renderer/lib/sewed.tsx",
    ])
      assert.ok(existsSync(join(target, file)), `missing ${file}`);
    assert.ok(!existsSync(join(target, "_gitignore")));
    const manifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      readonly name: string;
      readonly dependencies: Record<string, string>;
      readonly devDependencies: Record<string, string>;
    };
    assert.equal(manifest.name, "clock-app");
    assert.equal(manifest.dependencies["sewed"], own.version);
    assert.equal(manifest.dependencies["@sewed/react"], own.version);
    assert.equal(manifest.devDependencies["@sewed/vite"], own.version);
    assert.match(readFileSync(join(target, "README.md"), "utf8"), /^# clock-app/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create-sewed accepts an explicit name and refuses a non-empty directory", () => {
  const root = mkdtempSync(join(tmpdir(), "create-sewed-"));
  try {
    const named = join(root, "dir");
    run(named, "--name", "@acme/desktop");
    const manifest = JSON.parse(readFileSync(join(named, "package.json"), "utf8")) as {
      readonly name: string;
    };
    assert.equal(manifest.name, "@acme/desktop");
    const occupied = join(root, "occupied");
    execFileSync("mkdir", ["-p", occupied]);
    writeFileSync(join(occupied, "keep.txt"), "");
    assert.throws(() => run(occupied), /is not empty/);
    assert.throws(() => run(join(root, "Bad Name")), /Invalid package name/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
