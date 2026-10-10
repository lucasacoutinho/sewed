import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveElectron } from "../src/index.js";

const vitePackageDir = fileURLToPath(new URL("..", import.meta.url));

test("resolves the Electron binary this repository installs, from cwd's package.json", () => {
  const electron = resolveElectron({ cwd: vitePackageDir });
  assert.equal(isAbsolute(electron), true);
  assert.equal(existsSync(electron), true);
});

test("throws naming the directory when Electron cannot be resolved there", async () => {
  const projectDir = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-resolve-electron-")));
  try {
    await writeFile(join(projectDir, "package.json"), '{"name":"fixture-app"}\n', "utf8");
    assert.throws(
      () => resolveElectron({ cwd: projectDir }),
      (error) => error instanceof Error && error.message.includes(projectDir),
    );
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("an explicit relative electronPath resolves against cwd", async () => {
  const projectDir = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-resolve-electron-")));
  try {
    await writeFile(join(projectDir, "package.json"), '{"name":"fixture-app"}\n', "utf8");
    await mkdir(join(projectDir, "vendor"), { recursive: true });
    await writeFile(join(projectDir, "vendor", "electron-stub"), "", "utf8");
    const electron = resolveElectron({ cwd: projectDir, electronPath: "vendor/electron-stub" });
    assert.equal(electron, join(projectDir, "vendor", "electron-stub"));
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});
