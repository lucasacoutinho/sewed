import type * as Shell from "../Shell.ts";
import * as UrlRule from "../UrlRule.ts";

const recipientParameters = new Set(["to", "cc", "bcc"]);

const decodedRecipient = (url: URL): string | undefined => {
  try {
    return decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return undefined;
  }
};

const mailto = (address: string) => {
  const expected = address.toLowerCase();
  return (url: URL): boolean =>
    url.protocol === "mailto:" &&
    ![...url.searchParams.keys()].some((name) => recipientParameters.has(name.toLowerCase())) &&
    decodedRecipient(url) === expected;
};

/** Compiles a decoded shell policy into one predicate over the URLs `openExternal` receives. */
export const compile = (policy: Shell.Policy): ((url: URL) => boolean) => {
  const rules = policy.map((rule) =>
    rule.kind === "mailto" ? mailto(rule.address) : UrlRule.compile(rule),
  );
  return (url) => rules.some((allows) => allows(url));
};
