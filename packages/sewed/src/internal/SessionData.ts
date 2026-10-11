import path from "node:path";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import type * as Extension from "../Extension.ts";
import type { MainContext } from "../RuntimeContext.ts";
import type { SewedError } from "../SewedError.ts";
import * as SessionStorage from "../SessionStorage.ts";
import * as Observation from "./Observation.ts";
import { decoded, protocolError } from "./ProtocolError.ts";
import type { Handle } from "./Session.ts";
import { resolve } from "./Session.ts";
import { asynchronous, operation } from "./SessionSettings.ts";

const decodeClearData = Schema.decodeUnknownSync(SessionStorage.ClearData);
const decodeKey = Schema.decodeUnknownSync(SessionStorage.SharedDictionaryKey);
const decodeDomains = Schema.decodeUnknownSync(
  Schema.NonEmptyArray(Schema.String.check(Schema.isPattern(/^[^,\s]+$/))),
);
const decodeString = Schema.decodeUnknownSync(Schema.String);

/** Clears browsing data by type and origin; with no options, everything the session stores. */
export const clearData = (
  handle: Handle,
  options: SessionStorage.ClearData = {},
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid data clearing options", () => decodeClearData(options)),
    ({ dataTypes, origins, excludeOrigins, ...rest }) =>
      asynchronous(handle, "Could not clear session data", (native) =>
        native.clearData({
          ...rest,
          ...(dataTypes === undefined ? {} : { dataTypes: [...dataTypes] }),
          ...(origins === undefined ? {} : { origins: [...origins] }),
          ...(excludeOrigins === undefined ? {} : { excludeOrigins: [...excludeOrigins] }),
        }),
      ),
  );

/** How much each isolation key's shared compression dictionaries occupy. */
export const sharedDictionaryUsage = (
  handle: Handle,
): Effect.Effect<ReadonlyArray<SessionStorage.SharedDictionaryUsage>, SewedError, MainContext> =>
  asynchronous(handle, "Could not read shared dictionary usage", async (native) =>
    (await native.getSharedDictionaryUsageInfo()).map(
      ({ frameOrigin, topFrameSite, totalSizeBytes }) => ({
        frameOrigin,
        topFrameSite,
        totalSizeBytes,
      }),
    ),
  );

/** The shared compression dictionaries stored under one isolation key. */
export const sharedDictionaries = (
  handle: Handle,
  key: SessionStorage.SharedDictionaryKey,
): Effect.Effect<ReadonlyArray<SessionStorage.SharedDictionary>, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid shared dictionary key", () => decodeKey(key)),
    (value) =>
      asynchronous(handle, "Could not read shared dictionaries", async (native) =>
        (await native.getSharedDictionaryInfo({ ...value })).map((info) => ({
          id: info.id,
          dictionaryUrl: info.dictionaryUrl,
          match: info.match,
          matchDestinations: [...info.matchDestinations],
          hash: info.hash,
          size: info.size,
          expirationDuration: info.expirationDuration,
          responseTime: info.responseTime.getTime(),
          lastFetchTime: info.lastFetchTime.getTime(),
          lastUsedTime: info.lastUsedTime.getTime(),
        })),
      ),
  );

/** Clears shared compression dictionaries: one isolation key's, or all of them without a key. */
export const clearSharedDictionaries = (
  handle: Handle,
  key?: SessionStorage.SharedDictionaryKey,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid shared dictionary key", () =>
      key === undefined ? undefined : decodeKey(key),
    ),
    (value) =>
      asynchronous(handle, "Could not clear shared dictionaries", (native) =>
        value === undefined
          ? native.clearSharedDictionaryCache()
          : native.clearSharedDictionaryCacheForIsolationKey({ ...value }),
      ),
  );

/** Spell checker dictionary files being fetched and becoming usable. */
export const spellCheckerDictionaries = (
  handle: Handle,
): Stream.Stream<SessionStorage.DictionaryEvent, SewedError, MainContext> =>
  Observation.fromEmitter<SessionStorage.DictionaryEvent>(
    "Spell checker dictionary",
    () => resolve(handle),
    (["initialized", "download-begin", "download-success", "download-failure"] as const).map(
      (kind) =>
        [
          `spellcheck-dictionary-${kind}`,
          (_event: unknown, language: string): SessionStorage.DictionaryEvent => ({
            kind,
            language,
          }),
        ] as const,
    ),
  );

/**
 * Sets where spell checker dictionaries are downloaded from, instead of Google's servers. The
 * URL must end in a slash; Chromium appends the dictionary file name.
 */
export const setSpellCheckerDictionaryDownloadUrl = (
  handle: Handle,
  url: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid dictionary download URL", () => {
      const parsed = new URL(decodeString(url));
      if (!parsed.pathname.endsWith("/"))
        throw protocolError("Dictionary download URL must end in a slash");
      return parsed.href;
    }),
    (value) =>
      operation(handle, "Could not set dictionary download URL", (native) => {
        native.setSpellCheckerDictionaryDownloadURL(value);
      }),
  );

/**
 * Names the servers integrated authentication (NTLM, Negotiate) may send credentials to, as
 * host patterns such as `*.example.com`. Without it Chromium sends them only to intranet hosts.
 */
export const allowNtlmCredentialsForDomains = (
  handle: Handle,
  domains: ReadonlyArray<string>,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid NTLM domain list", () => decodeDomains(domains)),
    (value) =>
      operation(handle, "Could not set NTLM domains", (native) => {
        native.allowNTLMCredentialsForDomains(value.join(","));
      }),
  );

/** Sets the directory V8's generated code cache is kept in; it must be absolute. */
export const setCodeCachePath = (
  handle: Handle,
  directory: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Code cache path must be absolute", () => {
      if (!path.isAbsolute(decodeString(directory)))
        throw protocolError("Code cache path must be absolute");
      return path.resolve(directory);
    }),
    (value) =>
      operation(handle, "Could not set code cache path", (native) => {
        native.setCodeCachePath(value);
      }),
  );

const info = (extension: Electron.Extension): Extension.Info => ({
  id: extension.id,
  name: extension.name,
  version: extension.version,
  url: extension.url,
});

/** The extensions loaded in the session. */
export const extensions = (
  handle: Handle,
): Effect.Effect<ReadonlyArray<Extension.Info>, SewedError, MainContext> =>
  operation(handle, "Could not list extensions", (native) =>
    native.extensions.getAllExtensions().map(info),
  );

/** Extensions being loaded, becoming ready, and being unloaded. */
export const extensionEvents = (
  handle: Handle,
): Stream.Stream<Extension.Event, SewedError, MainContext> =>
  Observation.fromEmitter<Extension.Event>(
    "Extension",
    () => resolve(handle).extensions,
    (["loaded", "ready", "unloaded"] as const).map(
      (kind) =>
        [
          `extension-${kind}`,
          (_event: unknown, extension: Electron.Extension): Extension.Event => ({
            kind,
            extension: info(extension),
          }),
        ] as const,
    ),
  );
