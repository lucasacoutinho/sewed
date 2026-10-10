import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { checkTypescriptVersion, emitProject, resolveProject } from "../src/internal/tsc.js";

const workspaceTypescript = fileURLToPath(
  new URL("../../../node_modules/typescript", import.meta.url),
);

test("compiler paths use Windows separators and retain volume roots", async () => {
  await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      "--experimental-test-module-mocks",
      "--test",
      "--test-timeout=10000",
      fileURLToPath(new URL("./windows-paths-fixture.ts", import.meta.url)),
    ],
    { timeout: 20000 },
  );
});

test("checkTypescriptVersion accepts a version in the supported >=7 <8 range", () => {
  assert.equal(checkTypescriptVersion({ version: "7.0.2" }, "/fake/package.json"), "7.0.2");
  assert.equal(checkTypescriptVersion({ version: "7.9.9" }, "/fake/package.json"), "7.9.9");
});

test("checkTypescriptVersion refuses a version outside >=7 <8, naming it and its location", () => {
  assert.throws(
    () => checkTypescriptVersion({ version: "6.0.3" }, "/fake/package.json"),
    /@sewed\/vite requires TypeScript >=7 <8 in the consumer project; found 6\.0\.3 at \/fake\/package\.json/,
  );
  assert.throws(
    () => checkTypescriptVersion({ version: "8.0.0" }, "/fake/package.json"),
    /found 8\.0\.0/,
  );
  assert.throws(
    () => checkTypescriptVersion({}, "/fake/package.json"),
    /found an unreadable version/,
  );
});

test("tracks JSONC array and package config extends without changing quoted literals", async () => {
  const projectDir = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-tsc-config-")));
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
  const projectDir = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-tsc-files-")));
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

test(
  "main casing must match an included source on POSIX hosts",
  { skip: process.platform === "win32" },
  async () => {
    const projectDir = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-tsc-main-case-")));
    try {
      await writeFixture(projectDir);
      await writeFile(
        join(projectDir, "tsconfig.json"),
        '{"compilerOptions":{"module":"NodeNext","rootDir":"src"},"files":["src/main/app.ts"]}\n',
      );
      await assert.rejects(
        resolveProject({
          projectDir,
          tsconfig: "tsconfig.json",
          main: "src/main/App.ts",
          signal: new AbortController().signal,
        }),
        /main src\/main\/App\.ts is not included/,
      );
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  },
);

test("inferred rootDir includes imported sources outside files", async () => {
  const projectDir = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-tsc-inferred-root-")));
  try {
    await writeFixture(projectDir);
    await writeFile(
      join(projectDir, "tsconfig.json"),
      '{"compilerOptions":{"module":"NodeNext"},"files":["src/main/app.ts"]}\n',
    );
    await writeFile(
      join(projectDir, "src/main/app.ts"),
      'import { worker } from "../worker/worker.js"; export const app = worker;\n',
    );
    const project = await resolveProject({
      projectDir,
      tsconfig: "tsconfig.json",
      main: "src/main/app.ts",
      signal: new AbortController().signal,
    });
    assert.equal(project.rootDir, join(projectDir, "src"));
    const emitted = await emitProject(
      project,
      join(projectDir, "stage"),
      new AbortController().signal,
    );
    assert.equal(emitted.mainFile, join(projectDir, "stage/main/app.js"));
    assert.match(await readFile(join(projectDir, "stage/worker/worker.js"), "utf8"), /worker/);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("rejects preserve JSX for an ESM main TSX project", async () => {
  const projectDir = await realpath(
    await mkdtemp(join(tmpdir(), "sewed-vite-tsc-jsx-preserve-main-")),
  );
  try {
    await writeFixture(projectDir);
    await writeFile(
      join(projectDir, "tsconfig.json"),
      '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","rootDir":"src","jsx":"preserve"},"files":["src/main/app.tsx","src/worker/dependency.tsx"]}\n',
      "utf8",
    );
    await writeFile(
      join(projectDir, "src", "main", "app.tsx"),
      "export const app = <main />;\n",
      "utf8",
    );
    await writeFile(
      join(projectDir, "src", "worker", "dependency.tsx"),
      "export const dependency = <main />;\n",
      "utf8",
    );

    await assert.rejects(
      resolveProject({
        projectDir,
        tsconfig: "tsconfig.json",
        main: "src/main/app.tsx",
        signal: new AbortController().signal,
      }),
      /jsx: "preserve".*Electron's main runtime needs transformed JavaScript.*react-jsx/s,
    );
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("rejects preserve JSX when only an included dependency is TSX", async () => {
  const projectDir = await realpath(
    await mkdtemp(join(tmpdir(), "sewed-vite-tsc-jsx-preserve-dependency-")),
  );
  try {
    await writeFixture(projectDir);
    await writeFile(
      join(projectDir, "tsconfig.json"),
      '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","rootDir":"src","jsx":"preserve"},"files":["src/main/app.ts","src/worker/dependency.tsx"]}\n',
      "utf8",
    );
    await writeFile(
      join(projectDir, "src", "worker", "dependency.tsx"),
      "export const dependency = <main />;\n",
      "utf8",
    );

    await assert.rejects(
      resolveProject({
        projectDir,
        tsconfig: "tsconfig.json",
        main: "src/main/app.ts",
        signal: new AbortController().signal,
      }),
      /jsx: "preserve".*every included \.tsx file.*react-jsx/s,
    );
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("rejects imported TSX under preserve before anything is staged", async () => {
  const projectDir = await realpath(
    await mkdtemp(join(tmpdir(), "sewed-vite-tsc-jsx-preserve-imported-")),
  );
  try {
    await writeFixture(projectDir);
    await writeFile(
      join(projectDir, "tsconfig.json"),
      '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","rootDir":"src","jsx":"preserve"},"files":["src/main/app.ts"]}\n',
      "utf8",
    );
    await writeFile(
      join(projectDir, "src", "main", "app.ts"),
      'import { dependency } from "../worker/dependency.js";\nexport const app = dependency;\n',
      "utf8",
    );
    await writeFile(
      join(projectDir, "src", "worker", "dependency.tsx"),
      "export const dependency = true;\n",
      "utf8",
    );

    await assert.rejects(
      resolveProject({
        projectDir,
        tsconfig: "tsconfig.json",
        main: "src/main/app.ts",
        signal: new AbortController().signal,
      }),
      /jsx: "preserve".*Electron's main runtime needs transformed JavaScript.*react-jsx/s,
    );
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("transformed JSX stages a JavaScript Electron entry", async () => {
  const projectDir = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-tsc-jsx-transform-")));
  try {
    await writeFixture(projectDir);
    const sourceDir = join(projectDir, "src");
    await mkdir(join(sourceDir, "types"), { recursive: true });
    await writeFile(
      join(projectDir, "tsconfig.json"),
      '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","rootDir":"src","jsx":"react-jsx"},"include":["src/**/*.tsx","src/**/*.d.ts"]}\n',
      "utf8",
    );
    await writeFile(
      join(sourceDir, "main", "app.tsx"),
      "export const app = <main>Hello</main>;\n",
      "utf8",
    );
    await writeFile(
      join(sourceDir, "types", "jsx-runtime.d.ts"),
      'declare module "react/jsx-runtime" { export namespace JSX { interface Element {} interface IntrinsicElements { main: { children?: string } } } export function jsx(type: unknown, props: unknown): JSX.Element; export function jsxs(type: unknown, props: unknown): JSX.Element; }\n',
      "utf8",
    );

    const project = await resolveProject({
      projectDir,
      tsconfig: "tsconfig.json",
      main: "src/main/app.tsx",
      signal: new AbortController().signal,
    });
    const stageDir = join(projectDir, "stage");
    const emitted = await emitProject(project, stageDir, new AbortController().signal);

    assert.equal(emitted.mainFile, join(stageDir, "main", "app.js"));
    assert.match(await readFile(emitted.mainFile, "utf8"), /react\/jsx-runtime/);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("resolveProject refuses a resolved TypeScript outside >=7 <8, naming the version found", async () => {
  const projectDir = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-tsc-version-")));
  try {
    await mkdir(join(projectDir, "src", "main"), { recursive: true });
    await mkdir(join(projectDir, "node_modules", "typescript", "bin"), { recursive: true });
    // A fake TypeScript 6 install: the version check must throw before this ever runs, so no
    // real `tsc` binary is needed at `bin/tsc`.
    await writeFile(
      join(projectDir, "node_modules", "typescript", "package.json"),
      '{"name":"typescript","version":"6.0.3"}\n',
      "utf8",
    );
    await writeFile(
      join(projectDir, "package.json"),
      '{"name":"fixture-app","type":"module"}\n',
      "utf8",
    );
    await writeFile(
      join(projectDir, "tsconfig.json"),
      '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","rootDir":"src"}}\n',
      "utf8",
    );
    await writeFile(
      join(projectDir, "src", "main", "app.ts"),
      "export const app = true;\n",
      "utf8",
    );

    await assert.rejects(
      resolveProject({
        projectDir,
        tsconfig: "tsconfig.json",
        main: "src/main/app.ts",
        signal: new AbortController().signal,
      }),
      /@sewed\/vite requires TypeScript >=7 <8 in the consumer project; found 6\.0\.3/,
    );
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
  await symlink(workspaceTypescript, join(projectDir, "node_modules", "typescript"), "junction");
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
