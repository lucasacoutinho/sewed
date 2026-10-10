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
    const output = run(target);
    assert.match(output, /Created clock-app/);
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
    assert.match(readFileSync(join(target, "README.md"), "utf8"), /^# clock-app/);
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
    assert.throws(() => run(occupied), /is not empty/);
    assert.throws(() => run(join(root, "Bad Name")), /Invalid package name/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create-sewed rejects incomplete names and unknown options before creating files", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "create-sewed-")));
  try {
    for (const args of [
      ["app", "--name"],
      ["app", "--name", "--help"],
      ["--unknown"],
      ["app", "--unknown"],
    ]) {
      const result = spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 1, `accepted ${args.join(" ")}`);
      assert.match(result.stderr, /name requires|Unknown option/);
      assert.deepEqual(readdirSync(root), []);
    }
    const help = spawnSync(process.execPath, [bin, "--help"], { cwd: root, encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage:/);
    assert.deepEqual(readdirSync(root), []);
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
    assert.match(result.stderr, /version/);
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
