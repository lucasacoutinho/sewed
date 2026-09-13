import { Schema } from "effect";

export const Origin = Schema.Struct({ kind: Schema.Literal("origin"), origin: Schema.String });
export const Document = Schema.Struct({ kind: Schema.Literal("document"), url: Schema.String });
export const Rule = Schema.Union([Origin, Document]);
export type Rule = typeof Rule.Type;

export const documentKey = (url: URL): string => {
  const key = new URL(url);
  key.hash = "";
  return key.href;
};

export const compile = (rule: Rule): ((url: URL) => boolean) => {
  if (rule.kind === "origin") {
    const origin = new URL(rule.origin);
    if (origin.origin === "null" || origin.origin !== rule.origin)
      throw new TypeError("An origin rule requires a canonical non-opaque origin");
    return (url) => url.origin === origin.origin;
  }
  const url = new URL(rule.url);
  if (!["http:", "https:", "file:"].includes(url.protocol) || url.username || url.password)
    throw new TypeError("A document rule requires an HTTP, HTTPS or file URL without credentials");
  const key = documentKey(url);
  return (url) => documentKey(url) === key;
};
