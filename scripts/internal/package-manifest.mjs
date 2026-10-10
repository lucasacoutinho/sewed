import { readFileSync } from "node:fs";

/** @typedef {string | null | ExportTarget[] | { [condition: string]: ExportTarget }} ExportTarget */
/** @typedef {"dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies"} DependencyField */
/** @typedef {Partial<Record<DependencyField, Record<string, string>>> & Record<string, unknown>} DependencyManifest */
/**
 * @typedef {DependencyManifest & {
 *   name: string;
 *   version: string;
 *   exports?: Record<string, ExportTarget> | null;
 *   bin?: string | Record<string, string> | null;
 *   files?: string[];
 * }} PackageManifest
 */

/** @type {readonly DependencyField[]} */
export const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
/** @param {unknown} value @returns {value is Record<string, string>} */
const isStrings = (value) =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
/** @param {unknown} value @returns {value is ExportTarget} */
const isTarget = (value) =>
  typeof value === "string" ||
  value === null ||
  ((Array.isArray(value) || isRecord(value)) && Object.values(value).every(isTarget));
/** @param {unknown} value @returns {value is Record<string, ExportTarget>} */
const isExports = (value) => isRecord(value) && Object.values(value).every(isTarget);
/** @param {unknown} value @returns {value is string[]} */
const isFiles = (value) => Array.isArray(value) && value.every((file) => typeof file === "string");

/** @param {string} file */
export const readObject = (file) => {
  /** @type {unknown} */
  const value = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(value)) throw new Error(`${file} must contain an object`);
  return value;
};

/** A manifest whose dependency fields are checked and whose other fields are kept as written. @param {string} file @returns {DependencyManifest} */
export const readDependencies = (file) => {
  const pkg = readObject(file);
  /** @type {Partial<Record<DependencyField, Record<string, string>>>} */
  const dependencies = {};
  for (const field of dependencyFields) {
    const value = pkg[field];
    if (value === undefined) continue;
    if (!isStrings(value)) throw new Error(`${file} ${field} must map names to strings`);
    dependencies[field] = value;
  }
  return { ...pkg, ...dependencies };
};

/** @param {string} file @returns {PackageManifest} */
export const readManifest = (file) => {
  const pkg = readDependencies(file);
  const { name, version, exports, bin, files } = pkg;
  if (typeof name !== "string" || name === "" || typeof version !== "string" || version === "")
    throw new Error(`${file} requires a package name and version`);
  if (exports !== undefined && exports !== null && !isExports(exports))
    throw new Error(`${file} has invalid exports`);
  if (bin !== undefined && bin !== null && typeof bin !== "string" && !isStrings(bin))
    throw new Error(`${file} has invalid bin targets`);
  if (files !== undefined && !isFiles(files))
    throw new Error(`${file} files must be an array of strings`);
  return {
    ...pkg,
    name,
    version,
    ...(exports === undefined ? {} : { exports }),
    ...(bin === undefined ? {} : { bin }),
    ...(files === undefined ? {} : { files }),
  };
};

/** Every file an `exports` or `bin` value names, through its conditions. @param {unknown} value @returns {Generator<string>} */
export const targets = function* (value) {
  if (typeof value === "string") yield value;
  else if (value !== null && typeof value === "object")
    for (const target of Object.values(value)) yield* targets(target);
};

/** @param {PackageManifest} pkg @returns {[string, string][]} */
export const typedExports = (pkg) =>
  Object.entries(pkg.exports ?? {}).flatMap(([entry, target]) =>
    target !== null &&
    typeof target === "object" &&
    !Array.isArray(target) &&
    typeof target.types === "string"
      ? [[pkg.name + (entry === "." ? "" : entry.slice(1)), target.types]]
      : [],
  );
