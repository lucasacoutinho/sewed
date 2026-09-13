import { Schema } from "effect";

export const Endpoint = Schema.Struct({
  address: Schema.String,
  family: Schema.Literals(["ipv4", "ipv6", "unspec"]),
});
export type Endpoint = typeof Endpoint.Type;
export const ResolvedHost = Schema.Struct({ endpoints: Schema.Array(Endpoint) });
export type ResolvedHost = typeof ResolvedHost.Type;
