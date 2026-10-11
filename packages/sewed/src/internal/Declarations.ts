import { Schema } from "effect";
import path from "node:path";
import * as Application from "../Application.ts";
import * as Declaration from "../Declaration.ts";
import { SewedError } from "../SewedError.ts";

const startupError = (message: string, cause: unknown) =>
  new SewedError({ code: "Startup", message, ...(cause === undefined ? {} : { cause }) });

/**
 * Applies `App.run`'s declarations in order: a thunk is called for its declaration where it
 * stands, then the declaration's step runs. A non-empty list is refused outright once
 * `options.isReady()` answers true — Electron's pre-ready calls apply silently or throw once
 * readiness has passed, so a declaration made too late would otherwise look like it worked. The
 * first failure after that stops the walk and is returned as `Startup`, naming the declaration —
 * or the position, for a thunk that threw before it had one. `App.run` exits on any failure, so
 * nothing after one is applied.
 */
export const apply = (
  entries: readonly Declaration.Entry[],
  options: { readonly isReady: () => boolean },
): SewedError | undefined => {
  if (entries.length > 0 && options.isReady())
    return startupError(
      "App.run was called after Electron was ready, so its declarations cannot apply. Call App.run in the entry module's first synchronous pass, or after a top-level await in an ES-module entry",
      undefined,
    );
  for (const [index, entry] of entries.entries()) {
    let value: Declaration.Declaration;
    if (typeof entry === "function") {
      try {
        value = entry();
      } catch (cause) {
        return startupError(`Declaration ${index} could not be produced`, cause);
      }
    } else value = entry;
    const definition = Declaration.definition(value);
    if (definition === undefined)
      return startupError(`Declaration ${index} was not made by Declaration.make`, undefined);
    try {
      definition.apply();
    } catch (cause) {
      return startupError(`Could not apply declaration "${definition.name}"`, cause);
    }
  }
  return undefined;
};

// Each factory takes the slice of Electron's `app` it uses, so the unit suite drives it with a
// structural fake and the one line left in the main module binds it to the real one.

export interface CommandLineNative {
  appendSwitch(name: string, value?: string): void;
  appendArgument(value: string): void;
  removeSwitch(name: string): void;
}
const decodeSwitch = Schema.decodeUnknownSync(Application.CommandLineSwitch);
export const commandLine = (
  native: CommandLineNative,
  flag: Application.CommandLineSwitch,
): Declaration.Declaration =>
  Declaration.make(`command-line switch ${String(flag.name)}`, () => {
    const value = decodeSwitch(flag);
    if (value.value === undefined) native.appendSwitch(value.name);
    else native.appendSwitch(value.name, value.value);
  });

const decodeArgument = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
/** Appends one bare argument to Chromium's command line, after its switches. */
export const commandLineArgument = (
  native: CommandLineNative,
  value: string,
): Declaration.Declaration =>
  Declaration.make("command-line argument", () => {
    native.appendArgument(decodeArgument(value));
  });

const decodeSwitchName = Schema.decodeUnknownSync(Application.CommandLineSwitch.fields.name);
/** Removes a switch from Chromium's command line, whoever put it there. */
export const commandLineRemoval = (
  native: CommandLineNative,
  name: string,
): Declaration.Declaration =>
  Declaration.make(`command-line switch removal ${String(name)}`, () => {
    native.removeSwitch(decodeSwitchName(name));
  });

export interface PathsNative {
  setPath(name: Application.PathName, path: string): void;
  ensureDirectory(path: string): void;
}
/** A partial table of application paths; `Schema.Record` over a literal union would require every key. */
export type PathTable = { readonly [Name in Application.PathName]?: string };
const decodePathName = Schema.decodeUnknownSync(Application.PathName);
const decodePath = Schema.decodeUnknownSync(
  Schema.String.check(
    Schema.makeFilter((value) => path.isAbsolute(value) || "Declared paths must be absolute"),
  ),
);
// `exe` and `module` name the running binary and its module file, not a directory Sewed should
// create.
const filePathNames: ReadonlySet<Application.PathName> = new Set(["exe", "module"]);
/**
 * A declared directory exists when the program starts: every entry is decoded first, then every
 * declared directory is created (recursively, in declaration order) before any path is set, so a
 * create failure leaves every path unset. `exe` and `module` are files and are never created.
 */
export const paths = (native: PathsNative, table: PathTable): Declaration.Declaration =>
  Declaration.make("paths", () => {
    const entries = Object.entries(table).map(
      ([name, path]) => [decodePathName(name), decodePath(path)] as const,
    );
    for (const [name, path] of entries) {
      if (filePathNames.has(name)) continue;
      try {
        native.ensureDirectory(path);
      } catch (cause) {
        throw new Error(`Could not create the directory declared for "${name}" at "${path}"`, {
          cause,
        });
      }
    }
    for (const [name, path] of entries) native.setPath(name, path);
  });

export interface GpuNative {
  disableHardwareAcceleration(): void;
  disableDomainBlockingFor3DAPIs(): void;
}
const decodeGpu = Schema.decodeUnknownSync(Application.Gpu);
export const gpu = (native: GpuNative, options: Application.Gpu): Declaration.Declaration =>
  Declaration.make("gpu", () => {
    const value = decodeGpu(options);
    if (!value.acceleration) native.disableHardwareAcceleration();
    if (value.domainBlockingFor3DAPIs === false) native.disableDomainBlockingFor3DAPIs();
  });

export interface IdentityNative {
  setAppUserModelId(id: string): void;
  setName(name: string): void;
  setDesktopName(name: string): void;
  enableSandbox(): void;
}
const decodeIdentity = Schema.decodeUnknownSync(Application.Identity);
export const identity = (
  native: IdentityNative,
  options: Application.Identity,
): Declaration.Declaration =>
  Declaration.make("application", () => {
    const value = decodeIdentity(options);
    if (value.userModelId !== undefined) native.setAppUserModelId(value.userModelId);
    if (value.name !== undefined) native.setName(value.name);
    // Electron has `setDesktopName` on Linux alone; elsewhere the option names nothing.
    if (value.desktopName !== undefined && process.platform === "linux")
      native.setDesktopName(value.desktopName);
    if (value.sandbox === true) native.enableSandbox();
  });
