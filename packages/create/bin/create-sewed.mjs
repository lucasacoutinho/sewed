#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: create-sewed <directory> [--name <package-name>]";
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const template = join(packageRoot, "template");
const own = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

const parse = (argv) => {
  let directory;
  let name;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--name") {
      name = argv[index + 1];
      index += 1;
    } else if (argument === "--help" || argument === "-h") return { help: true };
    else if (directory === undefined) directory = argument;
    else return { error: `Unexpected argument ${argument}` };
  }
  if (directory === undefined) return { error: "A target directory is required" };
  return { directory: resolve(directory), name };
};

const validName = (name) => /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);

export const scaffold = ({ directory, name }) => {
  const packageName = name ?? basename(directory);
  if (!validName(packageName)) throw new Error(`Invalid package name ${packageName}`);
  if (existsSync(directory) && readdirSync(directory).length > 0)
    throw new Error(`${directory} exists and is not empty`);
  mkdirSync(directory, { recursive: true });
  cpSync(template, directory, { recursive: true });
  renameSync(join(directory, "_gitignore"), join(directory, ".gitignore"));
  for (const file of ["package.json", "README.md"]) {
    const path = join(directory, file);
    const source = readFileSync(path, "utf8")
      .replaceAll("{{name}}", packageName)
      .replaceAll("{{version}}", own.version);
    writeFileSync(path, source);
  }
  return { directory, packageName };
};

const main = () => {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return 0;
  }
  if (options.error) {
    console.error(`${options.error}\n${usage}`);
    return 1;
  }
  try {
    const result = scaffold(options);
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

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main();
