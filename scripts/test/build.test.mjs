import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../../", import.meta.url));

test("build removes obsolete packaged guides and refreshes every package's notices", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sewed-build-")));
  /** @param {string} path @param {string} value */
  const write = (path, value) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  try {
    write(
      "scripts/build-preload.mjs",
      readFileSync(join(workspace, "scripts/build-preload.mjs"), "utf8"),
    );
    symlinkSync(join(workspace, "node_modules"), join(root, "node_modules"), "junction");
    for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.md", "README.md"])
      write(file, `Current ${file}\n`);
    for (const name of ["sewed", "react", "vite", "devtools", "create", "forge"])
      write(`packages/${name}/THIRD_PARTY_LICENSES.md`, "Stale notices\n");
    write("packages/sewed/src/internal/preload.ts", "export const preload = true;\n");
    write("packages/sewed/docs/deleted-guide.md", "Deleted\n");
    write("docs/devtools.md", "DevTools\n");
    write("docs/forge.md", "Forge\n");
    const result = spawnSync(process.execPath, ["scripts/build-preload.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const names = ["sewed", "react", "vite", "devtools", "create", "forge"];
    assert.deepEqual(
      {
        obsoleteGuide: existsSync(join(root, "packages/sewed/docs/deleted-guide.md")),
        currentGuide: readFileSync(join(root, "packages/sewed/docs/devtools.md"), "utf8"),
        notices: names.map((name) =>
          readFileSync(join(root, `packages/${name}/THIRD_PARTY_LICENSES.md`), "utf8"),
        ),
      },
      {
        obsoleteGuide: false,
        currentGuide: "DevTools\n",
        notices: names.map(() => "Current THIRD_PARTY_LICENSES.md\n"),
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build owns its output paths and rejects unexpected arguments", () => {
  fixture(({ root }) => {
    const script = join(root, "scripts/build-preload.mjs");
    const invalid = spawnSync(process.execPath, [script, "--unknown"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /Usage:/);
    assert.equal(existsSync(join(root, "packages/sewed/lib/preload.cjs")), false);
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "sewed-build-cwd-")));
    try {
      const result = spawnSync(process.execPath, [script], { cwd: elsewhere, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readdirSync(elsewhere), []);
      assert.ok(existsSync(join(root, "packages/sewed/lib/preload.cjs")));
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});

/** @param {(fixture: { root: string }) => void} runTest */
function fixture(runTest) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sewed-build-failure-")));
  /** @param {string} path @param {string} value */
  const write = (path, value) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  try {
    write(
      "scripts/build-preload.mjs",
      readFileSync(join(workspace, "scripts/build-preload.mjs"), "utf8"),
    );
    symlinkSync(join(workspace, "node_modules"), join(root, "node_modules"), "junction");
    for (const file of [
      "LICENSE",
      "NOTICE",
      "THIRD_PARTY_LICENSES.md",
      "README.md",
      "docs/devtools.md",
      "docs/forge.md",
    ])
      write(file, `Current ${file}\n`);
    for (const name of ["sewed", "react", "vite", "devtools", "create", "forge"])
      mkdirSync(join(root, "packages", name), { recursive: true });
    write("packages/sewed/src/internal/preload.ts", "export const preload = true;\n");
    write("packages/sewed/docs/accepted.md", "Accepted guide\n");
    runTest({ root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
