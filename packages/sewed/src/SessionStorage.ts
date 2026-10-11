import { Schema } from "effect";

export const OriginStorage = Schema.Literals([
  "localstorage",
  "indexdb",
  "serviceworkers",
  "cachestorage",
]);
export const Storage = Schema.Literals([
  "cookies",
  "filesystem",
  "indexdb",
  "localstorage",
  "shadercache",
  "serviceworkers",
  "cachestorage",
]);
export const ClearOptions = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("session"), storages: Schema.NonEmptyArray(Storage) }),
  Schema.Struct({
    kind: Schema.Literal("origin"),
    origin: Schema.String,
    storages: Schema.NonEmptyArray(OriginStorage),
  }),
]);
export type ClearOptions = typeof ClearOptions.Type;

export const DataType = Schema.Literals([
  "backgroundFetch",
  "cache",
  "cookies",
  "downloads",
  "fileSystems",
  "indexedDB",
  "localStorage",
  "serviceWorkers",
  "webSQL",
]);
export type DataType = typeof DataType.Type;

const Origin = Schema.String.check(Schema.isMinLength(1));

/**
 * What `Session.clearData` clears. Every data type and every origin unless narrowed; `origins`
 * and `excludeOrigins` are alternatives. `originMatchingMode` says whether an origin's data is
 * cleared only where it is the top-level site or wherever it appears.
 */
export const ClearData = Schema.Struct({
  dataTypes: Schema.optionalKey(Schema.NonEmptyArray(DataType)),
  origins: Schema.optionalKey(Schema.NonEmptyArray(Origin)),
  excludeOrigins: Schema.optionalKey(Schema.NonEmptyArray(Origin)),
  avoidClosingConnections: Schema.optionalKey(Schema.Boolean),
  originMatchingMode: Schema.optionalKey(
    Schema.Literals(["third-parties-included", "origin-in-all-contexts"]),
  ),
}).check(
  Schema.makeFilter(
    (options) =>
      options.origins === undefined ||
      options.excludeOrigins === undefined ||
      "origins and excludeOrigins cannot both be given",
  ),
);
export type ClearData = typeof ClearData.Type;

/** The isolation key a shared dictionary is stored under. */
export const SharedDictionaryKey = Schema.Struct({ frameOrigin: Origin, topFrameSite: Origin });
export type SharedDictionaryKey = typeof SharedDictionaryKey.Type;

export const SharedDictionaryUsage = Schema.Struct({
  frameOrigin: Schema.String,
  topFrameSite: Schema.String,
  totalSizeBytes: Schema.Finite,
});
export type SharedDictionaryUsage = typeof SharedDictionaryUsage.Type;

/** One stored compression dictionary; times are milliseconds since the epoch. */
export const SharedDictionary = Schema.Struct({
  id: Schema.String,
  dictionaryUrl: Schema.String,
  match: Schema.String,
  matchDestinations: Schema.Array(Schema.String),
  hash: Schema.String,
  size: Schema.Finite,
  expirationDuration: Schema.Finite,
  responseTime: Schema.Finite,
  lastFetchTime: Schema.Finite,
  lastUsedTime: Schema.Finite,
});
export type SharedDictionary = typeof SharedDictionary.Type;

/** A spell checker dictionary file being fetched or becoming usable, by language code. */
export const DictionaryEvent = Schema.Struct({
  kind: Schema.Literals(["initialized", "download-begin", "download-success", "download-failure"]),
  language: Schema.String,
});
export type DictionaryEvent = typeof DictionaryEvent.Type;

/** A page asking for a file or directory Chromium treats as sensitive. */
export const FileSystemAccess = Schema.Struct({
  origin: Schema.NullOr(Schema.String),
  document: Schema.NullOr(Schema.String),
  path: Schema.String,
  isDirectory: Schema.Boolean,
});
export type FileSystemAccess = typeof FileSystemAccess.Type;
