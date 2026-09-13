import { Schema } from "effect";
import { type Blocked, NavigationPolicy } from "../GuestView.ts";
import { SewedError } from "../SewedError.ts";
import * as WebRequest from "../WebRequest.ts";
import type { NavigationGuard } from "./WebContentsCore.ts";

const decodePolicy = Schema.decodeUnknownSync(NavigationPolicy);
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/** Validates and compiles a pattern policy; `Protocol` on invalid input. */
export const compile = (policy: NavigationPolicy): readonly ((url: URL) => boolean)[] => {
  try {
    return decodePolicy(policy).map(WebRequest.compilePattern);
  } catch (cause) {
    throw protocolError("Invalid navigation policy", cause);
  }
};

/**
 * The guest's one rule set: the core's guard, `navigate`, and history moves all consult it.
 * `check` serves main's own `navigate`; a target outside the policy is main's mistake and fails
 * with `Protocol` without reaching the `blocked` stream, which reports only what the page started.
 */
export interface Policy {
  readonly allows: (url: URL) => boolean;
  readonly replace: (policy: NavigationPolicy) => void;
  readonly check: (raw: string) => URL;
}

export const make = (initial: NavigationPolicy): Policy => {
  let rules = compile(initial);
  const allows = (url: URL) => rules.some((matches) => matches(url));
  return {
    allows,
    replace: (policy) => {
      rules = compile(policy);
    },
    check: (raw) => {
      const url = URL.parse(raw);
      if (url === null) throw protocolError("Invalid navigation URL");
      if (!allows(url)) throw protocolError("Navigation target is outside the navigation policy");
      return url;
    },
  };
};

export const guard = (policy: Policy, onBlocked: (blocked: Blocked) => void): NavigationGuard => ({
  allows: policy.allows,
  blocked: (kind, url) => onBlocked({ kind, url }),
});
