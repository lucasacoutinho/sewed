import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dependency = createRequire(import.meta.url).resolve("tinyexec/package.json");
const release = fileURLToPath(new URL("../release.mjs", import.meta.url));
/** @param {string} file */
const json = (file) => JSON.parse(readFileSync(file, "utf8"));

test("Effect bumps persist every dependency field and the scaffold pin", () => {
  fixture(({ root, run }) => {
    const result = run("effect", "4.0.0-rc.116");
    assert.equal(result.status, 0, result.stderr);
    const manifest = json(join(root, "packages/alpha/package.json"));
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ])
      assert.equal(manifest[field].effect, "4.0.0-rc.116");
    assert.equal(
      json(join(root, "packages/create/template/package.json")).dependencies.effect,
      "4.0.0-rc.116",
    );
    assert.equal(run("check").status, 0);
  });
});

test("Effect bumps succeed when Git finds no release-candidate mentions", () => {
  fixture(({ root, run }) => {
    rmSync(join(root, "node_modules"), { recursive: true });
    writeFileSync(join(root, "README.md"), "No release candidates.\n");
    assert.equal(run("effect", "4.0.0-rc.116").status, 0);
    assert.equal(run("check").status, 0);
  });
});

test("invalid version and Effect arguments leave every manifest unchanged", () => {
  fixture(({ root, run }) => {
    const paths = [
      "packages/alpha/package.json",
      "packages/create/package.json",
      "packages/create/template/package.json",
    ];
    const before = paths.map((path) => readFileSync(join(root, path), "utf8"));
    for (const command of ["version", "effect"]) {
      for (const value of ["01.2.3", "1.2.3-alpha..1", "1.2.3-01", "garbage", "1.2.3\n"]) {
        const result = run(command, value);
        assert.notEqual(result.status, 0, `${command} accepted ${JSON.stringify(value)}`);
        assert.deepEqual(
          paths.map((path) => readFileSync(join(root, path), "utf8")),
          before,
        );
      }
    }
  });
});

test("release commands reject extra arguments before mutation, building, or packing", () => {
  fixture(({ root, run }) => {
    const paths = [
      "packages/alpha/package.json",
      "packages/create/package.json",
      "packages/create/template/package.json",
    ];
    const before = paths.map((path) => readFileSync(join(root, path), "utf8"));
    for (const args of [
      ["check", "--dry-run"],
      ["version", "1.2.3", "--dry-run"],
      ["effect", "4.0.0-rc.116", "--dry-run"],
      ["pack", "artifacts", "--dry-run"],
    ]) {
      const result = run(...args);
      assert.notEqual(result.status, 0, `accepted ${args.join(" ")}`);
      assert.match(result.stderr, /Usage:/);
      assert.deepEqual(
        paths.map((path) => readFileSync(join(root, path), "utf8")),
        before,
      );
      assert.equal(existsSync(join(root, "commands")), false);
      assert.equal(existsSync(join(root, "artifacts")), false);
    }
  });
});

test("valid SemVer build metadata updates package versions and sibling pins", () => {
  fixture(({ root, run }) => {
    rmSync(join(root, "node_modules"), { recursive: true });
    const version = "1.2.3-alpha.1+build.001";
    const result = run("version", version);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(json(join(root, "packages/alpha/package.json")).version, version);
    const create = json(join(root, "packages/create/package.json"));
    assert.equal(create.version, version);
    assert.equal(create.dependencies["@sewed/fixture"], version);
    assert.equal(create.devDependencies["@sewed/fixture"], "workspace:*");
  });
});

test("release updates validate every manifest before changing files", () => {
  for (const command of ["version", "effect"]) {
    for (const malformed of [
      { dependencies: { "@sewed/fixture": 7 } },
      { optionalDependencies: [] },
      { version: null },
      { name: null },
      { files: "lib" },
    ]) {
      fixture(({ root, run }) => {
        const file = join(root, "packages/create/package.json");
        writeFileSync(file, JSON.stringify({ ...json(file), ...malformed }));
        const paths = manifestPaths(root);
        const before = paths.map((path) => readFileSync(path, "utf8"));
        const result = run(command, "1.2.3");
        assert.notEqual(result.status, 0, `${command} accepted ${JSON.stringify(malformed)}`);
        assert.ok(
          result.stderr.includes(join("packages", "create", "package.json")),
          result.stderr,
        );
        assert.deepEqual(
          paths.map((path) => readFileSync(path, "utf8")),
          before,
        );
      });
    }
    fixture(({ root, run }) => {
      const template = join(root, "packages/create/template/package.json");
      writeFileSync(template, JSON.stringify({ dependencies: { effect: null } }));
      const paths = manifestPaths(root);
      const before = paths.map((path) => readFileSync(path, "utf8"));
      const result = run(command, "1.2.3");
      assert.notEqual(result.status, 0);
      assert.ok(
        result.stderr.includes(join("packages", "create", "template", "package.json")),
        result.stderr,
      );
      assert.deepEqual(
        paths.map((path) => readFileSync(path, "utf8")),
        before,
      );
    });
  }
});

test("release checks reject missing package versions and non-version Effect pins", () => {
  fixture(({ root, run }) => {
    for (const path of manifestPaths(root).slice(0, 2)) {
      const pkg = json(path);
      delete pkg.version;
      delete pkg.dependencies;
      delete pkg.devDependencies;
      writeFileSync(path, JSON.stringify(pkg));
    }
    assert.notEqual(run("check").status, 0);
  });
  fixture(({ root, run }) => {
    for (const path of manifestPaths(root)) {
      const pkg = json(path);
      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ])
        if (pkg[field]?.effect !== undefined) pkg[field].effect = "latest";
      writeFileSync(path, JSON.stringify(pkg));
    }
    assert.notEqual(run("check").status, 0);
  });
});

/** @param {string} root */
const manifestPaths = (root) =>
  [
    "packages/alpha/package.json",
    "packages/create/package.json",
    "packages/create/template/package.json",
  ].map((file) => join(root, file));

test("packing refuses version drift before invoking the build or packer", () => {
  fixture(({ root, run }) => {
    const file = join(root, "packages/alpha/package.json");
    const manifest = json(file);
    manifest.version = "9.0.0";
    writeFileSync(file, JSON.stringify(manifest));
    const result = run("pack", "artifacts");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /package versions differ/);
    assert.equal(existsSync(join(root, "commands")), false);
  });
});

test("packing rechecks build output and refuses orphaned modules", () => {
  fixture(({ root, run }) => {
    writeFileSync(join(root, "make-orphan"), "");
    const result = run("pack", "artifacts");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /built from a source that no longer exists/);
    assert.deepEqual(
      readFileSync(join(root, "commands"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
      [["build"]],
    );
  });
});

test("packing builds missing outputs before checking public artifacts", () => {
  fixture(({ root, run }) => {
    rmSync(join(root, "packages/alpha/lib"), { recursive: true });
    const destination = "artifacts with (spaces) & ! $;%";
    const result = run("pack", destination);
    assert.equal(result.status, 0, result.stderr);
    const commands = readFileSync(join(root, "commands"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(commands, [
      ["build"],
      ["pack", "--pack-destination", join(root, destination)],
      ["pack", "--pack-destination", join(root, destination)],
    ]);
  });
});

for (const command of ["build", "pack"]) {
  test(`packing stops after a failed ${command} command`, () => {
    fixture(({ root, run }) => {
      writeFileSync(join(root, `fail-${command}`), "");
      const result = run("pack", "artifacts");
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(`injected ${command} failure`));
      const commands = readFileSync(join(root, "commands"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        commands,
        command === "build"
          ? [["build"]]
          : [["build"], ["pack", "--pack-destination", join(root, "artifacts")]],
      );
    });
  });
}

for (const missing of [
  "packages/alpha/lib/index.js",
  "packages/alpha/lib/index.d.ts",
  "packages/create/bin/create.mjs",
]) {
  test(`release checks refuse missing public artifact ${missing}`, () => {
    fixture(({ root, run }) => {
      rmSync(join(root, missing));
      const result = run("check");
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /missing/);
    });
  });
}

/**
 * @param {(fixture: {
 *   readonly root: string;
 *   readonly run: (...args: string[]) => import("node:child_process").SpawnSyncReturns<string>;
 * }) => void} runTest
 */
function fixture(runTest) {
  const root = mkdtempSync(join(tmpdir(), "sewed-release tools & (space) ! $;%-"));
  const binaries = mkdtempSync(join(tmpdir(), "sewed-release-bin-"));
  /** @param {string} path @param {string | object} value */
  const write = (path, value) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
  };
  try {
    write("scripts/release.mjs", readFileSync(release, "utf8"));
    write(
      "scripts/internal/package-manifest.mjs",
      readFileSync(join(release, "../internal/package-manifest.mjs"), "utf8"),
    );
    mkdirSync(join(root, "node_modules"));
    symlinkSync(join(dependency, ".."), join(root, "node_modules/tinyexec"), "junction");
    write("README.md", "Effect 4.0.0-rc.115\n");
    write("THIRD_PARTY_LICENSES.md", "Canonical notices.\n");
    for (const name of ["alpha", "create"]) {
      write(`packages/${name}/NOTICE`, "See THIRD_PARTY_LICENSES.md.\n");
      write(`packages/${name}/THIRD_PARTY_LICENSES.md`, "Canonical notices.\n");
    }
    write("packages/alpha/package.json", {
      name: "@sewed/fixture",
      version: "0.0.0-prototype.50",
      files: ["lib", "THIRD_PARTY_LICENSES.md"],
      exports: { ".": { types: "./lib/index.d.ts", import: "./lib/index.js" } },
      dependencies: { effect: "4.0.0-rc.115" },
      devDependencies: { effect: "4.0.0-rc.115" },
      peerDependencies: { effect: "4.0.0-rc.115" },
      optionalDependencies: { effect: "4.0.0-rc.115" },
    });
    write("packages/alpha/src/index.ts", "export {};\n");
    write("packages/alpha/lib/index.js", "export {};\n");
    write("packages/alpha/lib/index.d.ts", "export {};\n");
    write("packages/create/package.json", {
      name: "create-sewed",
      version: "0.0.0-prototype.50",
      files: ["bin", "template", "THIRD_PARTY_LICENSES.md"],
      bin: { "create-sewed": "./bin/create.mjs" },
      dependencies: { "@sewed/fixture": "0.0.0-prototype.50" },
      devDependencies: { "@sewed/fixture": "workspace:*" },
    });
    write("packages/create/bin/create.mjs", "");
    write("packages/create/template/package.json", {
      dependencies: { effect: "4.0.0-rc.115", "@sewed/fixture": "{{version}}" },
    });
    write(
      "bin/pnpm",
      `#!/usr/bin/env node
      const fs = require("node:fs");
      fs.appendFileSync(${JSON.stringify(join(root, "commands"))}, JSON.stringify(process.argv.slice(2)) + "\\n");
      if (fs.existsSync(${JSON.stringify(join(root, "fail-"))} + process.argv[2])) {
        console.error("injected " + process.argv[2] + " failure");
        process.exit(7);
      }
      if (process.argv[2] === "build") {
        fs.mkdirSync(${JSON.stringify(join(root, "packages/alpha/lib"))}, { recursive: true });
        for (const file of ["index.js", "index.d.ts"])
          fs.writeFileSync(${JSON.stringify(join(root, "packages/alpha/lib"))} + "/" + file, "export {};\\n");
      }
      if (process.argv[2] === "build" && fs.existsSync(${JSON.stringify(join(root, "make-orphan"))}))
        fs.writeFileSync(${JSON.stringify(join(root, "packages/alpha/lib/orphan.js"))}, "export {};\\n");
      if (process.argv[2] === "pack") console.log(${JSON.stringify(join(root, "fixture.tgz"))});
    `,
    );
    chmodSync(join(root, "bin/pnpm"), 0o755);
    write("bin/pnpm.cmd", `@"${process.execPath}" "%~dp0pnpm" %*\r\n`);
    cpSync(join(root, "bin"), binaries, { recursive: true });
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
    assert.equal(spawnSync("git", ["add", "README.md"], { cwd: root }).status, 0);
    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    /** @param {string[]} args */
    const run = (...args) =>
      spawnSync(process.execPath, [join(root, "scripts/release.mjs"), ...args], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          [pathKey]: `${binaries}${delimiter}${process.env[pathKey]}`,
        },
      });
    runTest({ root, run });
  } finally {
    rmSync(binaries, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
}
