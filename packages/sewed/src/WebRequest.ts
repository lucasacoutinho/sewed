import { Schema } from "effect";

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

/**
 * Compiles a Chromium match pattern such as `https://*.example.com/api/*` or `<all_urls>` into
 * a URL predicate. A wildcard scheme matches http and https; a `*.` host prefix matches the host
 * and its subdomains; a `*` in the path matches any characters.
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
  const matchPort =
    port === undefined || port === "*" ? () => true : (value: string) => value === port;
  const pathPattern = new RegExp(`^${path.split("*").map(escape).join(".*")}$`);
  return (url) =>
    schemes.includes(url.protocol) &&
    matchHost(url.hostname.toLowerCase()) &&
    matchPort(url.port) &&
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

/** Which requests a set of deciders sees; patterns follow Chromium's match pattern syntax. */
export const Filter = Schema.Struct({
  urls: Schema.NonEmptyArray(Pattern),
  types: Schema.optionalKey(Schema.NonEmptyArray(ResourceType)),
});
export type Filter = typeof Filter.Type;

const requestFields = {
  id: Schema.Number,
  url: Schema.String,
  method: Schema.String,
  resourceType: ResourceType,
  referrer: Schema.String,
  timestamp: Schema.Number,
  webContentsId: Schema.optionalKey(Schema.Number),
} as const;

export const Request = Schema.Struct(requestFields);
export type Request = typeof Request.Type;
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
  statusCode: Schema.Number,
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
    statusCode: Schema.Number,
    statusLine: Schema.String,
    headers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    ...observed,
    stage: Schema.Literal("redirect"),
    statusCode: Schema.Number,
    redirectUrl: Schema.String,
  }),
  Schema.Struct({
    ...observed,
    stage: Schema.Literal("completed"),
    statusCode: Schema.Number,
    statusLine: Schema.String,
  }),
  Schema.Struct({ ...observed, stage: Schema.Literal("error"), error: Schema.String }),
]);
export type Event = typeof Event.Type;
