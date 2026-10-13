import assert from "node:assert/strict";
import { xSync } from "tinyexec";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest, targets, typedExports } from "./internal/package-manifest.mjs";
import { materializeWalkthrough } from "./internal/walkthrough.mjs";

if (process.argv.length !== 2) {
  console.error("Usage: check-consumer.mjs");
  process.exit(2);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const packagesDirectory = join(root, "packages");
const packages = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => readManifest(join(packagesDirectory, name, "package.json")));
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sewed-packed-consumer-"));
/** @param {string} command @param {readonly string[]} args @param {string} [cwd] */
const run = (command, args, cwd = root) =>
  xSync(command, args, {
    nodePath: false,
    throwOnError: true,
    nodeOptions: { cwd, stdio: "inherit" },
  });

try {
  const tarballsDirectory = join(temporaryDirectory, "tarballs");
  const toolsDirectory = join(temporaryDirectory, "tools");
  const consumerDirectory = join(temporaryDirectory, "consumer");
  mkdirSync(toolsDirectory);
  run(process.execPath, [join(root, "scripts", "release.mjs"), "pack", tarballsDirectory]);
  const tarballs = new Map(
    packages.map(({ name, version }) => [
      name,
      join(tarballsDirectory, `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`),
    ]),
  );
  /** @param {string} name */
  const tarballOf = (name) => {
    const tarball = tarballs.get(name);
    if (tarball === undefined) throw new Error(`No packed archive for ${name}`);
    return tarball;
  };
  for (const pkg of packages) {
    const directory = join(temporaryDirectory, pkg.name.replaceAll("/", "-"));
    mkdirSync(directory);
    run("tar", ["-xzf", tarballOf(pkg.name), "-C", directory]);
    const packed = join(directory, "package");
    const manifest = readManifest(join(packed, "package.json"));
    assert.equal(manifest.name, pkg.name);
    assert.equal(manifest.version, pkg.version);
    for (const target of [...targets(manifest.exports), ...targets(manifest.bin)])
      assert.ok(statSync(join(packed, target)).isFile(), `${pkg.name}: missing packed ${target}`);
    for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.md"])
      assert.deepEqual(
        readFileSync(join(packed, file)),
        readFileSync(join(root, file)),
        `${pkg.name}: stale ${file}`,
      );
    if (pkg.name === "sewed") {
      assert.deepEqual(
        readdirSync(join(packed, "docs")).sort(),
        readdirSync(join(root, "docs")).sort(),
      );
      for (const file of readdirSync(join(root, "docs")))
        assert.deepEqual(
          readFileSync(join(packed, "docs", file)),
          readFileSync(join(root, "docs", file)),
          `stale packaged docs/${file}`,
        );
    }
  }
  run("tar", ["-xzf", tarballOf("create-sewed"), "-C", toolsDirectory]);
  run(process.execPath, [
    join(toolsDirectory, "package", "bin", "create-sewed.mjs"),
    consumerDirectory,
    "--name",
    "sewed-packed-consumer",
    "--local-packages",
    tarballsDirectory,
  ]);

  const manifestPath = join(consumerDirectory, "package.json");
  const manifest = readManifest(manifestPath);
  const dependencies = (manifest.dependencies ??= {});
  const devDependencies = (manifest.devDependencies ??= {});
  for (const [name, tarball] of tarballs) {
    if (
      name !== "create-sewed" &&
      dependencies[name] === undefined &&
      devDependencies[name] === undefined
    )
      devDependencies[name] = `file:${tarball}`;
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const effectVersion = dependencies.effect;
  assert.ok(effectVersion !== undefined, "Scaffold must declare Effect");
  for (const profile of [
    { name: "core", packages: ["sewed"] },
    { name: "vite", packages: ["@sewed/vite"] },
    { name: "devtools", packages: ["sewed", "@sewed/devtools"] },
  ]) {
    const directory = join(temporaryDirectory, `${profile.name}-consumer`);
    cpSync(join(root, "scripts", "test", "fixtures", "consumer"), directory, {
      recursive: true,
    });
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        name: `sewed-${profile.name}-consumer`,
        private: true,
        type: "module",
        dependencies: {
          ...Object.fromEntries(profile.packages.map((name) => [name, `file:${tarballOf(name)}`])),
          ...(profile.name === "vite" ? {} : { effect: effectVersion }),
        },
      }),
    );
    writeFileSync(
      join(directory, "pnpm-workspace.yaml"),
      "allowBuilds:\n  msgpackr-extract: true\n",
    );
    run("pnpm", ["install", "--prefer-offline"], directory);
    run(
      process.execPath,
      ["--test", "--test-timeout=60000", `${profile.name}.test.mjs`],
      directory,
    );
  }
  run("pnpm", ["install", "--prefer-offline"], consumerDirectory);
  const lockfilePath = join(consumerDirectory, "pnpm-lock.yaml");
  const lockfile = readFileSync(lockfilePath);
  rmSync(join(consumerDirectory, "node_modules"), { recursive: true, force: true });
  run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], consumerDirectory);
  assert.deepEqual(readFileSync(lockfilePath), lockfile, "Consumer reinstall changed its lockfile");
  const entries = packages.flatMap((pkg) =>
    Object.keys(pkg.exports ?? {}).map((entry) => pkg.name + (entry === "." ? "" : entry.slice(1))),
  );
  const probe = join(consumerDirectory, "check-exports.mjs");
  writeFileSync(
    probe,
    `import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const entries = ${JSON.stringify(entries)};
for (const entry of entries) {
  assert.ok(statSync(fileURLToPath(import.meta.resolve(entry))).isFile(), entry);
  if (!["sewed/main", "sewed/preload", "@sewed/forge"].includes(entry)) await import(entry);
}
console.log("Resolved all " + entries.length + " public exports; imported every Node-compatible entry.");
`,
  );
  run(process.execPath, [probe], consumerDirectory);
  const typedEntries = packages.flatMap((pkg) => typedExports(pkg).map(([entry]) => entry));
  const typeProbe = "check-exports.ts";
  writeFileSync(
    join(consumerDirectory, typeProbe),
    `export type PublicEntries = [${typedEntries.map((entry) => `typeof import(${JSON.stringify(entry)})`).join(", ")}];\n`,
  );
  run("pnpm", ["typecheck"], consumerDirectory);
  run("pnpm", ["build"], consumerDirectory);
  materializeWalkthrough(join(root, "docs", "getting-started.md"), consumerDirectory);
  run("pnpm", ["typecheck"], consumerDirectory);
  run("pnpm", ["build"], consumerDirectory);
  /** @param {string} source @param {string} directory */
  const checkFixtures = (source, directory) => {
    const fixturesDirectory = join(consumerDirectory, directory);
    cpSync(join(root, "scripts", "test", "fixtures", source), fixturesDirectory, {
      recursive: true,
    });
    run(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--allowJs",
        "--checkJs",
        "--allowImportingTsExtensions",
        "--noUncheckedIndexedAccess",
        "--exactOptionalPropertyTypes",
        "--noUnusedLocals",
        "--noUnusedParameters",
        "--noFallthroughCasesInSwitch",
        "--verbatimModuleSyntax",
        "--skipLibCheck",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--target",
        "ES2023",
        typeProbe,
        ...readdirSync(fixturesDirectory).map((file) => join(directory, file)),
      ],
      consumerDirectory,
    );
  };
  checkFixtures("consumer", "check-minimal");
  run(
    process.execPath,
    ["--test", "--test-timeout=60000", join("check-minimal", "walkthrough.test.mjs")],
    consumerDirectory,
  );
  materializeWalkthrough(join(root, "docs", "binding-composition.md"), consumerDirectory);
  run("pnpm", ["typecheck"], consumerDirectory);
  run("pnpm", ["build"], consumerDirectory);
  checkFixtures("workspace", "check-workspace");
  run(
    process.execPath,
    ["--test", "--test-timeout=60000", join("check-workspace", "workspace.test.mjs")],
    consumerDirectory,
  );
  rmSync(temporaryDirectory, { recursive: true, force: true });
  console.log(
    "All packed public artifacts, notices, docs, fresh and frozen installs, imports, typecheck, builds, minimal consumers, and executable single- and multi-window application-guide checks passed.",
  );
} catch (error) {
  console.error(`Packed consumer check failed; evidence retained at ${temporaryDirectory}`);
  throw error;
}
