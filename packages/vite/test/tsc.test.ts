import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { resolveProject } from "../src/internal/tsc.js";

const workspaceTypescript = fileURLToPath(
  new URL("../../../node_modules/typescript", import.meta.url),
);

test("tracks JSONC array and package config extends without changing quoted literals", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "sewed-vite-tsc-config-"));
  try {
    await writeFixture(projectDir);
    const configsDir = join(projectDir, "configs");
    const rootConfig = join(projectDir, "tsconfig.json");
    const bracketConfig = join(configsDir, "keep ,].json");
    const braceConfig = join(configsDir, "keep ,}.json");
    const baseConfig = join(configsDir, "base.json");
    const packageConfig = join(projectDir, "node_modules", "shared-config", "tsconfig.json");
    await writeFile(
      rootConfig,
      `{
        // The commas below are JSONC syntax; the commas inside strings are data.
        "extends": [
          "./configs/keep ,].json",
          "./configs/keep ,}.json",
          "./configs/base.json",
          "shared-config",
        ],
        "compilerOptions": {
          "module": "NodeNext",
          "moduleResolution": "NodeNext",
          "rootDir": "src"
        },
        "include": ["src/main/**/*.ts", "src/worker/**/*.ts"],
        "literal": "keep ,] and ,}"
      }\n`,
      "utf8",
    );
    await writeFile(bracketConfig, '{"compilerOptions":{"strict":true}}\n', "utf8");
    await writeFile(braceConfig, '{"compilerOptions":{"skipLibCheck":true}}\n', "utf8");
    await writeFile(baseConfig, '{"compilerOptions":{"target":"ES2023"}}\n', "utf8");
    await writeFile(
      packageConfig,
      '{"compilerOptions":{"forceConsistentCasingInFileNames":true}}\n',
      "utf8",
    );

    const project = await resolveProject({
      projectDir,
      tsconfig: "tsconfig.json",
      main: "src/main/app.ts",
      signal: new AbortController().signal,
    });

    assert.deepEqual(project.configPaths, [
      resolve(rootConfig),
      resolve(bracketConfig),
      resolve(braceConfig),
      resolve(baseConfig),
      resolve(packageConfig),
    ]);
    assert.deepEqual(project.includeRoots, [
      join(projectDir, "src", "main"),
      join(projectDir, "src", "worker"),
    ]);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("selects included main and worker sources while excluding renderer sources", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "sewed-vite-tsc-files-"));
  try {
    await writeFixture(projectDir);
    await writeFile(
      join(projectDir, "tsconfig.json"),
      '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","rootDir":"src"},"include":["src/main/**/*.ts","src/worker/**/*.ts"]}\n',
      "utf8",
    );

    const mainPath = join(projectDir, "src", "main", "app.ts");
    const workerPath = join(projectDir, "src", "worker", "worker.ts");
    const rendererPath = join(projectDir, "src", "renderer", "ignored.ts");
    const project = await resolveProject({
      projectDir,
      tsconfig: "tsconfig.json",
      main: "src/main/app.ts",
      signal: new AbortController().signal,
    });

    assert.ok(project.files.includes(mainPath));
    assert.ok(project.files.includes(workerPath));
    assert.equal(project.files.includes(rendererPath), false);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function writeFixture(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, "src", "main"), { recursive: true });
  await mkdir(join(projectDir, "src", "worker"), { recursive: true });
  await mkdir(join(projectDir, "src", "renderer"), { recursive: true });
  await mkdir(join(projectDir, "configs"), { recursive: true });
  await mkdir(join(projectDir, "node_modules", "shared-config"), { recursive: true });
  await symlink(workspaceTypescript, join(projectDir, "node_modules", "typescript"), "dir");
  await writeFile(
    join(projectDir, "package.json"),
    '{"name":"fixture-app","type":"module"}\n',
    "utf8",
  );
  await writeFile(join(projectDir, "src", "main", "app.ts"), "export const app = true;\n", "utf8");
  await writeFile(
    join(projectDir, "src", "worker", "worker.ts"),
    "export const worker = true;\n",
    "utf8",
  );
  await writeFile(
    join(projectDir, "src", "renderer", "ignored.ts"),
    "export const ignored = true;\n",
    "utf8",
  );
  await writeFile(
    join(projectDir, "node_modules", "shared-config", "package.json"),
    '{"name":"shared-config"}\n',
    "utf8",
  );
}
