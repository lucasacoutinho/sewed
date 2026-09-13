import type { Session } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Owner } from "../Binding.ts";
import * as Cookie from "../Cookie.ts";
import { host as hostOwner } from "../Host.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as UrlRule from "../UrlRule.ts";

const decodeFilter = Schema.decodeUnknownSync(Cookie.Filter);
const decodeDetails = Schema.decodeUnknownSync(Cookie.Details);
const decodePolicy = Schema.decodeUnknownSync(Cookie.Policy);
const decodeUrl = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeName = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });

export interface Handle {
  readonly get: (
    filter?: Cookie.Filter,
  ) => Effect.Effect<readonly Cookie.Cookie[], SewedError, MainContext>;
  readonly set: (details: Cookie.Details) => Effect.Effect<void, SewedError, MainContext>;
  readonly remove: (url: string, name: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly flush: Effect.Effect<void, SewedError, MainContext>;
  /** Every observer owns its listener and a queue of 128 changes; overflow fails it with `Limit`. */
  readonly changes: Stream.Stream<Cookie.Change, SewedError, MainContext>;
}

const project = (cookie: Electron.Cookie): Cookie.Cookie => ({
  name: cookie.name,
  value: cookie.value,
  sameSite: cookie.sameSite,
  ...(cookie.domain === undefined ? {} : { domain: cookie.domain }),
  ...(cookie.hostOnly === undefined ? {} : { hostOnly: cookie.hostOnly }),
  ...(cookie.path === undefined ? {} : { path: cookie.path }),
  ...(cookie.secure === undefined ? {} : { secure: cookie.secure }),
  ...(cookie.httpOnly === undefined ? {} : { httpOnly: cookie.httpOnly }),
  ...(cookie.session === undefined ? {} : { session: cookie.session }),
  ...(cookie.expirationDate === undefined ? {} : { expirationDate: cookie.expirationDate }),
});

export const make = (native: Session): Handle => {
  const asynchronous = <A>(message: string, run: () => Promise<A>) =>
    Effect.andThen(
      MainContext,
      Effect.tryPromise({
        try: run,
        catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
      }),
    );
  return {
    get: (filter = {}) =>
      Effect.andThen(
        decoded("Invalid cookie filter", () => decodeFilter(filter)),
        (value) =>
          asynchronous("Could not read cookies", async () =>
            (await native.cookies.get(value)).map(project),
          ),
      ),
    set: (details) =>
      Effect.andThen(
        decoded("Invalid cookie details", () => decodeDetails(details)),
        (value) => asynchronous("Could not set cookie", () => native.cookies.set(value)),
      ),
    remove: (url, name) =>
      Effect.andThen(
        decoded("Invalid cookie reference", () => [decodeUrl(url), decodeName(name)] as const),
        ([target, key]) =>
          asynchronous("Could not remove cookie", () => native.cookies.remove(target, key)),
      ),
    flush: asynchronous("Could not flush cookies", () => native.cookies.flushStore()),
    changes: Stream.callback<Cookie.Change, SewedError, MainContext>(
      (queue) =>
        Effect.gen(function* () {
          yield* MainContext;
          const listener = (
            _event: Electron.Event,
            cookie: Electron.Cookie,
            cause: Cookie.Cause,
            removed: boolean,
          ) => {
            if (!Queue.offerUnsafe(queue, { cookie: project(cookie), cause, removed }))
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new SewedError({ code: "Limit", message: "Cookie observer queue is full" }),
                ),
              );
          };
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              native.cookies.on("changed", listener);
            }),
            () =>
              Effect.sync(() => {
                native.cookies.off("changed", listener);
              }),
          );
        }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
      { bufferSize: 128 },
    ),
  };
};

/** Hosts cookies for bound clients within a list of origins; everything else fails with `Protocol`. */
export const host = (
  cookies: Handle,
  policy: Cookie.Policy,
): Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof Cookie.protocol>>,
  SewedError,
  MainContext | Scope.Scope
> =>
  Effect.gen(function* () {
    yield* MainContext;
    const rules = yield* decoded("Invalid cookie policy", () =>
      decodePolicy(policy).map((rule) => ({
        matches: UrlRule.compile(rule),
        host: new URL(rule.origin).hostname.toLowerCase(),
      })),
    );
    const allowedUrl = (raw: string | undefined) =>
      Effect.suspend(() => {
        const url = raw === undefined ? null : URL.parse(raw);
        return url !== null && rules.some((rule) => rule.matches(url))
          ? Effect.succeed(url.href)
          : Effect.fail(protocolError("Cookie URL is outside the owner's policy"));
      });
    const allowedCookie = (cookie: Cookie.Cookie) => {
      const domain = (cookie.domain ?? "").replace(/^\./, "").toLowerCase();
      return (
        domain !== "" &&
        rules.some((rule) => rule.host === domain || rule.host.endsWith(`.${domain}`))
      );
    };
    return yield* hostOwner(
      Cookie.protocol,
      Cookie.protocol.toLayer({
        get: ({ filter }) => Effect.andThen(allowedUrl(filter.url), () => cookies.get(filter)),
        set: ({ details }) => Effect.andThen(allowedUrl(details.url), () => cookies.set(details)),
        remove: ({ url, name }) => Effect.andThen(allowedUrl(url), () => cookies.remove(url, name)),
        flush: () => cookies.flush,
        changes: () => Stream.filter(cookies.changes, (change) => allowedCookie(change.cookie)),
      }),
    );
  });
