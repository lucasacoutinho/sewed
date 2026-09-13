import type { Session } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import type { Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as WebRequest from "../WebRequest.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as Observation from "./Observation.ts";

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
  readonly body: WebRequest.BodyFilter | undefined;
  readonly request?: (request: WebRequest.Request) => Promise<WebRequest.RequestDecision>;
  readonly requestHeaders?: (
    request: WebRequest.RequestHeaders,
  ) => Promise<WebRequest.RequestHeadersDecision>;
  readonly responseHeaders?: (
    response: WebRequest.Response,
  ) => Promise<WebRequest.ResponseDecision>;
}

interface Tap {
  readonly matches: (url: URL, type: string) => boolean;
  readonly urls: readonly string[];
  readonly types: readonly string[] | undefined;
  readonly offer: (event: WebRequest.Event) => void;
}

interface Registry {
  readonly native: Session;
  readonly intercepts: Set<Intercept>;
  readonly taps: Set<Tap>;
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
  const registry: Registry = { native, intercepts: new Set(), taps: new Set() };
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
const requestOf = (details: Details): WebRequest.Request => {
  const sourceId = ContentsRegistry.handleIdOf(details.webContentsId);
  return {
    id: details.id,
    url: details.url,
    method: details.method,
    resourceType: details.resourceType,
    referrer: details.referrer,
    timestamp: details.timestamp,
    ...(details.webContentsId === undefined ? {} : { webContentsId: details.webContentsId }),
    ...(sourceId === undefined ? {} : { sourceId }),
  };
};

type UploadData = Pick<Electron.UploadData, "bytes" | "file" | "blobUUID">;

/** A part is kept only when it fits the remaining budget; the first that does not ends the body. */
export const assembleBody = async (
  parts: readonly UploadData[],
  filter: WebRequest.BodyFilter,
  blob: (id: string) => Promise<Uint8Array>,
): Promise<WebRequest.Body> => {
  const kept: WebRequest.UploadPart[] = [];
  let bytes = 0;
  for (const part of parts) {
    if (part.file !== undefined) {
      kept.push({ kind: "file", path: part.file });
      continue;
    }
    if (part.blobUUID !== undefined && filter.blobs === "reference") {
      kept.push({ kind: "blob", id: part.blobUUID });
      continue;
    }
    const data =
      part.blobUUID === undefined ? new Uint8Array(part.bytes) : await blob(part.blobUUID);
    if (bytes + data.byteLength > filter.maxBytes) return { parts: kept, bytes, truncated: true };
    bytes += data.byteLength;
    kept.push({ kind: "bytes", bytes: data });
  }
  return { parts: kept, bytes, truncated: false };
};

const matching = (registry: Registry, stage: Stage, url: string, type: string) => {
  const parsed = URL.parse(url);
  return parsed === null
    ? []
    : [...registry.intercepts].filter(
        (intercept) => intercept[stage] !== undefined && intercept.matches(parsed, type),
      );
};

const unionFilter = (
  entries: readonly {
    readonly urls: readonly string[];
    readonly types: readonly string[] | undefined;
  }[],
): Electron.WebRequestFilter | undefined => {
  if (entries.length === 0) return undefined;
  const urls = [...new Set(entries.flatMap((entry) => entry.urls))];
  const everything = entries.some((entry) => entry.types === undefined);
  const types = everything
    ? undefined
    : [...new Set(entries.flatMap((entry) => entry.types ?? []))].filter(
        (type): type is Exclude<WebRequest.ResourceType, "other"> => type !== "other",
      );
  return types === undefined ? { urls } : { urls, types };
};

const observedOf = <D extends Details & { readonly fromCache: boolean }>(details: D) => ({
  ...requestOf(details),
  fromCache: details.fromCache,
});

const reinstallTaps = (registry: Registry) => {
  const { webRequest } = registry.native;
  const filter = unionFilter([...registry.taps]);
  const dispatch = (url: string, type: string, event: WebRequest.Event) => {
    const parsed = URL.parse(url);
    if (parsed === null) return;
    for (const tap of registry.taps) if (tap.matches(parsed, type)) tap.offer(event);
  };
  if (filter === undefined) {
    webRequest.onSendHeaders(null);
    webRequest.onResponseStarted(null);
    webRequest.onBeforeRedirect(null);
    webRequest.onCompleted(null);
    webRequest.onErrorOccurred(null);
    return;
  }
  webRequest.onSendHeaders(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...requestOf(details),
      stage: "sent",
      headers: { ...details.requestHeaders },
    }),
  );
  webRequest.onResponseStarted(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...observedOf(details),
      stage: "response",
      statusCode: details.statusCode,
      statusLine: details.statusLine,
      headers: Object.fromEntries(
        Object.entries(details.responseHeaders ?? {}).map(([name, values]) => [name, [...values]]),
      ),
    }),
  );
  webRequest.onBeforeRedirect(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...observedOf(details),
      stage: "redirect",
      statusCode: details.statusCode,
      redirectUrl: details.redirectURL,
    }),
  );
  webRequest.onCompleted(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...observedOf(details),
      stage: "completed",
      statusCode: details.statusCode,
      statusLine: details.statusLine,
    }),
  );
  webRequest.onErrorOccurred(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...observedOf(details),
      stage: "error",
      error: details.error,
    }),
  );
};

/**
 * Observes the request stages deciders never see: headers sent, response started, redirects,
 * completion, and errors. One native listener per stage covers the union of the installed
 * filters; each observer owns its registration and a bounded queue.
 */
export const observe = (
  native: Session,
  filter: WebRequest.Filter,
): Stream.Stream<WebRequest.Event, SewedError, MainContext> =>
  Observation.listen<WebRequest.Event>("Request", (offer) =>
    Effect.try({
      try: () => {
        const settings = decodeFilter(filter);
        const patterns = settings.urls.map(WebRequest.compilePattern);
        const types = settings.types === undefined ? undefined : new Set<string>(settings.types);
        const tap: Tap = {
          matches: (url, type) =>
            (types === undefined || types.has(type)) && patterns.some((allows) => allows(url)),
          urls: settings.urls,
          types: settings.types,
          offer,
        };
        const registry = registryOf(native);
        registry.taps.add(tap);
        reinstallTaps(registry);
        return () => {
          registry.taps.delete(tap);
          reinstallTaps(registry);
        };
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid request filter", cause),
    }),
  );

const reinstall = (registry: Registry) => {
  const { webRequest } = registry.native;
  const requestFilter = nativeFilter(registry, "request");
  if (requestFilter === undefined) webRequest.onBeforeRequest(null);
  else
    webRequest.onBeforeRequest(requestFilter, (details, callback) => {
      void (async () => {
        const request = requestOf(details);
        const blobs = new Map<string, Promise<Uint8Array>>();
        const blob = (id: string) => {
          const existing = blobs.get(id);
          if (existing !== undefined) return existing;
          const read = registry.native.getBlobData(id).then((buffer) => new Uint8Array(buffer));
          blobs.set(id, read);
          return read;
        };
        for (const intercept of matching(registry, "request", details.url, details.resourceType)) {
          let input = request;
          if (intercept.body !== undefined) {
            try {
              const body = await assembleBody(details.uploadData ?? [], intercept.body, blob);
              input = { ...request, body };
            } catch (cause) {
              Effect.runFork(
                Effect.logError("Request body could not be read; request blocked", cause),
              );
              return callback({ cancel: true });
            }
          }
          const decision = await intercept.request!(input);
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
      body: filter.body,
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
