// Packages a scaffolded application with Electron Forge through `@sewed/forge`'s `makeConfig`, on
// whatever platform this runs on, and starts the packaged binary to see that it reaches a page.
// On macOS and Windows it also makes the ZIP distributable. Linux needs a display: run it under
// `xvfb-run` there.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { xSync } from "tinyexec";
import { readManifest } from "./internal/package-manifest.mjs";

if (process.argv.length !== 2) {
  console.error("Usage: check-packaging.mjs");
  process.exit(2);
}

const forgeVersion = "8.0.1";
const name = "sewed-packaged";
const root = fileURLToPath(new URL("..", import.meta.url));
const packagesDirectory = join(root, "packages");
const packages = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readManifest(join(packagesDirectory, entry.name, "package.json")));
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sewed-packaging-"));
/** @param {string} command @param {readonly string[]} args @param {string} [cwd] */
const run = (command, args, cwd = root) =>
  xSync(command, args, {
    nodePath: false,
    throwOnError: true,
    nodeOptions: { cwd, stdio: "inherit" },
  });

/** @param {string} directory @returns {string | undefined} */
const firstFile = (directory) => {
  if (!existsSync(directory)) return undefined;
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true }))
    if (entry.isFile()) return join(entry.parentPath, entry.name);
  return undefined;
};

/** Starts the packaged binary and resolves with the first page it reports over DevTools. */
const firstPage = async (/** @type {string} */ executable) => {
  const port = 19000 + (process.pid % 1000);
  const child = spawn(executable, [`--remote-debugging-port=${port}`, "--no-sandbox"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  let exited;
  child.once("exit", (code, signal) => {
    exited = { code, signal };
  });
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      assert.equal(
        exited,
        undefined,
        `the packaged application exited early: ${JSON.stringify(exited)}`,
      );
      try {
        /** @type {unknown} */
        const listed = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = (Array.isArray(listed) ? listed : []).find(
          (/** @type {{ type?: unknown; url?: unknown }} */ target) =>
            target.type === "page" &&
            typeof target.url === "string" &&
            target.url !== "about:blank",
        );
        if (page !== undefined) return page;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("the packaged application showed no page within a minute");
  } finally {
    child.kill();
  }
};

try {
  const tarballsDirectory = join(temporaryDirectory, "tarballs");
  const toolsDirectory = join(temporaryDirectory, "tools");
  const appDirectory = join(temporaryDirectory, "app");
  mkdirSync(toolsDirectory);
  run(process.execPath, [join(root, "scripts", "release.mjs"), "pack", tarballsDirectory]);
  const tarballs = new Map(
    packages.map((pkg) => [
      pkg.name,
      join(
        tarballsDirectory,
        `${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${pkg.version}.tgz`,
      ),
    ]),
  );
  const created = tarballs.get("create-sewed");
  assert.ok(created !== undefined, "no packed create-sewed");
  run("tar", ["-xzf", created, "-C", toolsDirectory]);
  run(process.execPath, [
    join(toolsDirectory, "package", "bin", "create-sewed.mjs"),
    appDirectory,
    "--name",
    name,
  ]);

  const manifestPath = join(appDirectory, "package.json");
  const manifest = readManifest(manifestPath);
  const dependencies = (manifest.dependencies ??= {});
  const devDependencies = (manifest.devDependencies ??= {});
  for (const declared of [dependencies, devDependencies])
    for (const dependency of Object.keys(declared)) {
      const tarball = tarballs.get(dependency);
      if (tarball !== undefined) declared[dependency] = `file:${tarball}`;
    }
  const forge = tarballs.get("@sewed/forge");
  assert.ok(forge !== undefined, "no packed @sewed/forge");
  devDependencies["@sewed/forge"] = `file:${forge}`;
  devDependencies["@electron-forge/cli"] = forgeVersion;
  devDependencies["@electron-forge/maker-zip"] = forgeVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(appDirectory, "forge.config.js"),
    `import { makeConfig } from "@sewed/forge/config";\n\nexport default makeConfig({ name: ${JSON.stringify(name)}, makers: ["zip"] });\n`,
  );

  run("pnpm", ["install", "--no-frozen-lockfile"], appDirectory);
  run("pnpm", ["build"], appDirectory);
  run("pnpm", ["exec", "electron-forge", "package"], appDirectory);

  const packaged = join(appDirectory, "out", `${name}-${process.platform}-${process.arch}`);
  const executable =
    process.platform === "darwin"
      ? join(packaged, `${name}.app`, "Contents", "MacOS", name)
      : join(packaged, process.platform === "win32" ? `${name}.exe` : name);
  assert.ok(existsSync(executable), `Forge wrote no executable at ${executable}`);
  const page = await firstPage(executable);
  console.log(`The packaged application showed ${page.url}`);

  if (process.platform !== "linux") {
    run("pnpm", ["exec", "electron-forge", "make", "--skip-package"], appDirectory);
    const distributable = firstFile(join(appDirectory, "out", "make"));
    assert.ok(distributable !== undefined, "Forge made no distributable");
    console.log(`Forge made ${distributable}`);
  }
  rmSync(temporaryDirectory, { recursive: true, force: true });
  console.log(`Packaging passed on ${process.platform}`);
} catch (error) {
  console.error(`Packaging check failed; evidence retained at ${temporaryDirectory}`);
  throw error;
}
