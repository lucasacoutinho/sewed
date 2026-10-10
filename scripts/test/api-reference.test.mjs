import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = fileURLToPath(new URL("../../", import.meta.url));

test("the API reference covers every typed public package entry", () => {
  const reference = readFileSync(join(workspace, "docs/reference.md"), "utf8");
  for (const directory of readdirSync(join(workspace, "packages"))) {
    const pkg = JSON.parse(
      readFileSync(join(workspace, "packages", directory, "package.json"), "utf8"),
    );
    for (const [entry, target] of Object.entries(pkg.exports ?? {})) {
      if (typeof target !== "object" || target.types === undefined) continue;
      const name = pkg.name + (entry === "." ? "" : entry.slice(1));
      assert.ok(reference.includes(`## \`${name}\`\n`), `missing ${name}`);
    }
  }
});

test("reference generation preserves the existing guide when formatting fails", () => {
  fixture(({ root, run }) => {
    const file = join(root, "docs/reference.md");
    const before = readFileSync(file, "utf8");
    for (const args of [[], ["--check"]]) {
      const result = run(...args);
      assert.notEqual(result.status, 0);
      assert.equal(readFileSync(file, "utf8"), before);
      assert.deepEqual(readdirSync(root).sort(), [
        "docs",
        "node_modules",
        "packages",
        "scripts",
        "tsconfig.json",
      ]);
    }
  });
});

test("reference generation rejects unexpected arguments before reading or writing files", () => {
  fixture(({ root, run }) => {
    rmSync(join(root, "tsconfig.json"));
    for (const args of [["--unknown"], ["--check", "--unknown"], ["--check", "--check"]]) {
      const result = run(...args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Usage:/);
      assert.equal(readFileSync(join(root, "docs/reference.md"), "utf8"), "Accepted reference\n");
    }
  });
});

test("reference publication failure keeps the guide and removes the temporary candidate", () => {
  fixture(({ root }) => {
    rmSync(join(root, "node_modules/oxfmt"), { recursive: true });
    symlinkSync(
      join(workspace, "node_modules/oxfmt"),
      join(root, "node_modules/oxfmt"),
      "junction",
    );
    const target = join(root, "docs/reference.md");
    const fault = join(root, "fault.mjs");
    writeFileSync(
      fault,
      `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      const original = fs.renameSync;
      fs.renameSync = (source, destination) => {
        if (destination === ${JSON.stringify(target)}) throw new Error("injected publication failure");
        return original(source, destination);
      };
      syncBuiltinESMExports();
    `,
    );
    const result = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(fault).href, join(root, "scripts/api-reference.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /injected publication/);
    assert.equal(readFileSync(target, "utf8"), "Accepted reference\n");
    assert.ok(readdirSync(root).every((name) => !name.startsWith(".sewed-reference-")));
  });
});

test("reference generation and checking own their paths when called from another directory", () => {
  fixture(({ root }) => {
    rmSync(join(root, "node_modules/oxfmt"), { recursive: true });
    symlinkSync(
      join(workspace, "node_modules/oxfmt"),
      join(root, "node_modules/oxfmt"),
      "junction",
    );
    const elsewhere = mkdtempSync(join(tmpdir(), "sewed-reference-cwd-"));
    try {
      mkdirSync(join(elsewhere, "docs"));
      writeFileSync(join(elsewhere, "tsconfig.json"), '{"references":[]}');
      writeFileSync(join(elsewhere, "docs/reference.md"), "Keep this guide\n");
      const script = join(root, "scripts/api-reference.mjs");
      execFileSync(process.execPath, [script], { cwd: elsewhere, encoding: "utf8" });
      assert.equal(readFileSync(join(elsewhere, "docs/reference.md"), "utf8"), "Keep this guide\n");
      const output = readFileSync(join(root, "docs/reference.md"), "utf8");
      assert.match(output, /## `fixture`/);
      assert.match(output, /type Value = string/);
      execFileSync(process.execPath, [script, "--check"], { cwd: elsewhere, encoding: "utf8" });
      writeFileSync(join(root, "docs/reference.md"), "Stale reference\n");
      assert.throws(
        () =>
          execFileSync(process.execPath, [script, "--check"], {
            cwd: elsewhere,
            encoding: "utf8",
            stdio: "pipe",
          }),
        /out of date/,
      );
      assert.equal(readFileSync(join(root, "docs/reference.md"), "utf8"), "Stale reference\n");
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});

test("formatter uses its declared Node entry without a shell shim or executable bit", () => {
  fixture(({ root, run }) => {
    const bin = "format entry.mjs";
    writeFileSync(
      join(root, "node_modules/oxfmt/package.json"),
      JSON.stringify({ name: "oxfmt", version: "0.66.0", bin: { oxfmt: bin } }),
    );
    writeFileSync(
      join(root, "node_modules/oxfmt", bin),
      `import assert from "node:assert/strict";
      import { writeFileSync } from "node:fs";
      assert.equal(process.argv.length, 3);
      writeFileSync(${JSON.stringify(join(root, "formatter-argument.txt"))}, process.argv[2]);
      `,
      { mode: 0o644 },
    );
    const result = run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const argument = readFileSync(join(root, "formatter-argument.txt"), "utf8");
    assert.match(argument, /\.sewed-reference-[^/\\]+[/\\]reference\.md$/);
    assert.match(readFileSync(join(root, "docs/reference.md"), "utf8"), /## `fixture`/);
    assert.ok(readdirSync(root).every((name) => !name.startsWith(".sewed-reference-")));
  });
});

test("an absent formatter bin preserves the accepted reference and removes the candidate", () => {
  fixture(({ root, run }) => {
    writeFileSync(
      join(root, "node_modules/oxfmt/package.json"),
      JSON.stringify({ name: "oxfmt", version: "0.66.0" }),
    );
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /oxfmt must declare a Node entry/);
    assert.equal(readFileSync(join(root, "docs/reference.md"), "utf8"), "Accepted reference\n");
    assert.ok(readdirSync(root).every((name) => !name.startsWith(".sewed-reference-")));
  });
});

test("reference formatting retains the project's formatter configuration", () => {
  fixture(({ root, run }) => {
    rmSync(join(root, "node_modules/oxfmt"), { recursive: true });
    symlinkSync(
      join(workspace, "node_modules/oxfmt"),
      join(root, "node_modules/oxfmt"),
      "junction",
    );
    writeFileSync(join(root, ".oxfmtrc.json"), '{"semi":false}\n');
    const result = run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const reference = readFileSync(join(root, "docs/reference.md"), "utf8");
    assert.match(reference, /type Value = string\n/);
    assert.doesNotMatch(reference, /type Value = string;/);
  });
});

/** @param {(fixture: { root: string; run: (...args: string[]) => import("node:child_process").SpawnSyncReturns<string> }) => void} runTest */
function fixture(runTest) {
  const root = mkdtempSync(join(tmpdir(), "sewed-reference tools & (space) ! $;%-"));
  try {
    mkdirSync(join(root, "scripts/internal"), { recursive: true });
    for (const file of ["api-reference.mjs", "internal/package-manifest.mjs"])
      cpSync(join(workspace, "scripts", file), join(root, "scripts", file));
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs/reference.md"), "Accepted reference\n");
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({ references: [{ path: "packages/fixture" }] }),
    );
    mkdirSync(join(root, "packages/fixture/lib"), { recursive: true });
    writeFileSync(
      join(root, "packages/fixture/package.json"),
      JSON.stringify({
        name: "fixture",
        version: "1.0.0",
        exports: { ".": { types: "./lib/index.d.ts" } },
      }),
    );
    writeFileSync(join(root, "packages/fixture/lib/index.d.ts"), "export type Value = string;\n");
    mkdirSync(join(root, "node_modules/oxfmt"), { recursive: true });
    symlinkSync(
      join(workspace, "node_modules/typescript"),
      join(root, "node_modules/typescript"),
      "junction",
    );
    writeFileSync(
      join(root, "node_modules/oxfmt/package.json"),
      JSON.stringify({ name: "oxfmt", version: "0.66.0", bin: { oxfmt: "format.mjs" } }),
    );
    writeFileSync(
      join(root, "node_modules/oxfmt/format.mjs"),
      'process.stderr.write("formatter fixture rejected source\\n"); process.exitCode = 7;\n',
    );
    runTest({
      root,
      run: (...args) =>
        spawnSync(process.execPath, [join(root, "scripts/api-reference.mjs"), ...args], {
          cwd: root,
          encoding: "utf8",
        }),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
