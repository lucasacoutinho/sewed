import { Schema } from "effect";
import type { Effect, Scope } from "effect";
import type { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

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
