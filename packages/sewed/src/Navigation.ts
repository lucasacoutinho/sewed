import { Schema } from "effect";
import * as UrlRule from "./UrlRule.ts";
import * as WebRequest from "./WebRequest.ts";

/**
 * A navigation rule: an origin/document rule (`UrlRule.Rule`) or a Chromium match pattern
 * (`WebRequest.Pattern`, such as `https://*.example.com/*`). One shape replaces the two separate
 * navigation schemas `WebContents.NavigationPolicy` and `GuestView.NavigationPolicy` used to be,
 * so a policy compiled from it works identically wherever a navigation decidable is gated by one.
 */
export const Policy = Schema.Array(Schema.Union([UrlRule.Rule, WebRequest.Pattern]));
export type Policy = typeof Policy.Type;

/**
 * Compiles a validated policy into URL predicates, in order. Each rule already validated itself at
 * decode time (`UrlRule.Rule`'s discriminated shapes, `WebRequest.Pattern`'s own filter), so this
 * never throws on a value that decoded successfully.
 */
export const compile = (policy: Policy): readonly ((url: URL) => boolean)[] =>
  policy.map((rule) =>
    typeof rule === "string" ? WebRequest.compilePattern(rule) : UrlRule.compile(rule),
  );
