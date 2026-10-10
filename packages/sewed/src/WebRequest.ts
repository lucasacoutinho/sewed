import { Schema } from "effect";
import type { Effect } from "effect";
import * as Binary from "./Binary.ts";
import type { SewedError } from "./SewedError.ts";

export const ResourceType = Schema.Literals([
  "mainFrame",
  "subFrame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xhr",
  "ping",
  "cspReport",
  "media",
  "webSocket",
  "other",
]);
export type ResourceType = typeof ResourceType.Type;

const patternSyntax =
  /^(\*|[a-z][a-z0-9+.-]*):\/\/(\*|\*\.[^/*:]+|[^/*:]*)(?::(\*|\d{1,5}))?(\/.*)$/;
const escape = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
const defaultPorts = new Map([
  ["http:", "80"],
  ["https:", "443"],
  ["ftp:", "21"],
  ["ws:", "80"],
  ["wss:", "443"],
]);

/**
 * Compiles a Chromium match pattern such as `https://*.example.com/api/*` or `<all_urls>` into
 * a URL predicate. A wildcard scheme matches http and https; a `*.` host prefix matches the host
 * and its subdomains; a `*` in the path matches any characters. Numeric ports must be within
 * 0-65535; explicit default ports match URLs whose parser has omitted that port.
 */
export const compilePattern = (pattern: string): ((url: URL) => boolean) => {
  if (pattern === "<all_urls>") return () => true;
  const match = patternSyntax.exec(pattern);
  if (match === null) throw new TypeError(`Invalid URL pattern: ${pattern}`);
  const [, scheme = "", host = "", port, path = ""] = match;
  if (host === "" && scheme !== "file")
    throw new TypeError(`URL pattern needs a host unless its scheme is file: ${pattern}`);
  const schemes = scheme === "*" ? ["http:", "https:"] : [`${scheme}:`];
  const hostname = host.toLowerCase();
  const matchHost =
    hostname === "*" || hostname === ""
      ? () => true
      : hostname.startsWith("*.")
        ? (value: string) => value === hostname.slice(2) || value.endsWith(hostname.slice(1))
        : (value: string) => value === hostname;
  if (port !== undefined && port !== "*" && Number(port) > 65535)
    throw new TypeError(`Invalid URL pattern port: ${pattern}`);
  const expectedPort = port === undefined || port === "*" ? undefined : String(Number(port));
  const matchPort = (url: URL) =>
    expectedPort === undefined || (url.port || defaultPorts.get(url.protocol)) === expectedPort;
  const pathPattern = new RegExp(`^${path.split("*").map(escape).join(".*")}$`);
  return (url) =>
    schemes.includes(url.protocol) &&
    matchHost(url.hostname.toLowerCase()) &&
    matchPort(url) &&
    pathPattern.test(url.pathname + url.search);
};

export const Pattern = Schema.String.check(
  Schema.makeFilter((pattern) => {
    try {
      compilePattern(pattern);
      return true;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "Invalid URL pattern";
    }
  }),
);

/**
 * One piece of a request's upload data; file parts are metadata the library never reads. A blob
 * part keeps its `id` whether or not it was resolved: `blobs: "resolve"` fills `bytes` in beside
 * it, `blobs: "reference"` leaves `bytes` absent, and either way a rule that reads `id` can still
 * recognize the same blob after resolution instead of losing its identity to a bare `"bytes"` kind.
 */
export const UploadPart = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("bytes"), bytes: Binary.Bytes }),
  Schema.Struct({
    kind: Schema.Literal("file"),
    path: Schema.String,
    offset: Schema.optionalKey(Schema.Finite),
    length: Schema.optionalKey(Schema.Finite),
    modificationTime: Schema.optionalKey(Schema.Finite),
  }),
  Schema.Struct({
    kind: Schema.Literal("blob"),
    id: Schema.String,
    bytes: Schema.optionalKey(Binary.Bytes),
  }),
]);
export type UploadPart = typeof UploadPart.Type;

/** The upload data a request carried, kept within the filter's byte cap. */
export const Body = Schema.Struct({
  parts: Schema.Array(UploadPart),
  bytes: Schema.Finite,
  truncated: Schema.Boolean,
});
export type Body = typeof Body.Type;

/** Asks the request stage for upload data, capped in bytes; blobs are read or referenced. */
export const BodyFilter = Schema.Struct({
  maxBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  blobs: Schema.Literals(["resolve", "reference"]),
});
export type BodyFilter = typeof BodyFilter.Type;

/** Which requests a set of deciders sees; patterns follow Chromium's match pattern syntax. */
export const Filter = Schema.Struct({
  urls: Schema.NonEmptyArray(Pattern),
  types: Schema.optionalKey(Schema.NonEmptyArray(ResourceType)),
  body: Schema.optionalKey(BodyFilter),
});
export type Filter = typeof Filter.Type;

const requestFields = {
  id: Schema.Finite,
  url: Schema.String,
  method: Schema.String,
  resourceType: ResourceType,
  referrer: Schema.String,
  timestamp: Schema.Finite,
  webContentsId: Schema.optionalKey(Schema.Finite),
  sourceId: Schema.optionalKey(Schema.String),
} as const;

export const Request = Schema.Struct({ ...requestFields, body: Schema.optionalKey(Body) });
export type Request = typeof Request.Type;

/**
 * What `request.readBody(options?)` assembles under, all optional: a field left out takes the
 * install's own `body` filter option when it named one, else `{ maxBytes: 3_000_000, blobs:
 * "reference" }`. See `internal/WebRequest.ts`'s `readBodyFor` for where that default is chosen —
 * per install, not per request, since two installs on the same request may have asked differently.
 */
export const ReadBodyOptions = Schema.Struct({
  maxBytes: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  blobs: Schema.optionalKey(Schema.Literals(["resolve", "reference"])),
});
export type ReadBodyOptions = typeof ReadBodyOptions.Type;

/**
 * Reads the body a request carried, assembled lazily so one install over `<all_urls>` pays for it
 * only on the request whose decider actually calls this. Fails `Limit` when the assembled body
 * would exceed its own `maxBytes` — unlike the install-time `body` option, which truncates rather
 * than fails, because a decider that explicitly asked should not silently receive less than it
 * asked for and mistake it for the whole body.
 */
export interface ReadBody {
  (options?: ReadBodyOptions): Effect.Effect<Body, SewedError>;
}
const isReadBody = (value: unknown): value is ReadBody => typeof value === "function";
const ReadBodyField = Schema.declare<ReadBody>(isReadBody, { expected: "ReadBody" });

/**
 * The request stage's own event: everything {@link Request} carries, plus the lazy `readBody`.
 * Only this stage carries upload data — the two header stages refuse a filter that asks for a
 * `body` at all — so only this event schema, `Decidables.Session.Request`'s own, gains the field.
 */
export const RequestEvent = Schema.Struct({
  ...requestFields,
  body: Schema.optionalKey(Body),
  readBody: ReadBodyField,
});
export type RequestEvent = typeof RequestEvent.Type;

export const RequestDecision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("allow") }),
  Schema.Struct({ kind: Schema.Literal("block") }),
  Schema.Struct({ kind: Schema.Literal("redirect"), url: Schema.String }),
]);
export type RequestDecision = typeof RequestDecision.Type;

export const RequestHeaders = Schema.Struct({
  ...requestFields,
  headers: Schema.Record(Schema.String, Schema.String),
});
export type RequestHeaders = typeof RequestHeaders.Type;
export const RequestHeadersDecision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("allow") }),
  Schema.Struct({ kind: Schema.Literal("block") }),
  Schema.Struct({
    kind: Schema.Literal("headers"),
    headers: Schema.Record(Schema.String, Schema.String),
  }),
]);
export type RequestHeadersDecision = typeof RequestHeadersDecision.Type;

export const Response = Schema.Struct({
  ...requestFields,
  statusLine: Schema.String,
  statusCode: Schema.Finite,
  headers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
});
export type Response = typeof Response.Type;
export const ResponseDecision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("allow") }),
  Schema.Struct({ kind: Schema.Literal("block") }),
  Schema.Struct({
    kind: Schema.Literal("headers"),
    headers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
    statusLine: Schema.optionalKey(Schema.String),
  }),
]);
export type ResponseDecision = typeof ResponseDecision.Type;

const observed = {
  ...requestFields,
  fromCache: Schema.Boolean,
} as const;

/** Observation-only stages of a request's life; deciders never see these. */
export const Event = Schema.Union([
  Schema.Struct({
    ...requestFields,
    stage: Schema.Literal("sent"),
    headers: Schema.Record(Schema.String, Schema.String),
  }),
  Schema.Struct({
    ...observed,
    stage: Schema.Literal("response"),
    statusCode: Schema.Finite,
    statusLine: Schema.String,
    headers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    ...observed,
    stage: Schema.Literal("redirect"),
    statusCode: Schema.Finite,
    redirectUrl: Schema.String,
  }),
  Schema.Struct({
    ...observed,
    stage: Schema.Literal("completed"),
    statusCode: Schema.Finite,
    statusLine: Schema.String,
  }),
  Schema.Struct({ ...observed, stage: Schema.Literal("error"), error: Schema.String }),
]);
export type Event = typeof Event.Type;
