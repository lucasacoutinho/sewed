import type { Session } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as WebRequest from "../WebRequest.ts";

/** Deciders run in main with the caller's services; a failing decider blocks its request. */
export interface Rules<R> {
  readonly filter: WebRequest.Filter;
  readonly request?: (
    request: WebRequest.Request,
  ) => Effect.Effect<WebRequest.RequestDecision, unknown, R>;
  readonly requestHeaders?: (
    request: WebRequest.RequestHeaders,
  ) => Effect.Effect<WebRequest.RequestHeadersDecision, unknown, R>;
  readonly responseHeaders?: (
    response: WebRequest.Response,
  ) => Effect.Effect<WebRequest.ResponseDecision, unknown, R>;
}

interface Intercept {
  readonly matches: (url: URL, type: string) => boolean;
  readonly urls: readonly string[];
  readonly types: readonly string[] | undefined;
  readonly request?: (request: WebRequest.Request) => Promise<WebRequest.RequestDecision>;
  readonly requestHeaders?: (
    request: WebRequest.RequestHeaders,
  ) => Promise<WebRequest.RequestHeadersDecision>;
  readonly responseHeaders?: (
    response: WebRequest.Response,
  ) => Promise<WebRequest.ResponseDecision>;
}

interface Registry {
  readonly native: Session;
  readonly intercepts: Set<Intercept>;
}

const registries = new WeakMap<Session, Registry>();
const decodeFilter = Schema.decodeUnknownSync(WebRequest.Filter);
const decodeRequestDecision = Schema.decodeUnknownSync(WebRequest.RequestDecision);
const decodeRequestHeadersDecision = Schema.decodeUnknownSync(WebRequest.RequestHeadersDecision);
const decodeResponseDecision = Schema.decodeUnknownSync(WebRequest.ResponseDecision);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

const registryOf = (native: Session): Registry => {
  const existing = registries.get(native);
  if (existing !== undefined) return existing;
  const registry: Registry = { native, intercepts: new Set() };
  registries.set(native, registry);
  return registry;
};

type Stage = "request" | "requestHeaders" | "responseHeaders";

/** One native listener per stage covers the union of the installed filters. */
const nativeFilter = (registry: Registry, stage: Stage): Electron.WebRequestFilter | undefined => {
  const active = [...registry.intercepts].filter((intercept) => intercept[stage] !== undefined);
  if (active.length === 0) return undefined;
  const urls = [...new Set(active.flatMap((intercept) => intercept.urls))];
  const everything = active.some((intercept) => intercept.types === undefined);
  const types = everything
    ? undefined
    : [...new Set(active.flatMap((intercept) => intercept.types ?? []))].filter(
        (type): type is Exclude<WebRequest.ResourceType, "other"> => type !== "other",
      );
  return types === undefined ? { urls } : { urls, types };
};

type Details = Pick<
  Electron.OnBeforeRequestListenerDetails,
  "id" | "url" | "method" | "resourceType" | "referrer" | "timestamp" | "webContentsId"
>;
const requestOf = (details: Details): WebRequest.Request => ({
  id: details.id,
  url: details.url,
  method: details.method,
  resourceType: details.resourceType,
  referrer: details.referrer,
  timestamp: details.timestamp,
  ...(details.webContentsId === undefined ? {} : { webContentsId: details.webContentsId }),
});

const matching = (registry: Registry, stage: Stage, url: string, type: string) => {
  const parsed = URL.parse(url);
  return parsed === null
    ? []
    : [...registry.intercepts].filter(
        (intercept) => intercept[stage] !== undefined && intercept.matches(parsed, type),
      );
};

const reinstall = (registry: Registry) => {
  const { webRequest } = registry.native;
  const requestFilter = nativeFilter(registry, "request");
  if (requestFilter === undefined) webRequest.onBeforeRequest(null);
  else
    webRequest.onBeforeRequest(requestFilter, (details, callback) => {
      void (async () => {
        const request = requestOf(details);
        for (const intercept of matching(registry, "request", details.url, details.resourceType)) {
          const decision = await intercept.request!(request);
          if (decision.kind === "block") return callback({ cancel: true });
          if (decision.kind === "redirect") return callback({ redirectURL: decision.url });
        }
        callback({});
      })();
    });
  const headersFilter = nativeFilter(registry, "requestHeaders");
  if (headersFilter === undefined) webRequest.onBeforeSendHeaders(null);
  else
    webRequest.onBeforeSendHeaders(headersFilter, (details, callback) => {
      void (async () => {
        let headers: Record<string, string> = { ...details.requestHeaders };
        for (const intercept of matching(
          registry,
          "requestHeaders",
          details.url,
          details.resourceType,
        )) {
          const decision = await intercept.requestHeaders!({ ...requestOf(details), headers });
          if (decision.kind === "block") return callback({ cancel: true });
          if (decision.kind === "headers") headers = { ...decision.headers };
        }
        callback({ requestHeaders: headers });
      })();
    });
  const responseFilter = nativeFilter(registry, "responseHeaders");
  if (responseFilter === undefined) webRequest.onHeadersReceived(null);
  else
    webRequest.onHeadersReceived(responseFilter, (details, callback) => {
      void (async () => {
        let headers: Record<string, readonly string[]> = { ...(details.responseHeaders ?? {}) };
        let statusLine = details.statusLine;
        for (const intercept of matching(
          registry,
          "responseHeaders",
          details.url,
          details.resourceType,
        )) {
          const decision = await intercept.responseHeaders!({
            ...requestOf(details),
            statusLine,
            statusCode: details.statusCode,
            headers,
          });
          if (decision.kind === "block") return callback({ cancel: true });
          if (decision.kind === "headers") {
            headers = { ...decision.headers };
            if (decision.statusLine !== undefined) statusLine = decision.statusLine;
          }
        }
        callback({
          responseHeaders: Object.fromEntries(
            Object.entries(headers).map(([name, values]) => [name, [...values]]),
          ),
          statusLine,
        });
      })();
    });
};

/**
 * Installs deciders for the scope's lifetime. Each stage runs the matching deciders in
 * installation order; the first block or redirect wins, header decisions chain, and a decider
 * that fails or dies blocks its request.
 */
export const intercept = <R>(
  native: Session,
  rules: Rules<R>,
): Effect.Effect<void, SewedError, MainContext | Scope.Scope | R> =>
  Effect.gen(function* () {
    yield* MainContext;
    const filter = yield* Effect.try({
      try: () => decodeFilter(rules.filter),
      catch: (cause) => protocolError("Invalid request filter", cause),
    });
    const context = yield* Effect.context<R>();
    const run = Effect.runPromiseWith(context);
    const patterns = filter.urls.map(WebRequest.compilePattern);
    const types = filter.types === undefined ? undefined : new Set<string>(filter.types);
    const decide =
      <I, D>(
        stage: string,
        decider: ((input: I) => Effect.Effect<D, unknown, R>) | undefined,
        decode: (value: unknown) => D,
        block: D,
      ) =>
      (input: I) =>
        run(
          Effect.suspend(() => decider!(input)).pipe(
            Effect.map(decode),
            Effect.catchCause((cause) =>
              Effect.as(
                Effect.logError(`Request ${stage} decider failed; request blocked`, cause),
                block,
              ),
            ),
          ),
        );
    const record: Intercept = {
      matches: (url, type) =>
        (types === undefined || types.has(type)) && patterns.some((allows) => allows(url)),
      urls: filter.urls,
      types: filter.types,
      ...(rules.request === undefined
        ? {}
        : { request: decide("request", rules.request, decodeRequestDecision, { kind: "block" }) }),
      ...(rules.requestHeaders === undefined
        ? {}
        : {
            requestHeaders: decide(
              "request header",
              rules.requestHeaders,
              decodeRequestHeadersDecision,
              { kind: "block" },
            ),
          }),
      ...(rules.responseHeaders === undefined
        ? {}
        : {
            responseHeaders: decide(
              "response header",
              rules.responseHeaders,
              decodeResponseDecision,
              { kind: "block" },
            ),
          }),
    };
    const registry = registryOf(native);
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        registry.intercepts.add(record);
        reinstall(registry);
      }),
      () =>
        Effect.sync(() => {
          registry.intercepts.delete(record);
          reinstall(registry);
        }),
    );
  });
