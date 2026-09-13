import { Schema } from "effect";
import * as UrlRule from "./UrlRule.ts";

export const Name = Schema.Literals([
  "notifications",
  "geolocation",
  "fullscreen",
  "pointerLock",
  "media",
  "clipboard-read",
  "clipboard-sanitized-write",
  "persistent-storage",
  "screen-wake-lock",
]);
export type Name = typeof Name.Type;
const permissions = Schema.NonEmptyArray(Name);
export const Rule = Schema.Union([
  Schema.Struct({ ...UrlRule.Origin.fields, permissions }),
  Schema.Struct({ ...UrlRule.Document.fields, permissions }),
]);
export const Policy = Schema.Array(Rule);
export type Policy = typeof Policy.Type;
