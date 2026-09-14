import { Schema } from "effect";
import * as StandardSchemes from "./internal/StandardSchemes.ts";

export const Origin = Schema.Struct({ kind: Schema.Literal("origin"), origin: Schema.String });
export const Document = Schema.Struct({ kind: Schema.Literal("document"), url: Schema.String });
export const Rule = Schema.Union([Origin, Document]);
export type Rule = typeof Rule.Type;

const webDocumentProtocols = new Set(["http:", "https:", "file:"]);
const registeredStandard = (url: URL) => StandardSchemes.has(url.protocol.slice(0, -1));

/**
 * The origin of a URL. Node reports an opaque origin for custom schemes, so a scheme `App.run`
 * registered as standard uses its scheme and host instead.
 */
export const originOf = (url: URL): string =>
  registeredStandard(url) && url.host !== "" ? `${url.protocol}//${url.host}` : url.origin;

export const documentKey = (url: URL): string => {
  const key = new URL(url);
  key.hash = "";
  return key.href;
};

export const compile = (rule: Rule): ((url: URL) => boolean) => {
  if (rule.kind === "origin") {
    const origin = originOf(new URL(rule.origin));
    if (origin === "null" || origin !== rule.origin)
      throw new TypeError("An origin rule requires a canonical non-opaque origin");
    return (url) => originOf(url) === origin;
  }
  const url = new URL(rule.url);
  const supported = webDocumentProtocols.has(url.protocol) || registeredStandard(url);
  if (!supported || url.username || url.password)
    throw new TypeError(
      "A document rule requires an HTTP, HTTPS, file, or registered standard scheme URL without credentials",
    );
  const key = documentKey(url);
  return (url) => documentKey(url) === key;
};
