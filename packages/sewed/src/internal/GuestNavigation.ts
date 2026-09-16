import { Schema } from "effect";
import { SewedError } from "../SewedError.ts";
import * as Navigation from "../Navigation.ts";

const decodePolicy = Schema.decodeUnknownSync(Navigation.Policy);
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/** Validates and compiles a guest's navigation policy; `Protocol` on invalid input. */
export const compile = (policy: Navigation.Policy): readonly ((url: URL) => boolean)[] => {
  try {
    return Navigation.compile(decodePolicy(policy));
  } catch (cause) {
    throw protocolError("Invalid navigation policy", cause);
  }
};

/**
 * The guest's rule set, fixed at creation: `navigate` and history moves consult it. `check` serves
 * main's own `navigate`; a target outside the policy is main's mistake and fails with `Protocol`
 * without reaching the `blocked` stream, which reports only what the page started.
 */
export interface Policy {
  readonly allows: (url: URL) => boolean;
  readonly check: (raw: string) => URL;
}

export const make = (initial: Navigation.Policy): Policy => {
  const rules = compile(initial);
  const allows = (url: URL) => rules.some((matches) => matches(url));
  return {
    allows,
    check: (raw) => {
      const url = URL.parse(raw);
      if (url === null) throw protocolError("Invalid navigation URL");
      if (!allows(url)) throw protocolError("Navigation target is outside the navigation policy");
      return url;
    },
  };
};
