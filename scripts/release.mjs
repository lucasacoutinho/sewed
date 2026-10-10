import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dependencyFields,
  readDependencies,
  readManifest,
  targets,
} from "./internal/package-manifest.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = path.join(root, "packages");
const template = path.join(packagesDir, "create", "template", "package.json");
/** @typedef {import("./internal/package-manifest.mjs").DependencyManifest} DependencyManifest */

/** @param {string} version */
const requireVersion = (version) => {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(
      version,
    );
  /** @param {string | undefined} part */
  const identifiers = (part) => (part === undefined ? [] : part.split("."));
  if (
    match === null ||
    match[0] !== version ||
    identifiers(match[4]).some((part) => part === "" || /^0\d+$/.test(part)) ||
    identifiers(match[5]).some((part) => part === "")
  )
    throw new Error(`Not a semantic version: ${version}`);
};

const usage = "Usage: release.mjs <check | version <semver> | effect <semver> | pack [dir]>";
/**
 * @param {readonly string[]} args
 * @returns {{ kind: "check" } | { kind: "version" | "effect"; version: string } | { kind: "pack"; destination: string }}
 */
const parse = (args) => {
  const [command, argument] = args;
  if (command === "check" && args.length === 1) return { kind: "check" };
  if (
    (command === "version" || command === "effect") &&
    args.length === 2 &&
    argument !== undefined
  ) {
    requireVersion(argument);
    return { kind: command, version: argument };
  }
  if (command === "pack" && (args.length === 1 || args.length === 2))
    return { kind: "pack", destination: argument ?? ".artifacts" };
  console.error(usage);
  process.exit(2);
};
const command = parse(process.argv.slice(2));

const manifests = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name, "package.json"))
  .map((file) => ({ file, pkg: readManifest(file) }));
for (const { file, pkg } of manifests) {
  try {
    requireVersion(pkg.version);
  } catch (error) {
    throw new Error(`${file} has an invalid version`, { cause: error });
  }
}
const names = new Set(manifests.map(({ pkg }) => pkg.name));
if (names.size !== manifests.length) throw new Error("Workspace package names must be unique");
const scaffold = { file: template, pkg: readDependencies(template) };

/** @param {string} range */
const isWorkspaceRange = (range) => range.startsWith("workspace:");

/** Tracked files, written in place: `git checkout` is the way back from a partial update. @param {Iterable<readonly [string, DependencyManifest]>} updates */
const writeManifests = (updates) => {
  for (const [file, pkg] of updates) writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
};

/** Every literal pin of a workspace package, wherever it appears. */
const siblingPins = function* () {
  for (const { file, pkg } of manifests) {
    for (const field of dependencyFields) {
      for (const [name, range] of Object.entries(pkg[field] ?? {})) {
        if (names.has(name) && !isWorkspaceRange(range)) yield { file, name, range };
      }
    }
  }
};

const effectPins = function* () {
  for (const { file, pkg } of [...manifests, scaffold]) {
    for (const field of dependencyFields) {
      const dependencies = pkg[field];
      const range = dependencies?.effect;
      if (dependencies !== undefined && range !== undefined)
        yield { file, pkg, dependencies, range };
    }
  }
};

/** @param {string} file */
const relative = (file) => path.relative(root, file);

/** The four things `tsc` emits per module. Longest first, so `.d.ts.map` is not read as `.map`. */
const emitted = [".d.ts.map", ".js.map", ".d.ts", ".js"];

/** @param {string} directory @returns {Generator<string>} */
const filesUnder = function* (directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesUnder(file);
    else yield file;
  }
};

/**
 * Incremental TypeScript builds retain outputs after their sources are deleted.
 * Reject them before packing. The separately bundled `lib/preload.cjs` is excluded.
 */
const orphanedOutputs = function* () {
  for (const { file } of manifests) {
    const package_ = path.dirname(file);
    const lib = path.join(package_, "lib");
    const src = path.join(package_, "src");
    if (!existsSync(lib) || !statSync(lib).isDirectory()) continue;
    for (const output of filesUnder(lib)) {
      const suffix = emitted.find((candidate) => output.endsWith(candidate));
      if (suffix === undefined) continue;
      const stem = path.join(src, path.relative(lib, output).slice(0, -suffix.length));
      if (!existsSync(`${stem}.ts`) && !existsSync(`${stem}.tsx`)) yield output;
    }
  }
};

const thirdPartyLicenses = path.join(root, "THIRD_PARTY_LICENSES.md");

/**
 * Every package whose `NOTICE` names `THIRD_PARTY_LICENSES.md` — pointing a reader at the file
 * for the retained attribution — but whose own package does not carry a byte-for-byte copy of it,
 * so the reader that follows the notice into a published tarball finds nothing there.
 */
const thirdPartyProblems = function* () {
  const canonical = existsSync(thirdPartyLicenses) ? readFileSync(thirdPartyLicenses) : undefined;
  for (const { file, pkg } of manifests) {
    const package_ = path.dirname(file);
    const notice = path.join(package_, "NOTICE");
    if (!existsSync(notice) || !readFileSync(notice, "utf8").includes("THIRD_PARTY_LICENSES.md")) {
      continue;
    }
    if (!(pkg.files ?? []).includes("THIRD_PARTY_LICENSES.md")) {
      yield `${relative(file)} does not list THIRD_PARTY_LICENSES.md in "files", but its NOTICE names it`;
      continue;
    }
    const copy = path.join(package_, "THIRD_PARTY_LICENSES.md");
    if (!existsSync(copy)) {
      yield `${relative(copy)} is missing, but ${relative(notice)} names it`;
    } else if (canonical === undefined || !readFileSync(copy).equals(canonical)) {
      yield `${relative(copy)} does not match the root THIRD_PARTY_LICENSES.md byte for byte`;
    }
  }
};

const missingPublicArtifacts = function* () {
  for (const { file, pkg } of manifests) {
    for (const target of new Set([...targets(pkg.exports), ...targets(pkg.bin)])) {
      const artifact = path.resolve(path.dirname(file), target);
      if (!existsSync(artifact) || !statSync(artifact).isFile())
        yield `${relative(artifact)} is missing (public export or executable of ${pkg.name})`;
    }
  }
};

/** @param {{ built?: boolean }} [options] */
const check = ({ built = true } = {}) => {
  const problems = [];
  if (built) {
    for (const output of orphanedOutputs()) {
      problems.push(`${relative(output)} is built from a source that no longer exists; delete it`);
    }
    problems.push(...thirdPartyProblems(), ...missingPublicArtifacts());
  }
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
  for (const effect of effects) requireVersion(effect);
  if (effects.size !== 1) {
    problems.push(`effect pins differ: ${[...effects].join(", ")}`);
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`packages ${version}, effect ${[...effects][0]}`);
};

/** @param {string} version */
const setVersion = (version) => {
  for (const { pkg } of manifests) {
    pkg.version = version;
    for (const field of dependencyFields) {
      const dependencies = pkg[field];
      if (dependencies === undefined) continue;
      for (const [name, range] of Object.entries(dependencies)) {
        if (names.has(name) && !isWorkspaceRange(range)) dependencies[name] = version;
      }
    }
  }
  writeManifests(manifests.map(({ file, pkg }) => [file, pkg]));
  console.log(`packages ${version}`);
};

/** @param {string} version */
const setEffect = (version) => {
  const search = spawnSync(
    "git",
    ["grep", "-n", "-E", "4\\.0\\.0-rc\\.[0-9]+", "--", "README.md", "docs", "website/src"],
    { cwd: root, encoding: "utf8" },
  );
  if (search.error) throw search.error;
  if (search.status !== 0 && search.status !== 1)
    throw new Error(`Could not inspect Effect version mentions: ${search.stderr}`);
  /** @type {Map<string, DependencyManifest>} */
  const changed = new Map();
  for (const pin of effectPins()) {
    pin.dependencies.effect = version;
    changed.set(pin.file, pin.pkg);
  }
  writeManifests(changed);
  console.log(`effect ${version} in ${changed.size} manifests; run pnpm install`);
  const mentions = search.stdout
    .split("\n")
    .filter((line) => line !== "" && !line.includes(version));
  if (mentions.length > 0)
    console.log(`other release candidates mentioned:\n${mentions.join("\n")}`);
};

/** @param {string} destination */
const pack = async (destination) => {
  const dir = path.resolve(root, destination);
  check({ built: false });
  const { xSync } = await import("tinyexec");
  xSync("pnpm", ["build"], {
    nodePath: false,
    throwOnError: true,
    nodeOptions: { cwd: root, stdio: "inherit" },
  });
  check();
  mkdirSync(dir, { recursive: true });
  for (const { file } of manifests) {
    const { stdout } = xSync("pnpm", ["pack", "--pack-destination", dir], {
      nodePath: false,
      throwOnError: true,
      nodeOptions: { cwd: path.dirname(file) },
    });
    const artifact = stdout.trim().split("\n").pop();
    if (artifact === undefined || artifact === "")
      throw new Error(`Packer returned no artifact for ${relative(file)}`);
    console.log(path.relative(root, artifact));
  }
};

switch (command.kind) {
  case "check":
    check();
    break;
  case "version":
    setVersion(command.version);
    break;
  case "effect":
    setEffect(command.version);
    break;
  case "pack":
    await pack(command.destination);
    break;
}
