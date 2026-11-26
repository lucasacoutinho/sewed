import { Schema } from "effect";
import * as Decision from "./Decision.ts";
import * as UrlRule from "./UrlRule.ts";
import * as WebRequest from "./WebRequest.ts";

/**
 * A navigation rule: an origin/document rule (`UrlRule.Rule`) or a Chromium match pattern
 * (`WebRequest.Pattern`, such as `https://*.example.com/*`). One shape replaces the two separate
 * navigation schemas `WebContents.NavigationPolicy` and `GuestView.NavigationPolicy` used to be,
 * so a policy compiled from it works identically wherever a navigation decidable is gated by one.
 */
export const Rules = Schema.Array(Schema.Union([UrlRule.Rule, WebRequest.Pattern]));
export type Rules = typeof Rules.Type;

/**
 * Compiles validated rule data into URL predicates, in order. Each rule already validated itself at
 * decode time (`UrlRule.Rule`'s discriminated shapes, `WebRequest.Pattern`'s own filter), so this
 * never throws on a value that decoded successfully.
 */
export const compile = (rules: Rules): readonly ((url: URL) => boolean)[] =>
  rules.map((rule) =>
    typeof rule === "string" ? WebRequest.compilePattern(rule) : UrlRule.compile(rule),
  );

/**
 * A navigation policy: it names the least it needs from an event — a `url` — so it installs on both
 * `WebContents.Navigation` (whose event also carries `kind`) and `WebContents.Popup`. An unparseable
 * URL is a miss, answered {@link Decision.Pass} like every other miss, per the policy rule in
 * `Decision.Policy`'s own doc.
 */
export const Policy = Decision.definePolicy({
  rules: Rules,
  compile: (rules) => {
    const origins = new Set<string>();
    const documents = new Set<string>();
    const patterns: Array<(url: URL) => boolean> = [];
    for (const rule of rules) {
      if (typeof rule === "string") patterns.push(WebRequest.compilePattern(rule));
      else (rule.kind === "origin" ? origins : documents).add(UrlRule.ruleKey(rule));
    }
    return (event: { readonly url: string }) => {
      const url = URL.parse(event.url);
      if (url === null) return Decision.Pass;
      if (origins.size > 0 && origins.has(UrlRule.originOf(url))) return "allow";
      if (patterns.some((matches) => matches(url))) return "allow";
      if (documents.size === 0) return Decision.Pass;
      url.hash = "";
      return documents.has(url.href) ? "allow" : Decision.Pass;
    };
  },
});
