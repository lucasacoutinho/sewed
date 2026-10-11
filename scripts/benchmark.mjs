import { xSync } from "tinyexec";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 2) {
  console.error("Usage: benchmark.mjs");
  process.exit(2);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), "sewed-performance-"));
/** @param {string} command @param {readonly string[]} args */
const run = (command, args) =>
  xSync(command, args, {
    nodePath: false,
    throwOnError: true,
    nodeOptions: { cwd: consumer, stdio: "inherit" },
  });

try {
  cpSync(join(root, "scripts", "benchmark"), consumer, { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "sewed-performance-consumer", private: true, type: "module" }),
  );
  const modules = join(consumer, "node_modules");
  mkdirSync(modules);
  symlinkSync(join(root, "packages", "sewed"), join(modules, "sewed"), "dir");
  symlinkSync(
    join(root, "packages", "sewed", "node_modules", "effect"),
    join(modules, "effect"),
    "dir",
  );
  symlinkSync(join(root, "node_modules", "@types"), join(modules, "@types"), "dir");
  symlinkSync(join(root, "node_modules", "electron"), join(modules, "electron"), "dir");
  run(join(root, "node_modules", ".bin", "tsc"), [
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--allowJs",
    "--checkJs",
    "--noUncheckedIndexedAccess",
    "--exactOptionalPropertyTypes",
    "--noUnusedLocals",
    "--noUnusedParameters",
    "--verbatimModuleSyntax",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2023",
    "--types",
    "node",
    "consumer.mjs",
    "protocol.mjs",
    "worker-json.mjs",
    "worker-binary.mjs",
  ]);
  run(process.execPath, ["--random-seed=42", "consumer.mjs"]);
  run(join(root, "node_modules", ".bin", "esbuild"), [
    "electron-renderer.mjs",
    "--bundle",
    "--platform=browser",
    "--format=esm",
    "--outfile=electron-renderer.js",
  ]);
  run(join(root, "node_modules", ".bin", "electron"), [
    "--js-flags=--random-seed=42",
    ...(process.platform === "linux" ? ["--ozone-platform=x11"] : []),
    "electron-main.mjs",
  ]);
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
