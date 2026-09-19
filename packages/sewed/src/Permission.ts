import { Schema } from "effect";
import * as Decision from "./Decision.ts";
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
  "hid",
  "serial",
  "usb",
]);
export type Name = typeof Name.Type;
const permissions = Schema.NonEmptyArray(Name);
export const Rule = Schema.Union([
  Schema.Struct({ ...UrlRule.Origin.fields, permissions }),
  Schema.Struct({ ...UrlRule.Document.fields, permissions }),
]);
export const Rules = Schema.Array(Rule);
export type Rules = typeof Rules.Type;

/**
 * A permission policy: it names the least it needs from an event —
 * `{ name, origin, document }`, the flat shape `Decidables.Session.Permission` shares between a
 * permission check and a device check. An **origin** rule is answered from `origin` alone, and
 * misses when it is `null` (an opaque origin — `file:`, `data:` — names nothing); a **document**
 * rule is answered only from `document`, so a device check (`document: null`) is never granted by a
 * document rule, even one whose document happens to key the same origin. This is deliberately
 * tighter than base, where a root-document rule granted a device check because its origin URL
 * happened to share that document key.
 */
export const Policy = Decision.definePolicy({
  rules: Rules,
  compile: (rules) => {
    const compiled = rules.map((rule) => ({
      kind: rule.kind,
      permissions: new Set<string>(rule.permissions),
      matches: UrlRule.compile(rule),
    }));
    return (event: {
      readonly name: string;
      readonly origin: string | null;
      readonly document: string | null;
    }) => {
      const origin = event.origin === null ? null : URL.parse(event.origin);
      const document = event.document === null ? null : URL.parse(event.document);
      return compiled.some(
        (rule) =>
          rule.permissions.has(event.name) &&
          (rule.kind === "origin"
            ? origin !== null && rule.matches(origin)
            : document !== null && rule.matches(document)),
      )
        ? "allow"
        : Decision.Pass;
    };
  },
});
