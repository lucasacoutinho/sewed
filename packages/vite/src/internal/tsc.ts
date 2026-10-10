import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { runCommand } from "./process.js";

export interface ProjectInfo {
  readonly projectDir: string;
  readonly tsconfigPath: string;
  readonly typescriptCli: string;
  readonly rootDir: string;
  readonly mainPath: string;
  readonly includePatterns: readonly string[];
  readonly includeRoots: readonly string[];
  readonly files: readonly string[];
  readonly watchFiles: readonly string[];
  readonly configPaths: readonly string[];
  readonly packageType: "module" | "commonjs" | undefined;
  readonly packageName: string | undefined;
  readonly packageVersion: string | undefined;
  readonly productName: string | undefined;
  readonly jsx: string | undefined;
}

export interface EmittedProject {
  readonly stageDir: string;
  readonly mainFile: string;
}

interface ShowConfig {
  readonly compilerOptions: Record<string, unknown>;
  readonly files: readonly string[];
  readonly include: readonly string[];
}

interface ProjectOptions {
  readonly projectDir: string;
  readonly tsconfig: string;
  readonly main: string;
  readonly signal: AbortSignal;
  readonly onConfigPaths?: (paths: readonly string[]) => void;
}

interface ConfigObject {
  readonly value: Record<string, unknown>;
}

export async function resolveProject(options: ProjectOptions): Promise<ProjectInfo> {
  const tsconfigPath = resolve(options.projectDir, options.tsconfig);
  const typescriptCli = await resolveTypescriptCli(options.projectDir);
  const configPaths = await resolveConfigChain(tsconfigPath);
  options.onConfigPaths?.(configPaths);
  await rejectProjectReferences(configPaths);

  const showConfig = await readShowConfig({
    typescriptCli,
    projectDir: options.projectDir,
    tsconfigPath,
    signal: options.signal,
  });
  if (showConfig.files.length === 0) {
    throw new Error(
      `TypeScript project ${tsconfigPath} resolves no source files. Solution/project-reference configs are unsupported; point tsconfig at an emitting project.`,
    );
  }
  const jsx = stringValue(showConfig.compilerOptions.jsx);
  if (stringValue(showConfig.compilerOptions.outFile) !== undefined) {
    throw new Error(
      `@sewed/vite cannot stage a TypeScript project that uses outFile (${tsconfigPath}). Use a module-emitting config with outDir instead.`,
    );
  }

  const files = showConfig.files.map((file) => resolve(dirname(tsconfigPath), file));
  const programFiles = await readProgramFiles({
    typescriptCli,
    projectDir: options.projectDir,
    tsconfigPath,
    signal: options.signal,
  });
  const emittedFiles = programFiles.filter((file) => !/\.d\.[cm]?ts$/i.test(file));
  if (jsx === "preserve" && emittedFiles.some((file) => extname(file).toLowerCase() === ".tsx")) {
    throw new Error(
      `@sewed/vite cannot stage TypeScript project ${tsconfigPath} with jsx: "preserve" because Electron's main runtime needs transformed JavaScript for every included .tsx file. Set compilerOptions.jsx to a transform mode such as "react-jsx" or "react".`,
    );
  }
  const configuredRootDir = stringValue(showConfig.compilerOptions.rootDir);
  const rootDir = configuredRootDir
    ? resolve(dirname(tsconfigPath), configuredRootDir)
    : commonDirectory(emittedFiles.length === 0 ? files : emittedFiles);
  if (emittedFiles.some((file) => !isWithin(rootDir, file))) {
    throw new Error(
      `TypeScript project ${tsconfigPath} includes a source outside rootDir ${rootDir}. Set a rootDir that contains every emitted file before using @sewed/vite.`,
    );
  }

  const requestedMain = resolve(options.projectDir, options.main);
  const mainExtension = extname(requestedMain).toLowerCase();
  if (!isTypescriptExtension(mainExtension)) {
    throw new Error(
      `@sewed/vite main must be a TypeScript source path (received ${options.main}).`,
    );
  }
  const mainPath = files.find((file) => relative(file, requestedMain) === "");
  if (mainPath === undefined) {
    throw new Error(
      `@sewed/vite main ${options.main} is not included by ${options.tsconfig}; add it to files/include before starting Vite.`,
    );
  }

  const includePatterns = showConfig.include;
  const includeRoots = includePatterns.map((pattern) =>
    includeRoot(resolve(dirname(tsconfigPath), pattern)),
  );
  const packageMetadata = await readPackageMetadata(options.projectDir);
  return {
    projectDir: options.projectDir,
    tsconfigPath,
    typescriptCli,
    rootDir,
    mainPath,
    includePatterns,
    includeRoots,
    files,
    watchFiles: programFiles.filter((file) => !file.split(sep).includes("node_modules")),
    configPaths,
    ...packageMetadata,
    jsx,
  };
}

export async function emitProject(
  project: ProjectInfo,
  stageDir: string,
  signal: AbortSignal,
): Promise<EmittedProject> {
  await mkdir(stageDir, { recursive: true });
  try {
    const result = await runCommand(
      process.execPath,
      [
        project.typescriptCli,
        "-p",
        project.tsconfigPath,
        "--outDir",
        stageDir,
        "--rootDir",
        project.rootDir,
        "--noEmit",
        "false",
        "--emitDeclarationOnly",
        "false",
        "--composite",
        "false",
        "--incremental",
        "false",
        "--declaration",
        "false",
        "--declarationMap",
        "false",
        "--tsBuildInfoFile",
        join(stageDir, "tsconfig.tsbuildinfo"),
        "--noEmitOnError",
        "--pretty",
        "false",
      ],
      { cwd: project.projectDir, signal },
    );
    if (signal.aborted)
      throw new Error("TypeScript compilation was superseded by a newer source change");
    if (result.error !== undefined || result.code !== 0) {
      throw new Error(formatCommandFailure("TypeScript compilation failed", result));
    }
    const mainFile = join(
      stageDir,
      outputRelativePath(project.rootDir, project.mainPath, project.jsx),
    );
    try {
      await access(mainFile);
    } catch {
      throw new Error(
        `TypeScript emitted no Electron entry at ${mainFile}. Check the project's module and emit settings.`,
      );
    }
    await writePackageManifest(project, stageDir, project.mainPath);
    return { stageDir, mainFile };
  } catch (error) {
    await rmStage(stageDir);
    throw error;
  }
}

async function rmStage(stageDir: string): Promise<void> {
  await rm(stageDir, { recursive: true, force: true });
}

/** Whether a TypeScript `package.json`'s `version` falls in the supported `>=7 <8` range. */
export function isSupportedTypescriptVersion(version: string): boolean {
  return Number.parseInt(version, 10) === 7;
}

/**
 * Checks a resolved TypeScript's own `package.json` shape against the supported `>=7 <8` range,
 * returning its version or throwing naming `location` and the version found — the check `@sewed/vite`
 * runs at run time now that `typescript` is not a declared peer (pnpm otherwise warns about
 * whatever major version happens to already be installed, even outside `>=7 <8`, which nothing
 * here can suppress). Takes the parsed `package.json` directly, not a path, so a fake `{ version }`
 * exercises it with no filesystem.
 */
export function checkTypescriptVersion(
  packageJson: { readonly version?: unknown },
  location: string,
): string {
  const version = packageJson.version;
  if (typeof version !== "string" || !isSupportedTypescriptVersion(version)) {
    throw new Error(
      `@sewed/vite requires TypeScript >=7 <8 in the consumer project; found ${
        typeof version === "string" ? version : "an unreadable version"
      } at ${location}`,
    );
  }
  return version;
}

async function resolveTypescriptCli(projectDir: string): Promise<string> {
  const require = createRequire(join(projectDir, "package.json"));
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve("typescript/package.json");
  } catch {
    throw new Error(
      `@sewed/vite could not resolve TypeScript from ${projectDir}. Install TypeScript >=7 <8 in the consumer project.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (cause) {
    throw new Error(`@sewed/vite could not read ${packageJsonPath}`, { cause });
  }
  checkTypescriptVersion(isRecord(parsed) ? parsed : {}, packageJsonPath);
  return join(dirname(packageJsonPath), "bin", "tsc");
}

async function readShowConfig(options: {
  readonly typescriptCli: string;
  readonly projectDir: string;
  readonly tsconfigPath: string;
  readonly signal: AbortSignal;
}): Promise<ShowConfig> {
  const result = await runCommand(
    process.execPath,
    [options.typescriptCli, "-p", options.tsconfigPath, "--showConfig", "--pretty", "false"],
    { cwd: options.projectDir, signal: options.signal },
  );
  if (result.error !== undefined || result.code !== 0) {
    throw new Error(
      formatCommandFailure(`TypeScript could not read ${options.tsconfigPath}`, result),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`TypeScript returned invalid --showConfig JSON for ${options.tsconfigPath}.`);
  }
  if (!isRecord(parsed))
    throw new Error(
      `TypeScript returned an invalid --showConfig result for ${options.tsconfigPath}.`,
    );
  const compilerOptions = recordValue(parsed.compilerOptions);
  const files = stringArray(parsed.files);
  const include = stringArray(parsed.include);
  if (compilerOptions === undefined || files === undefined) {
    throw new Error(
      `TypeScript returned an incomplete --showConfig result for ${options.tsconfigPath}.`,
    );
  }
  return { compilerOptions, files, include: include ?? [] };
}

async function readProgramFiles(options: {
  readonly typescriptCli: string;
  readonly projectDir: string;
  readonly tsconfigPath: string;
  readonly signal: AbortSignal;
}): Promise<readonly string[]> {
  const result = await runCommand(
    process.execPath,
    [options.typescriptCli, "-p", options.tsconfigPath, "--listFilesOnly", "--pretty", "false"],
    { cwd: options.projectDir, signal: options.signal },
  );
  if (result.error !== undefined || result.code !== 0) {
    throw new Error(
      formatCommandFailure(`TypeScript could not list sources for ${options.tsconfigPath}`, result),
    );
  }
  const files = result.stdout.split(/\r?\n/).filter((file) => file !== "");
  if (files.some((file) => !isAbsolute(file))) {
    throw new Error(`TypeScript returned an invalid source list for ${options.tsconfigPath}.`);
  }
  return files.map((file) => resolve(file));
}

async function resolveConfigChain(tsconfigPath: string): Promise<readonly string[]> {
  const paths: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = async (configPath: string, depth: number): Promise<void> => {
    const normalizedPath = resolve(configPath);
    if (visiting.has(normalizedPath)) {
      throw new Error(`TypeScript config extends chain contains a cycle at ${normalizedPath}.`);
    }
    if (visited.has(normalizedPath)) return;
    if (depth >= 32) {
      throw new Error(
        `TypeScript config extends chain is deeper than 32 files at ${normalizedPath}.`,
      );
    }

    visited.add(normalizedPath);
    visiting.add(normalizedPath);
    paths.push(normalizedPath);
    const config = await readConfig(normalizedPath);
    const extendsValues = config === undefined ? [] : configExtendsValues(config.value.extends);
    for (const extendsValue of extendsValues) {
      const parentPath = await resolveExtends(normalizedPath, extendsValue);
      if (parentPath !== undefined) await visit(parentPath, depth + 1);
    }
    visiting.delete(normalizedPath);
  };

  await visit(tsconfigPath, 0);
  return paths;
}

async function rejectProjectReferences(configPaths: readonly string[]): Promise<void> {
  for (const configPath of configPaths) {
    const config = await readConfig(configPath);
    const references = config?.value.references;
    if (Array.isArray(references) && references.length > 0) {
      throw new Error(
        `@sewed/vite does not run solution/project-reference configs (${configPath}). Use a single emitting tsconfig with its dependencies already built.`,
      );
    }
  }
}

async function readConfig(configPath: string): Promise<ConfigObject | undefined> {
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(source));
  } catch {
    return undefined;
  }
  return isRecord(parsed) ? { value: parsed } : undefined;
}

async function resolveExtends(
  configPath: string,
  extendsValue: string,
): Promise<string | undefined> {
  const configDir = dirname(configPath);
  let candidates: readonly string[];
  if (extendsValue.startsWith(".") || isAbsolute(extendsValue)) {
    const candidate = resolve(configDir, extendsValue);
    candidates = extname(candidate) === "" ? [candidate, `${candidate}.json`] : [candidate];
  } else {
    const require = createRequire(configPath);
    const resolved: string[] = [];
    for (const request of [extendsValue, `${extendsValue}.json`, `${extendsValue}/tsconfig.json`]) {
      try {
        resolved.push(require.resolve(request));
      } catch {
        // TypeScript will report an unresolved package extends through --showConfig.
      }
    }
    candidates = resolved;
  }
  for (const path of candidates) {
    try {
      const details = await stat(path);
      if (details.isFile()) return path;
    } catch {
      // TypeScript will report an unresolved extends path through --showConfig.
    }
  }
  return undefined;
}

function configExtendsValues(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  return stringArray(value) ?? [];
}

async function readPackageMetadata(projectDir: string): Promise<{
  readonly packageType: "module" | "commonjs" | undefined;
  readonly packageName: string | undefined;
  readonly packageVersion: string | undefined;
  readonly productName: string | undefined;
}> {
  let packageJson: string;
  try {
    packageJson = await readFile(join(projectDir, "package.json"), "utf8");
  } catch {
    return {
      packageType: undefined,
      packageName: undefined,
      packageVersion: undefined,
      productName: undefined,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJson);
  } catch {
    return {
      packageType: undefined,
      packageName: undefined,
      packageVersion: undefined,
      productName: undefined,
    };
  }
  if (!isRecord(parsed)) {
    return {
      packageType: undefined,
      packageName: undefined,
      packageVersion: undefined,
      productName: undefined,
    };
  }
  const packageType = stringValue(parsed.type);
  return {
    packageType: packageType === "module" || packageType === "commonjs" ? packageType : undefined,
    packageName: stringValue(parsed.name),
    packageVersion: stringValue(parsed.version),
    productName: stringValue(parsed.productName),
  };
}

async function writePackageManifest(
  project: ProjectInfo,
  stageDir: string,
  mainPath: string,
): Promise<void> {
  const main = outputRelativePath(project.rootDir, mainPath, project.jsx).split(sep).join("/");
  const manifest = {
    name: project.packageName ?? "sewed-dev",
    version: project.packageVersion ?? "0.0.0",
    private: true,
    ...(project.packageType === undefined ? {} : { type: project.packageType }),
    ...(project.productName === undefined ? {} : { productName: project.productName }),
    main,
  };
  await writeFile(join(stageDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function outputRelativePath(rootDir: string, sourcePath: string, jsx: string | undefined): string {
  const sourceRelative = relative(rootDir, sourcePath);
  const extension = extname(sourceRelative).toLowerCase();
  let outputExtension = ".js";
  switch (extension) {
    case ".mts":
      outputExtension = ".mjs";
      break;
    case ".cts":
      outputExtension = ".cjs";
      break;
    case ".tsx":
      outputExtension = jsx === "preserve" ? ".jsx" : ".js";
      break;
  }
  return join(dirname(sourceRelative), `${basename(sourceRelative, extension)}${outputExtension}`);
}

function includeRoot(pattern: string): string {
  const magic = pattern.search(/[*!?[\]{}()]/);
  if (magic < 0) return pattern;
  const prefix = pattern.slice(0, magic);
  return prefix.endsWith(sep) ? prefix.slice(0, -1) : dirname(prefix);
}

function commonDirectory(files: readonly string[]): string {
  const first = files[0];
  if (first === undefined) throw new Error("TypeScript returned no source files");
  let root = dirname(first);
  for (const file of files.slice(1)) {
    while (!isWithin(root, file)) {
      const parent = dirname(root);
      if (parent === root) throw new Error("TypeScript sources do not share a filesystem root");
      root = parent;
    }
  }
  return root;
}

export function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function isTypescriptExtension(extension: string): boolean {
  return (
    extension === ".ts" || extension === ".tsx" || extension === ".mts" || extension === ".cts"
  );
}

function formatCommandFailure(
  prefix: string,
  result: {
    readonly stdout: string;
    readonly stderr: string;
    readonly error: Error | undefined;
  },
): string {
  const detail = result.stderr.trim() || result.stdout.trim() || result.error?.message;
  return detail === undefined || detail === "" ? prefix : `${prefix}:\n${detail}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripJsonComments(source: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n" || character === "\r") {
        lineComment = false;
        output += character;
      } else output += " ";
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        output += "  ";
        index += 1;
      } else output += character === "\n" || character === "\r" ? character : " ";
      continue;
    }
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === "/" && next === "/") {
      lineComment = true;
      output += "  ";
      index += 1;
    } else if (character === "/" && next === "*") {
      blockComment = true;
      output += "  ";
      index += 1;
    } else output += character;
  }
  return stripTrailingCommas(output);
}

function stripTrailingCommas(source: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === ",") {
      let next = index + 1;
      while (next < source.length && /\s/.test(source[next] ?? "")) next += 1;
      if (source[next] === "}" || source[next] === "]") continue;
    }
    output += character;
  }
  return output;
}
