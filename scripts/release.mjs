import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = path.join(root, "packages");
const template = path.join(packagesDir, "create", "template", "package.json");
const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const manifests = readdirSync(packagesDir)
  .map((name) => path.join(packagesDir, name, "package.json"))
  .map((file) => ({ file, pkg: readJson(file) }));
const names = new Set(manifests.map(({ pkg }) => pkg.name));

const isWorkspaceRange = (range) => range.startsWith("workspace:");

/** Every literal pin of a workspace package, wherever it appears. */
const siblingPins = function* () {
  for (const { file, pkg } of manifests) {
    for (const field of fields) {
      for (const [name, range] of Object.entries(pkg[field] ?? {})) {
        if (names.has(name) && !isWorkspaceRange(range)) yield { file, pkg, field, name, range };
      }
    }
  }
};

const effectPins = function* () {
  for (const { file, pkg } of [...manifests, { file: template, pkg: readJson(template) }]) {
    for (const field of fields) {
      const range = pkg[field]?.effect;
      if (range !== undefined) yield { file, pkg, field, range };
    }
  }
};

const relative = (file) => path.relative(root, file);

const check = () => {
  const problems = [];
  const versions = new Set(manifests.map(({ pkg }) => pkg.version));
  if (versions.size !== 1) {
    problems.push(`package versions differ: ${[...versions].join(", ")}`);
  }
  const [version] = versions;
  for (const pin of siblingPins()) {
    if (pin.range !== version) {
      problems.push(`${relative(pin.file)} pins ${pin.name} to ${pin.range}, expected ${version}`);
    }
  }
  const effects = new Set([...effectPins()].map((pin) => pin.range));
  if (effects.size !== 1) {
    problems.push(`effect pins differ: ${[...effects].join(", ")}`);
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`packages ${version}, effect ${[...effects][0]}`);
};

const setVersion = (version) => {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Not a semantic version: ${version}`);
  }
  for (const { file, pkg } of manifests) {
    pkg.version = version;
    for (const field of fields) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        if (names.has(name) && !isWorkspaceRange(pkg[field][name])) pkg[field][name] = version;
      }
    }
    writeJson(file, pkg);
  }
  console.log(`packages ${version}`);
};

const setEffect = (version) => {
  const seen = new Set();
  for (const pin of effectPins()) {
    pin.pkg[pin.field].effect = version;
    if (!seen.has(pin.file)) {
      seen.add(pin.file);
      writeJson(pin.file, pin.pkg);
    }
  }
  for (const { file, pkg } of manifests) {
    if (seen.has(file)) continue;
    for (const field of fields) if (pkg[field]?.effect !== undefined) writeJson(file, pkg);
  }
  console.log(`effect ${version} in ${seen.size} manifests; run pnpm install`);
  const mentions = execFileSync(
    "git",
    ["grep", "-n", "-E", "4\\.0\\.0-rc\\.[0-9]+", "--", "README.md", "docs", "website/src"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter((line) => line !== "" && !line.includes(version));
  if (mentions.length > 0)
    console.log(`other release candidates mentioned:\n${mentions.join("\n")}`);
};

const pack = (destination) => {
  const dir = path.resolve(root, destination);
  mkdirSync(dir, { recursive: true });
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
  for (const { file } of manifests) {
    const output = execFileSync("pnpm", ["pack", "--pack-destination", dir], {
      cwd: path.dirname(file),
      encoding: "utf8",
    });
    console.log(path.relative(root, output.trim().split("\n").at(-1)));
  }
};

const [command, argument] = process.argv.slice(2);
switch (command) {
  case "check":
    check();
    break;
  case "version":
    if (!argument) throw new Error("Usage: release.mjs version <semver>");
    setVersion(argument);
    break;
  case "effect":
    if (!argument) throw new Error("Usage: release.mjs effect <semver>");
    setEffect(argument);
    break;
  case "pack":
    pack(argument ?? ".artifacts");
    break;
  default:
    console.error("Usage: release.mjs <check | version <semver> | effect <semver> | pack [dir]>");
    process.exit(2);
}
