import path from "node:path";
import { Effect, Schema } from "effect";
import * as Net from "../Net.ts";
import * as Proxy from "../Proxy.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { decoded, protocolError } from "./ProtocolError.ts";
import type { Handle } from "./Session.ts";
import { resolve } from "./Session.ts";

const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
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

/** Makes the session read its proxy configuration again, for example after a PAC file changed. */
export const forceReloadProxyConfig = (
  handle: Handle,
): Effect.Effect<void, SewedError, MainContext> =>
  asynchronous(handle, "Could not reload proxy configuration", (native) =>
    native.forceReloadProxyConfig(),
  );

const decodeWord = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
/** The words in the session's custom spell checker dictionary. */
export const spellCheckerWords = (
  handle: Handle,
): Effect.Effect<ReadonlyArray<string>, SewedError, MainContext> =>
  asynchronous(handle, "Could not read spell checker dictionary", (native) =>
    native.listWordsInSpellCheckerDictionary(),
  );
const dictionary = (
  handle: Handle,
  word: string,
  message: string,
  run: (native: Electron.Session, word: string) => boolean,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid spell checker word", () => decodeWord(word)),
    (value) =>
      operation(handle, message, (native) => {
        if (!run(native, value)) throw nativeError(message, undefined);
      }),
  );
/**
 * Adds a word to the session's custom spell checker dictionary. An in-memory session has no
 * dictionary to write, and the refusal is `Native`.
 */
export const addSpellCheckerWord = (
  handle: Handle,
  word: string,
): Effect.Effect<void, SewedError, MainContext> =>
  dictionary(handle, word, "Could not add spell checker word", (native, value) =>
    native.addWordToSpellCheckerDictionary(value),
  );
/** Removes a word from the session's custom spell checker dictionary. */
export const removeSpellCheckerWord = (
  handle: Handle,
  word: string,
): Effect.Effect<void, SewedError, MainContext> =>
  dictionary(handle, word, "Could not remove spell checker word", (native, value) =>
    native.removeWordFromSpellCheckerDictionary(value),
  );

export const clearCache = (handle: Handle): Effect.Effect<void, SewedError, MainContext> =>
  asynchronous(handle, "Could not clear cache", (native) => native.clearCache());
export const cacheSize = (handle: Handle): Effect.Effect<number, SewedError, MainContext> =>
  asynchronous(handle, "Could not read cache size", (native) => native.getCacheSize());

/** Forgets the HTTP credentials the session cached, so the next challenge asks again. */
export const clearAuthCache = (handle: Handle): Effect.Effect<void, SewedError, MainContext> =>
  asynchronous(handle, "Could not clear authentication cache", (native) => native.clearAuthCache());
/** Forgets the session's cached host resolutions. */
export const clearHostResolverCache = (
  handle: Handle,
): Effect.Effect<void, SewedError, MainContext> =>
  asynchronous(handle, "Could not clear host resolver cache", (native) =>
    native.clearHostResolverCache(),
  );
const decodeUrls = Schema.decodeUnknownSync(Schema.Array(Schema.String));
/**
 * Clears the generated code cache: for the resources at `urls`, or for every resource when none
 * is named.
 */
export const clearCodeCaches = (
  handle: Handle,
  urls: ReadonlyArray<string> = [],
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid code cache URLs", () => decodeUrls(urls).map((url) => new URL(url).href)),
    (value) =>
      asynchronous(handle, "Could not clear code caches", (native) =>
        native.clearCodeCaches({ urls: value }),
      ),
  );
/** Writes DOM storage that is still in memory to disk. */
export const flushStorage = (handle: Handle): Effect.Effect<void, SewedError, MainContext> =>
  operation(handle, "Could not flush session storage", (native) => {
    native.flushStorageData();
  });
/** The directory the session persists to, or `null` for an in-memory session. */
export const storagePath = (
  handle: Handle,
): Effect.Effect<string | null, SewedError, MainContext> =>
  operation(handle, "Could not read session storage path", (native) => native.getStoragePath());

const decodeEmulation = Schema.decodeUnknownSync(Net.Emulation);
/** Emulates the given network conditions for the session until {@link clearNetworkEmulation}. */
export const setNetworkEmulation = (
  handle: Handle,
  conditions: Net.Emulation,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid network emulation", () => decodeEmulation(conditions)),
    (value) =>
      operation(handle, "Could not emulate network conditions", (native) => {
        native.enableNetworkEmulation({ ...value });
      }),
  );
/** Returns the session to the real network. */
export const clearNetworkEmulation = (
  handle: Handle,
): Effect.Effect<void, SewedError, MainContext> =>
  operation(handle, "Could not clear network emulation", (native) => {
    native.disableNetworkEmulation();
  });

const decodeSSLConfig = Schema.decodeUnknownSync(Net.SSLConfig);
/**
 * Sets the TLS configuration for the session's new connections. Connections already open keep
 * the configuration they were made with; `session.closeAllConnections` ends them.
 */
export const setSSLConfig = (
  handle: Handle,
  config: Net.SSLConfig,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid SSL configuration", () => decodeSSLConfig(config)),
    (value) =>
      operation(handle, "Could not set SSL configuration", (native) => {
        native.setSSLConfig({
          ...(value.minVersion === undefined ? {} : { minVersion: value.minVersion }),
          ...(value.maxVersion === undefined ? {} : { maxVersion: value.maxVersion }),
          ...(value.disabledCipherSuites === undefined
            ? {}
            : { disabledCipherSuites: [...value.disabledCipherSuites] }),
        });
      }),
  );

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
