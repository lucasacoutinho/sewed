import { Effect, Schema, Stream } from "effect";
import * as Cookie from "../Cookie.ts";
import { SewedError } from "../SewedError.ts";
import * as UrlRule from "../UrlRule.ts";

const decodePolicy = Schema.decodeUnknownSync(Cookie.Policy);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/**
 * The cookie store a capability reaches once its policy has allowed the call. `native` supplies an
 * acquired session's store; a test supplies its own. `R` is whatever that implementation requires,
 * so the policy above it stays free of any runtime requirement of its own.
 */
export interface Core<R> {
  readonly get: (filter: Cookie.Filter) => Effect.Effect<readonly Cookie.Cookie[], SewedError, R>;
  readonly set: (details: Cookie.Details) => Effect.Effect<void, SewedError, R>;
  readonly remove: (url: string, name: string) => Effect.Effect<void, SewedError, R>;
  readonly flush: Effect.Effect<void, SewedError, R>;
  readonly changes: Stream.Stream<Cookie.Change, SewedError, R>;
}

/**
 * The cookie operations a capability serves, each one already behind the policy. The policy checks
 * URLs and filters the change stream without changing any signature, so this is the core's shape
 * exactly. One declaration, so the two cannot drift.
 */
export type Operations<R> = Core<R>;

/**
 * Compiles the origin policy once and returns operations that check every URL before the core
 * runs. This is the only place the cookie rules live, so the native Layer, a served renderer call,
 * and the memory Layer cannot drift apart. Reads and writes need a URL inside the policy, the
 * change stream only carries cookies whose domain belongs to a policy origin, and flushing asks
 * the policy nothing. An invalid policy fails here, while the Layer is building.
 */
export const operations = <R>(
  policy: Cookie.Policy,
  core: Core<R>,
): Effect.Effect<Operations<R>, SewedError> =>
  Effect.map(
    Effect.try({
      try: () =>
        decodePolicy(policy).map((rule) => ({
          matches: UrlRule.compile(rule),
          host: new URL(rule.origin).hostname.toLowerCase(),
        })),
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid cookie policy", cause),
    }),
    (rules) => {
      const allowedUrl = (raw: string | undefined) =>
        Effect.suspend(() => {
          const url = raw === undefined ? null : URL.parse(raw);
          return url !== null && rules.some((rule) => rule.matches(url))
            ? Effect.succeed(url.href)
            : Effect.fail(protocolError("Cookie URL is outside the capability's policy"));
        });
      const allowedCookie = (cookie: Cookie.Cookie) => {
        const domain = (cookie.domain ?? "").replace(/^\./, "").toLowerCase();
        return (
          domain !== "" &&
          rules.some((rule) => rule.host === domain || rule.host.endsWith(`.${domain}`))
        );
      };
      return {
        get: (filter) => Effect.andThen(allowedUrl(filter.url), () => core.get(filter)),
        set: (details) => Effect.andThen(allowedUrl(details.url), () => core.set(details)),
        remove: (url, name) => Effect.andThen(allowedUrl(url), () => core.remove(url, name)),
        flush: core.flush,
        changes: Stream.filter(core.changes, (change) => allowedCookie(change.cookie)),
      };
    },
  );
