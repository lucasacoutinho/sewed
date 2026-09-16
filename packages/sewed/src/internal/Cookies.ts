import type { Session } from "electron";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import * as Cookie from "../Cookie.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observation from "./Observation.ts";

const decodeFilter = Schema.decodeUnknownSync(Cookie.Filter);
const decodeDetails = Schema.decodeUnknownSync(Cookie.Details);
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
    changes: Observation.fromEmitter<Cookie.Change>("Cookie", () => native.cookies, [
      [
        "changed",
        (_event: unknown, cookie: Electron.Cookie, cause: Cookie.Cause, removed: boolean) => ({
          cookie: project(cookie),
          cause,
          removed,
        }),
      ],
    ]),
  };
};
