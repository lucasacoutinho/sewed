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

/**
 * Network conditions a session emulates. `offline` cuts the session off; `latency` is the round
 * trip in milliseconds and the throughputs are in bytes per second, where zero leaves that
 * dimension unthrottled.
 */
export const Emulation = Schema.Struct({
  offline: Schema.optionalKey(Schema.Boolean),
  latency: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  downloadThroughput: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  uploadThroughput: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type Emulation = typeof Emulation.Type;

/** A 16-bit TLS cipher suite identifier, as in `0xC002`. */
export const CipherSuite = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff }));

/**
 * The TLS versions and cipher suites a session accepts for new connections. TLS 1.3 suites cannot
 * be disabled this way.
 */
export const SSLConfig = Schema.Struct({
  minVersion: Schema.optionalKey(Schema.Literals(["tls1", "tls1.1", "tls1.2", "tls1.3"])),
  maxVersion: Schema.optionalKey(Schema.Literals(["tls1.2", "tls1.3"])),
  disabledCipherSuites: Schema.optionalKey(Schema.Array(CipherSuite)),
});
export type SSLConfig = typeof SSLConfig.Type;
