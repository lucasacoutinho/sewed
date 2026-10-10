import assert from "node:assert/strict";
import { win32 } from "node:path";
import { mock, test } from "node:test";

let sourceFiles: readonly string[] = [];
let rootDir: string | undefined;
const typescriptManifest = "C:\\tools\\typescript\\package.json";
const dependency = "C:/tools/node_modules/typescript/lib/lib.es2023.d.ts";
const unexpectedFileOperation = () => assert.fail("Unexpected filesystem operation");

mock.module("node:path", { namedExports: win32 });
mock.module("node:module", {
  namedExports: { createRequire: () => ({ resolve: () => typescriptManifest }) },
});
mock.module("node:fs/promises", {
  namedExports: {
    access: unexpectedFileOperation,
    mkdir: unexpectedFileOperation,
    readdir: unexpectedFileOperation,
    rm: unexpectedFileOperation,
    stat: unexpectedFileOperation,
    writeFile: unexpectedFileOperation,
    readFile: async (file: string) => {
      if (file === typescriptManifest) return '{"version":"7.0.2"}';
      if (win32.basename(file) === "package.json") return '{"type":"module"}';
      assert.equal(win32.basename(file), "tsconfig.json");
      return "{}";
    },
  },
});
mock.module("../lib/internal/process.js", {
  namedExports: {
    runCommand: async (_command: string, args: readonly string[]) => {
      const stdout = args.includes("--showConfig")
        ? JSON.stringify({ compilerOptions: { rootDir }, files: sourceFiles, include: [] })
        : args.includes("--listFilesOnly")
          ? [...sourceFiles, dependency].join("\r\n") + "\r\n"
          : assert.fail("Unexpected compiler command");
      return { code: 0, signal: null, stdout, stderr: "", error: undefined };
    },
  },
});

const { resolveProject } = await import("../lib/internal/tsc.js");
const resolve = (projectDir: string, main: string) =>
  resolveProject({
    projectDir,
    main,
    tsconfig: "tsconfig.json",
    signal: new AbortController().signal,
  });

for (const scenario of [
  {
    name: "forward slashes",
    files: ["C:/app/src/main.ts", "C:/app/src/nested/worker.ts"],
    projectDir: "C:\\app",
    root: "C:\\app\\src",
  },
  {
    name: "backslashes",
    files: ["C:\\app\\src\\main.ts", "C:\\app\\src\\nested\\worker.ts"],
    projectDir: "C:\\app",
    root: "C:\\app\\src",
  },
  {
    name: "mixed separators",
    files: ["C:/app/src/main.ts", "C:\\app\\src\\nested\\worker.ts"],
    projectDir: "C:\\app",
    root: "C:\\app\\src",
  },
  {
    name: "case differences",
    files: ["C:/app/src/main.ts", "c:/APP/SRC/nested/worker.ts"],
    projectDir: "C:\\app",
    root: "C:\\app\\src",
  },
  {
    name: "UNC share",
    files: ["//server/share/app/src/main.ts", "//server/share/app/src/nested/worker.ts"],
    projectDir: "\\\\server\\share\\app",
    root: "\\\\server\\share\\app\\src",
  },
  {
    name: "share root",
    files: ["\\\\server\\share\\main.ts", "\\\\server\\share\\nested\\worker.ts"],
    projectDir: "\\\\server\\share\\",
    root: "\\\\server\\share\\",
  },
  {
    name: "drive root",
    files: ["C:\\main.ts", "C:\\nested\\worker.ts"],
    projectDir: "C:\\",
    root: "C:\\",
  },
]) {
  test(`normalizes ${scenario.name} before inferring roots and watch files`, async () => {
    sourceFiles = scenario.files;
    rootDir = undefined;
    const main = scenario.files[0];
    assert.ok(main !== undefined);
    const project = await resolve(scenario.projectDir, win32.relative(scenario.projectDir, main));
    assert.equal(project.rootDir, scenario.root);
    assert.deepEqual(
      project.watchFiles,
      scenario.files.map((file) => win32.resolve(file)),
    );
    assert.deepEqual(project.files, project.watchFiles);
  });
}

test("normalizes watch files when rootDir is configured", async () => {
  sourceFiles = ["C:/app/src/main.ts", "C:/app/src/nested/worker.ts"];
  rootDir = "src";
  const project = await resolve("C:\\app", "src/main.ts");
  assert.equal(project.rootDir, "C:\\app\\src");
  assert.deepEqual(
    project.watchFiles,
    sourceFiles.map((file) => win32.resolve(file)),
  );
});

test("selects the compiler's main path when the request uses different casing", async () => {
  sourceFiles = ["C:/APP/src/Main.ts", "C:/APP/src/nested/worker.ts"];
  rootDir = "src";
  const project = await resolve("c:\\app", "src/main.ts");
  assert.equal(project.mainPath, "C:\\APP\\src\\Main.ts");
  assert.deepEqual(
    project.files,
    sourceFiles.map((file) => win32.resolve(file)),
  );
});

test("rejects sources on different drives without a common root", async () => {
  sourceFiles = ["C:/app/main.ts", "D:/shared/worker.ts"];
  rootDir = undefined;
  await assert.rejects(resolve("C:\\app", "main.ts"), /do not share a filesystem root/);
});

test("rejects a relative compiler path before normalization", async () => {
  sourceFiles = ["src/main.ts"];
  rootDir = undefined;
  await assert.rejects(resolve("C:\\app", "src/main.ts"), /invalid source list/);
});
