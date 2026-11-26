import { Schema } from "effect";
import type { Effect, Scope } from "effect";
import type { HttpServerRequest, HttpServerResponse } from "effect/http";

export { Privileges, scheme } from "./internal/ProtocolStore.ts";
export type { Scheme, SchemeDefinition } from "./internal/ProtocolStore.ts";

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
