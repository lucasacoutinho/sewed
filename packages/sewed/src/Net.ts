import { Schema } from "effect";

export const Endpoint = Schema.Struct({
  address: Schema.String,
  family: Schema.Literals(["ipv4", "ipv6", "unspec"]),
});
export type Endpoint = typeof Endpoint.Type;
export const ResolvedHost = Schema.Struct({ endpoints: Schema.Array(Endpoint) });
export type ResolvedHost = typeof ResolvedHost.Type;

/** Options for resolving a host through a session's resolver. */
export const ResolveHostOptions = Schema.Struct({
  queryType: Schema.optionalKey(Schema.Literals(["A", "AAAA"])),
  source: Schema.optionalKey(Schema.Literals(["any", "system", "dns", "mdns", "localOnly"])),
  cacheUsage: Schema.optionalKey(Schema.Literals(["allowed", "staleAllowed", "disallowed"])),
  secureDnsPolicy: Schema.optionalKey(Schema.Literals(["allow", "disable"])),
});
export type ResolveHostOptions = typeof ResolveHostOptions.Type;
