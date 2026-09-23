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

export const MediaType = Schema.Literals(["audio", "video"]);
export type MediaType = typeof MediaType.Type;
const mediaTypes = Schema.optionalKey(Schema.NonEmptyArray(MediaType));

/**
 * `mediaTypes` narrows a rule that names `media` in its `permissions` to the audio/video types it
 * grants; a rule naming `media` without it still grants every media request, as before. Naming it
 * beside a rule that does not name `media` is refused here rather than silently ignored — the field
 * would look like it does something and never fire.
 */
const mediaTypesNarrowsMedia = Schema.makeFilter(
  (rule: { readonly permissions: readonly Name[]; readonly mediaTypes?: readonly MediaType[] }) => {
    if (rule.mediaTypes !== undefined && !rule.permissions.includes("media")) {
      return {
        path: ["mediaTypes"],
        issue: 'mediaTypes narrows only a rule whose permissions name "media"',
      };
    }
  },
);
export const Rule = Schema.Union([
  Schema.Struct({ ...UrlRule.Origin.fields, permissions, mediaTypes }),
  Schema.Struct({ ...UrlRule.Document.fields, permissions, mediaTypes }),
]).check(mediaTypesNarrowsMedia);
export const Rules = Schema.Array(Rule);
export type Rules = typeof Rules.Type;

/**
 * A permission policy: it names the least it needs from an event —
 * `{ name, origin, document, mediaTypes }`, the flat shape `Decidables.Session.Permission` shares
 * between a permission check and a device check. An **origin** rule is answered from `origin`
 * alone, and misses when it is `null` (an opaque origin — `file:`, `data:` — names nothing); a
 * **document** rule is answered only from `document`, so a device check (`document: null`) is
 * never granted by a document rule, even one whose document happens to key the same origin. This
 * is deliberately tighter than base, where a root-document rule granted a device check because its
 * origin URL happened to share that document key.
 *
 * A rule whose own `mediaTypes` is set grants a request only when every type the event asks for is
 * among them — `event.mediaTypes.every(...)`, vacuously true for a non-media event's empty list, so
 * it never blocks a permission the rule already names outside `media`. A rule with no `mediaTypes`
 * grants any media request, exactly as it did before this field existed.
 */
export const Policy = Decision.definePolicy({
  rules: Rules,
  compile: (rules) => {
    const compiled = rules.map((rule) => ({
      kind: rule.kind,
      permissions: new Set<string>(rule.permissions),
      mediaTypes: rule.mediaTypes === undefined ? undefined : new Set<MediaType>(rule.mediaTypes),
      matches: UrlRule.compile(rule),
    }));
    return (event: {
      readonly name: string;
      readonly origin: string | null;
      readonly document: string | null;
      readonly mediaTypes: readonly MediaType[];
    }) => {
      const origin = event.origin === null ? null : URL.parse(event.origin);
      const document = event.document === null ? null : URL.parse(event.document);
      const narrowsToRequested = (grantedTypes: ReadonlySet<MediaType> | undefined) =>
        grantedTypes === undefined || event.mediaTypes.every((type) => grantedTypes.has(type));
      return compiled.some(
        (rule) =>
          rule.permissions.has(event.name) &&
          narrowsToRequested(rule.mediaTypes) &&
          (rule.kind === "origin"
            ? origin !== null && rule.matches(origin)
            : document !== null && rule.matches(document)),
      )
        ? "allow"
        : Decision.Pass;
    };
  },
});
