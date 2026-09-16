import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Capability from "./Capability.ts";
import { SewedError } from "./SewedError.ts";
import * as UrlRule from "./UrlRule.ts";

export const SameSite = Schema.Literals(["unspecified", "no_restriction", "lax", "strict"]);
export type SameSite = typeof SameSite.Type;

export const Cookie = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  domain: Schema.optionalKey(Schema.String),
  hostOnly: Schema.optionalKey(Schema.Boolean),
  path: Schema.optionalKey(Schema.String),
  secure: Schema.optionalKey(Schema.Boolean),
  httpOnly: Schema.optionalKey(Schema.Boolean),
  session: Schema.optionalKey(Schema.Boolean),
  expirationDate: Schema.optionalKey(Schema.Number),
  sameSite: SameSite,
});
export type Cookie = typeof Cookie.Type;

export const Filter = Schema.Struct({
  url: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  domain: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
  secure: Schema.optionalKey(Schema.Boolean),
  session: Schema.optionalKey(Schema.Boolean),
  httpOnly: Schema.optionalKey(Schema.Boolean),
});
export type Filter = typeof Filter.Type;

export const Details = Schema.Struct({
  url: Schema.String,
  name: Schema.String.check(Schema.isMinLength(1)),
  value: Schema.String,
  domain: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
  secure: Schema.optionalKey(Schema.Boolean),
  httpOnly: Schema.optionalKey(Schema.Boolean),
  expirationDate: Schema.optionalKey(Schema.Number),
  sameSite: Schema.optionalKey(SameSite),
});
export type Details = typeof Details.Type;

export const Cause = Schema.Literals([
  "inserted",
  "inserted-no-change-overwrite",
  "inserted-no-value-change-overwrite",
  "explicit",
  "overwrite",
  "expired",
  "evicted",
  "expired-overwrite",
]);
export type Cause = typeof Cause.Type;

export const Change = Schema.Struct({ cookie: Cookie, cause: Cause, removed: Schema.Boolean });
export type Change = typeof Change.Type;

/** Origins this capability may read, write, and observe cookies for; nothing else is reachable. */
export const Policy = Schema.Array(UrlRule.Origin);
export type Policy = typeof Policy.Type;

export const protocol = RpcGroup.make(
  Rpc.make("get", {
    payload: { filter: Filter },
    success: Schema.Array(Cookie),
    error: SewedError,
  }),
  Rpc.make("set", { payload: { details: Details }, error: SewedError }),
  Rpc.make("remove", { payload: { url: Schema.String, name: Schema.String }, error: SewedError }),
  Rpc.make("flush", { error: SewedError }),
  Rpc.make("changes", { success: Change, stream: true, error: SewedError }),
);

/**
 * A session's cookies as one capability: `Cookies.native(session, policy)` in `sewed/main` carries
 * the origin policy for one acquired session, `Capability.client` reaches it from a document, and
 * `Testing.Cookies.memory` stands in for tests.
 */
export const capability = Capability.define("cookies", protocol);
