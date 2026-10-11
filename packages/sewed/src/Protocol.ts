import { Schema } from "effect";
import type { Effect, Scope } from "effect";
import type { HttpServerRequest, HttpServerResponse } from "effect/http";

export const Privileges = Schema.Struct({
  standard: Schema.optionalKey(Schema.Boolean),
  secure: Schema.optionalKey(Schema.Boolean),
  supportFetchAPI: Schema.optionalKey(Schema.Boolean),
  corsEnabled: Schema.optionalKey(Schema.Boolean),
  stream: Schema.optionalKey(Schema.Boolean),
  serviceWorkers: Schema.optionalKey(Schema.Boolean),
  codeCache: Schema.optionalKey(Schema.Boolean),
});
export type Privileges = typeof Privileges.Type;

const schemeIdentity: unique symbol = Symbol("sewed/ProtocolScheme");
export interface Scheme {
  readonly [schemeIdentity]: true;
}

export interface SchemeDefinition {
  readonly name: string;
  readonly privileges: Privileges;
}

const definitions = new WeakMap<Scheme, SchemeDefinition>();

/** Creates an inert protocol definition. Native registration happens in `App.run`. */
export const scheme = (name: string, privileges: Privileges = {}): Scheme => {
  const value: Scheme = { [schemeIdentity]: true };
  definitions.set(value, Object.freeze({ name, privileges: Object.freeze({ ...privileges }) }));
  return Object.freeze(value);
};

export const definition = (value: Scheme): SchemeDefinition | undefined => definitions.get(value);

export type Handler<E = never, R = never> = (
  request: HttpServerRequest.HttpServerRequest,
) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R | Scope.Scope>;

export type Request = HttpServerRequest.HttpServerRequest;
export type Response = HttpServerResponse.HttpServerResponse;

/**
 * The web's own request/response shape `handleWeb` takes: no `HttpServerRequest`/
 * `HttpServerResponse` wrapping, `signal` aborts the same way a registration's teardown or the
 * native request's own cancellation would tell any other cancellable call, and a thrown or
 * rejected answer fails the request the way a `Handler`'s own failure does.
 */
export type WebHandler = (
  request: globalThis.Request,
) => globalThis.Response | Promise<globalThis.Response>;

/**
 * One route of a file-served scheme: URLs matching `host` and the `path` prefix are served from
 * the directory `root`, with `index` for a path ending in a slash and `headers` on every response.
 */
export const Route = Schema.Struct({
  host: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  path: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\//))),
  root: Schema.String.check(Schema.isMinLength(1)),
  index: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type Route = typeof Route.Type;
