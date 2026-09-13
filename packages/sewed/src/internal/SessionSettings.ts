import path from "node:path";
import { Effect, Schema } from "effect";
import * as Proxy from "../Proxy.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { Handle } from "./Session.ts";
import { resolve } from "./Session.ts";

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
export const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });
export const resolved = (
  handle: Handle,
): Effect.Effect<Electron.Session, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => resolve(handle),
      catch: (cause) => nativeError("Unknown session handle", cause),
    }),
  );
export const operation = <A>(
  handle: Handle,
  message: string,
  run: (native: Electron.Session) => A,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(resolved(handle), (native) =>
    Effect.try({
      try: () => run(native),
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );
export const asynchronous = <A>(
  handle: Handle,
  message: string,
  run: (native: Electron.Session) => Promise<A>,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(resolved(handle), (native) =>
    Effect.tryPromise({
      try: () => run(native),
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );

const decodeProxy = Schema.decodeUnknownSync(Proxy.Config);
export const setProxy = (
  handle: Handle,
  config: Proxy.Config,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid proxy configuration", () => decodeProxy(config)),
    (value) => asynchronous(handle, "Could not set proxy", (native) => native.setProxy(value)),
  );

export const resolveProxy = (
  handle: Handle,
  url: string,
): Effect.Effect<string, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid URL", () => new URL(url).href),
    (href) =>
      asynchronous(handle, "Could not resolve proxy", (native) => native.resolveProxy(href)),
  );

export interface SpellChecker {
  readonly enabled: boolean;
  readonly languages: readonly string[];
  readonly available: readonly string[];
}
export const spellChecker = (
  handle: Handle,
): Effect.Effect<SpellChecker, SewedError, MainContext> =>
  operation(handle, "Could not read spell checker settings", (native) => ({
    enabled: native.isSpellCheckerEnabled(),
    languages: native.getSpellCheckerLanguages(),
    available: native.availableSpellCheckerLanguages,
  }));

const decodeSpellChecker = Schema.decodeUnknownSync(
  Schema.Struct({
    enabled: Schema.optionalKey(Schema.Boolean),
    languages: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  }),
);
export const setSpellChecker = (
  handle: Handle,
  settings: { readonly enabled?: boolean; readonly languages?: readonly string[] },
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid spell checker settings", () => decodeSpellChecker(settings)),
    (value) =>
      operation(handle, "Could not update spell checker", (native) => {
        if (value.languages !== undefined) native.setSpellCheckerLanguages([...value.languages]);
        if (value.enabled !== undefined) native.setSpellCheckerEnabled(value.enabled);
      }),
  );

export const clearCache = (handle: Handle): Effect.Effect<void, SewedError, MainContext> =>
  asynchronous(handle, "Could not clear cache", (native) => native.clearCache());
export const cacheSize = (handle: Handle): Effect.Effect<number, SewedError, MainContext> =>
  asynchronous(handle, "Could not read cache size", (native) => native.getCacheSize());

export const userAgent = (handle: Handle): Effect.Effect<string, SewedError, MainContext> =>
  operation(handle, "Could not read user agent", (native) => native.getUserAgent());
const decodeText = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
export const setUserAgent = (
  handle: Handle,
  value: string,
  acceptLanguages?: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded(
      "Invalid user agent",
      () =>
        [
          decodeText(value),
          acceptLanguages === undefined ? undefined : decodeText(acceptLanguages),
        ] as const,
    ),
    ([agent, languages]) =>
      operation(handle, "Could not set user agent", (native) => {
        native.setUserAgent(agent, languages);
      }),
  );

export const setDownloadPath = (
  handle: Handle,
  directory: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Download path must be absolute", () => {
      if (!path.isAbsolute(directory)) throw protocolError("Download path must be absolute");
      return path.resolve(directory);
    }),
    (value) =>
      operation(handle, "Could not set download path", (native) => {
        native.setDownloadPath(value);
      }),
  );
