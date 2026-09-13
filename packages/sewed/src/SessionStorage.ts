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
