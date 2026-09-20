import { Schema } from "effect";
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

export interface PathsNative {
  setPath(name: Application.PathName, path: string): void;
  ensureDirectory(path: string): void;
}
/** A partial table of application paths; `Schema.Record` over a literal union would require every key. */
export type PathTable = { readonly [Name in Application.PathName]?: string };
const decodePathName = Schema.decodeUnknownSync(Application.PathName);
const decodePath = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
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
}
const decodeGpu = Schema.decodeUnknownSync(Application.Gpu);
export const gpu = (native: GpuNative, options: Application.Gpu): Declaration.Declaration =>
  Declaration.make("gpu", () => {
    if (!decodeGpu(options).acceleration) native.disableHardwareAcceleration();
  });

export interface IdentityNative {
  setAppUserModelId(id: string): void;
}
const decodeIdentity = Schema.decodeUnknownSync(Application.Identity);
export const identity = (
  native: IdentityNative,
  options: Application.Identity,
): Declaration.Declaration =>
  Declaration.make("application", () => {
    const value = decodeIdentity(options);
    if (value.userModelId !== undefined) native.setAppUserModelId(value.userModelId);
  });
