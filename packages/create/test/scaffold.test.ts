import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const bin = fileURLToPath(new URL("../bin/create-sewed.mjs", import.meta.url));
const own = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { readonly version: string };

const run = (...args: string[]) =>
  execFileSync(process.execPath, [bin, ...args], { encoding: "utf8", stdio: "pipe" });

test("create-sewed writes a complete project named after its directory", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-")));
  try {
    const target = join(root, "clock-app");
    run(target);
    for (const file of [
      ".gitignore",
      "package.json",
      "README.md",
      "tsconfig.json",
      "tsconfig.electron.json",
      "pnpm-workspace.yaml",
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create-sewed accepts an explicit name and refuses a non-empty directory", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-")));
  try {
    const named = join(root, "dir");
    run(named, "--name", "@acme/desktop");
    const manifest = JSON.parse(readFileSync(join(named, "package.json"), "utf8")) as {
      readonly name: string;
    };
    assert.equal(manifest.name, "@acme/desktop");
    const occupied = join(root, "occupied");
    mkdirSync(occupied);
    writeFileSync(join(occupied, "keep.txt"), "");
    assert.throws(() => run(occupied));
    assert.deepEqual(readdirSync(occupied), ["keep.txt"]);
    assert.throws(() => run(join(root, "Bad Name")));
    assert.equal(existsSync(join(root, "Bad Name")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create-sewed rejects incomplete option values and unknown options before creating files", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-")));
  try {
    for (const args of [
      ["app", "--name"],
      ["app", "--name", "--help"],
      ["app", "--local-packages"],
      ["app", "--local-packages", "--help"],
      ["--unknown"],
      ["app", "--unknown"],
    ]) {
      const result = spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 1, `accepted ${args.join(" ")}`);
      assert.deepEqual(readdirSync(root), []);
    }
    const help = spawnSync(process.execPath, [bin, "--help"], { cwd: root, encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing local packages fail before creating project parents", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-local-")));
  try {
    const result = spawnSync(
      process.execPath,
      [bin, join(root, "nested/app"), "--local-packages", join(root, "missing packages")],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid local archive preserves the existing destination and its mode", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-local-")));
  try {
    const target = join(root, "app");
    mkdirSync(target, { mode: 0o750 });
    const mode = statSync(target).mode;
    const archives = join(root, "packages");
    mkdirSync(archives);
    mkdirSync(join(archives, `sewed-${own.version}.tgz`));
    const result = spawnSync(process.execPath, [bin, target, "--local-packages", archives], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.deepEqual(readdirSync(target), []);
    assert.equal(statSync(target).mode, mode);
    assert.deepEqual(readdirSync(root).sort(), ["app", "packages"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failed scaffold leaves an absent or empty destination ready for a retry", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-failure-")));
  try {
    const fixture = join(root, "package");
    mkdirSync(fixture);
    for (const file of ["bin", "template", "package.json"])
      cpSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(fixture, file), {
        recursive: true,
      });
    const readme = join(fixture, "template/README.md");
    const source = readFileSync(readme);
    rmSync(readme);
    const fixtureBin = join(fixture, "bin/create-sewed.mjs");
    for (const existing of [false, true]) {
      const target = join(root, existing ? "empty-app" : "new-app");
      if (existing) mkdirSync(target, { mode: 0o750 });
      const result = spawnSync(process.execPath, [fixtureBin, target], { encoding: "utf8" });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(existsSync(target), existing);
      if (existing) assert.deepEqual(readdirSync(target), []);
    }
    writeFileSync(readme, source);
    const target = join(root, "empty-app");
    const mode = statSync(target).mode;
    const retry = spawnSync(process.execPath, [fixtureBin, target], { encoding: "utf8" });
    assert.equal(retry.status, 0, retry.stderr);
    assert.equal(statSync(target).mode, mode);
    assert.deepEqual(readdirSync(root).sort(), ["empty-app", "package"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scaffold placement failures preserve an empty directory and newly arrived files", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-placement-")));
  try {
    for (const operation of ["renameSync", "rmdirSync"]) {
      const target = join(root, operation.toLowerCase());
      mkdirSync(target);
      const fault = join(root, `${operation}.mjs`);
      writeFileSync(
        fault,
        `
        import fs from "node:fs";
        import { syncBuiltinESMExports } from "node:module";
        const original = fs.${operation};
        fs.${operation} = (...args) => {
          if (${operation === "renameSync" ? "args[1]" : "args[0]"} === ${JSON.stringify(target)}) {
            ${operation === "rmdirSync" ? `fs.writeFileSync(${JSON.stringify(join(target, "keep.txt"))}, "keep");` : 'throw new Error("injected placement failure");'}
          }
          return original(...args);
        };
        syncBuiltinESMExports();
      `,
      );
      const result = spawnSync(
        process.execPath,
        ["--import", pathToFileURL(fault).href, bin, target],
        {
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 1);
      assert.ok(existsSync(target));
      assert.deepEqual(readdirSync(target), operation === "rmdirSync" ? ["keep.txt"] : []);
      if (operation === "rmdirSync")
        assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "keep");
    }
    assert.ok(readdirSync(root).every((file) => !file.startsWith(".create-sewed-")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create-sewed validates its version before creating the destination", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-manifest-")));
  try {
    mkdirSync(join(root, "package/bin"), { recursive: true });
    cpSync(bin, join(root, "package/bin/create-sewed.mjs"));
    cpSync(fileURLToPath(new URL("../template", import.meta.url)), join(root, "package/template"), {
      recursive: true,
    });
    writeFileSync(join(root, "package/package.json"), "{}");
    const target = join(root, "app");
    const result = spawnSync(
      process.execPath,
      [join(root, "package/bin/create-sewed.mjs"), target],
      {
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 1);
    assert.equal(existsSync(target), false);
    const help = spawnSync(
      process.execPath,
      [join(root, "package/bin/create-sewed.mjs"), "--help"],
      {
        encoding: "utf8",
      },
    );
    assert.equal(help.status, 0, help.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create-sewed runs when it is launched through a symlink", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-link-")));
  try {
    const link = join(root, "create-sewed");
    symlinkSync(bin, link);
    const target = join(root, "linked-app");
    const result = spawnSync(process.execPath, [link, target], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(target, "package.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
