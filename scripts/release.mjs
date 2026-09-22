import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

/** The four things `tsc` emits per module. Longest first, so `.d.ts.map` is not read as `.map`. */
const emitted = [".d.ts.map", ".js.map", ".d.ts", ".js"];

const filesUnder = function* (directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesUnder(file);
    else yield file;
  }
};

/**
 * Every built module under a package's `lib/` whose source is gone from `src/`.
 *
 * `pnpm build` is `tsc -b`, which never deletes an output, and `pack` runs straight after it — so
 * renaming or deleting a source module leaves its four emitted files behind and *publishes* them,
 * with a source map pointing at a file that no longer exists. Nothing imports such a module and
 * `exports` does not reach `internal/`, so it is inert; what it costs is reproducibility. The
 * artifact stops being a function of the source, and "the installed library matches a fresh build"
 * becomes true only of an incremental build over the same dirty `lib`. This is the check that
 * refuses it, rather than a `rm -rf lib` in `pack` that would hide the mistake instead of naming it.
 *
 * Only `tsc`'s own output shapes are judged. `lib/preload.cjs` is bundled by
 * `scripts/build-preload.mjs` from `src/internal/preload.ts` and is deliberately not one of them.
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

const check = () => {
  const problems = [];
  for (const output of orphanedOutputs()) {
    problems.push(`${relative(output)} is built from a source that no longer exists; delete it`);
  }
  for (const problem of thirdPartyProblems()) problems.push(problem);
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
