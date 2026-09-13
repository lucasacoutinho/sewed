import { net } from "electron";
import { Effect, Layer, Schema, Stream } from "effect";
import { Headers, HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http";
import * as Net from "../Net.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { Handle as SessionHandle } from "./Session.ts";
import { resolve as resolveSession } from "./Session.ts";

export { Endpoint, ResolvedHost } from "../Net.ts";

export interface Options {
  /** Route requests through this session's cookies, cache, proxy, and interception. */
  readonly session?: SessionHandle;
  /** Skip handlers registered with `Protocol.handle` for this client. */
  readonly bypassCustomProtocolHandlers?: boolean;
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Effect's HTTP client over Electron's Chromium network stack instead of Node's. */
const client = (fetch: Fetch, extra: { readonly bypassCustomProtocolHandlers?: boolean }) =>
  HttpClient.make((request, url, signal) => {
    let headers = request.headers;
    if (headers["content-length"]) headers = Headers.remove(headers, "content-length");
    const send = (body: BodyInit | undefined) =>
      Effect.map(
        Effect.tryPromise({
          try: () =>
            fetch(url, {
              ...extra,
              method: request.method,
              headers,
              body,
              duplex: request.body._tag === "Stream" ? "half" : undefined,
              signal,
            } as RequestInit),
          catch: (cause) =>
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, cause }),
            }),
        }),
        (response) => HttpClientResponse.fromWeb(request, response),
      );
    switch (request.body._tag) {
      case "Raw":
      case "Uint8Array":
        return send(request.body.body as BodyInit);
      case "FormData":
        return send(request.body.formData);
      case "Stream":
        return Effect.flatMap(Stream.toReadableStreamEffect(request.body.stream), send);
    }
    return send(undefined);
  });

/** Provides `HttpClient` backed by `net.fetch`, or a session's `fetch` when one is given. */
export const layer = (
  options: Options = {},
): Layer.Layer<HttpClient.HttpClient, SewedError, MainContext> =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      yield* MainContext;
      const extra =
        options.bypassCustomProtocolHandlers === undefined
          ? {}
          : { bypassCustomProtocolHandlers: options.bypassCustomProtocolHandlers };
      if (options.session === undefined)
        return client((input, init) => net.fetch(String(input), init), extra);
      const session = yield* Effect.try({
        try: () => resolveSession(options.session!),
        catch: (cause) =>
          new SewedError({ code: "Native", message: "Unknown session handle", cause }),
      });
      return client((input, init) => session.fetch(String(input), init), extra);
    }),
  );

export const online: Effect.Effect<boolean, SewedError, MainContext> = Effect.andThen(
  MainContext,
  Effect.try({
    try: () => net.isOnline(),
    catch: (cause) =>
      new SewedError({ code: "Native", message: "Could not read online state", cause }),
  }),
);

const decodeHost = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
export const resolveHost = (
  host: string,
): Effect.Effect<Net.ResolvedHost, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeHost(host),
      catch: (cause) => new SewedError({ code: "Protocol", message: "Invalid host", cause }),
    }),
    (value) =>
      Effect.andThen(
        MainContext,
        Effect.tryPromise({
          try: async () => {
            const resolved = await net.resolveHost(value);
            return {
              endpoints: resolved.endpoints.map(({ address, family }) => ({ address, family })),
            };
          },
          catch: (cause) =>
            new SewedError({ code: "Native", message: "Could not resolve host", cause }),
        }),
      ),
  );
