import * as UrlRule from "../UrlRule.ts";

/**
 * `UrlRule.originOf` reports the literal string `"null"` for an opaque origin (`file:`, `data:`, an
 * unregistered scheme) — Chromium's own `URL.origin` spelling for "this document has no origin", not
 * a real identity: every `file:` document in an application shares it. An event handed to a decider
 * must not carry a value that looks like an identity and is not, so the opaque case becomes a real
 * `null` here. A gate that compares two origins keeps comparing `UrlRule.originOf`'s own strings.
 */
export const originOrNull = (url: URL): string | null => {
  const value = UrlRule.originOf(url);
  return value === "null" ? null : value;
};

/** The origin a raw URL or origin string names; an unparseable value names none. */
export const originOfRaw = (raw: string | undefined): string | null => {
  const url = raw === undefined ? null : URL.parse(raw);
  return url === null ? null : originOrNull(url);
};

/** Who a native request came from, as the `origin` and `document` a decider's event carries. */
export interface Requester {
  readonly origin: string | null;
  readonly document: string | null;
}

/** No requester: the frame or web contents that asked is gone, or its URL does not parse. */
export const nobody: Requester = { origin: null, document: null };

/** The requester a document URL names; an unparseable value names nobody. */
export const requesterOfUrl = (raw: string): Requester => {
  const url = URL.parse(raw);
  return url === null ? nobody : { origin: originOrNull(url), document: UrlRule.documentKey(url) };
};

/**
 * The requester a frame names. A frame that navigated away or was destroyed is `null`, and reading
 * `url` off a disposed frame throws; both name nobody.
 */
export const requesterOfFrame = (frame: { readonly url: string } | null): Requester => {
  if (frame === null) return nobody;
  try {
    return requesterOfUrl(frame.url);
  } catch {
    return nobody;
  }
};

/** The requester a web contents names: its top-level document, or nobody once it is destroyed. */
export const requesterOfContents = (contents: { getURL(): string }): Requester => {
  try {
    return requesterOfUrl(contents.getURL());
  } catch {
    return nobody;
  }
};
