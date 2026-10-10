#!/usr/bin/env node
import {
  cpSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: create-sewed <directory> [--name <package-name>]";
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const template = join(packageRoot, "template");

/**
 * @typedef {{ directory: string; name?: string }} ScaffoldOptions
 * @param {readonly string[]} argv
 * @returns {{ kind: "help" } | { kind: "error"; error: string } | { kind: "create"; options: ScaffoldOptions }}
 */
const parse = (argv) => {
  let directory;
  let name;
  const arguments_ = argv.values();
  for (const argument of arguments_) {
    if (argument === "--name") {
      const next = arguments_.next();
      if (next.done || next.value.startsWith("-"))
        return { kind: "error", error: "--name requires a package name" };
      name = next.value;
    } else if (argument === "--help" || argument === "-h") return { kind: "help" };
    else if (argument.startsWith("-"))
      return { kind: "error", error: `Unknown option ${argument}` };
    else if (directory === undefined) directory = argument;
    else return { kind: "error", error: `Unexpected argument ${argument}` };
  }
  if (directory === undefined) return { kind: "error", error: "A target directory is required" };
  return {
    kind: "create",
    options: { directory: resolve(directory), ...(name === undefined ? {} : { name }) },
  };
};

/** @param {string} name */
const validName = (name) => /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);

/** @param {ScaffoldOptions} options */
export const scaffold = ({ directory, name }) => {
  const packageName = name ?? basename(directory);
  if (!validName(packageName)) throw new Error(`Invalid package name ${packageName}`);
  if (existsSync(directory) && readdirSync(directory).length > 0)
    throw new Error(`${directory} exists and is not empty`);
  /** @type {unknown} */
  const own = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (
    own === null ||
    typeof own !== "object" ||
    !("version" in own) ||
    typeof own.version !== "string" ||
    own.version === ""
  )
    throw new Error("create-sewed package.json requires a version string");
  const mode = existsSync(directory) ? statSync(directory).mode & 0o777 : 0o777 & ~process.umask();
  mkdirSync(dirname(directory), { recursive: true });
  const staging = mkdtempSync(join(dirname(directory), ".create-sewed-"));
  let removedEmpty = false;
  try {
    cpSync(template, staging, { recursive: true });
    renameSync(join(staging, "_gitignore"), join(staging, ".gitignore"));
    for (const file of ["package.json", "README.md"]) {
      const path = join(staging, file);
      const source = readFileSync(path, "utf8")
        .replaceAll("{{name}}", packageName)
        .replaceAll("{{version}}", own.version);
      writeFileSync(path, source);
    }
    chmodSync(staging, mode);
    if (existsSync(directory)) {
      rmdirSync(directory);
      removedEmpty = true;
    }
    renameSync(staging, directory);
  } catch (error) {
    if (removedEmpty && !existsSync(directory)) mkdirSync(directory, { mode });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return { directory, packageName };
};

const main = () => {
  const options = parse(process.argv.slice(2));
  if (options.kind === "help") {
    console.log(usage);
    return 0;
  }
  if (options.kind === "error") {
    console.error(`${options.error}\n${usage}`);
    return 1;
  }
  try {
    const result = scaffold(options.options);
    console.log(`Created ${result.packageName} in ${result.directory}`);
    console.log("Next steps:");
    console.log(`  cd ${result.directory}`);
    console.log("  pnpm install");
    console.log("  pnpm dev");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

// A package manager's bin link and a symlinked directory both reach this file by another path.
if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  process.exitCode = main();
