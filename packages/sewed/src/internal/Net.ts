import { net } from "electron";
import { Deferred, Effect, Layer, Schema, Stream } from "effect";
import type { Scope } from "effect";
import { Headers, HttpClient, HttpClientError, HttpClientResponse } from "effect/http";
import * as Net from "../Net.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observers from "./Observers.ts";
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

const decodeSocketOptions = Schema.decodeUnknownSync(Net.WebSocketOptions);

/** An open WebSocket made through Chromium's network stack, owned by the scope that made it. */
export interface WebSocketHandle {
  /** Messages as they arrive: text as a string, binary as bytes. Ends when the socket closes. */
  readonly messages: Stream.Stream<string | Uint8Array, SewedError, MainContext>;
  readonly send: (data: string | Uint8Array) => Effect.Effect<void, SewedError, MainContext>;
  /** Resolves with the close code and reason once the socket has closed, by either side. */
  readonly closed: Effect.Effect<Net.WebSocketClose, SewedError, MainContext>;
}

/**
 * Opens a WebSocket from the main process through Chromium's network stack, so it follows the
 * session's proxy, certificates and cookies, where Node's own socket follows none of them. It
 * resolves once the socket is open and fails `Native` if it cannot open; closing the scope
 * closes the socket.
 */
export const webSocket = (
  url: string,
  options: Net.WebSocketOptions = {},
  session?: SessionHandle,
): Effect.Effect<WebSocketHandle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const settings = yield* Effect.try({
      try: () => {
        const target = new URL(url);
        if (target.protocol !== "ws:" && target.protocol !== "wss:")
          throw new SewedError({ code: "Protocol", message: "A WebSocket URL is ws: or wss:" });
        return { href: target.href, ...decodeSocketOptions(options) };
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Protocol", message: "Invalid WebSocket request", cause }),
    });
    const messages = Observers.make<string | Uint8Array>("WebSocket");
    const closed = yield* Deferred.make<Net.WebSocketClose>();
    const socket = yield* Effect.acquireRelease(
      Effect.callback<InstanceType<typeof net.WebSocket>, SewedError>((resume) => {
        try {
          const native = new net.WebSocket(settings.href, {
            ...(settings.protocols === undefined ? {} : { protocols: [...settings.protocols] }),
            ...(settings.headers === undefined ? {} : { headers: { ...settings.headers } }),
            ...(settings.origin === undefined ? {} : { origin: settings.origin }),
            ...(session === undefined ? {} : { session: resolveSession(session) }),
          });
          native.binaryType = "arraybuffer";
          let opened = false;
          native.onopen = () => {
            opened = true;
            resume(Effect.succeed(native));
          };
          native.onmessage = (event: { readonly data: unknown }) => {
            const data = event.data;
            if (typeof data === "string") messages.publish(data);
            else if (data instanceof ArrayBuffer) messages.publish(new Uint8Array(data));
          };
          native.onclose = (event: {
            readonly code: number;
            readonly reason: string;
            readonly wasClean: boolean;
          }) => {
            messages.finish();
            Deferred.doneUnsafe(
              closed,
              Effect.succeed({ code: event.code, reason: event.reason, wasClean: event.wasClean }),
            );
            if (!opened)
              resume(
                Effect.fail(
                  new SewedError({
                    code: "Native",
                    message: `The WebSocket closed before it opened (code ${event.code})`,
                  }),
                ),
              );
          };
        } catch (cause) {
          resume(
            Effect.fail(
              new SewedError({ code: "Native", message: "Could not open the WebSocket", cause }),
            ),
          );
        }
      }),
      (native) =>
        Effect.sync(() => {
          messages.finish();
          try {
            native.close();
          } catch {
            // Already closed.
          }
        }),
    );
    return {
      messages: messages.stream,
      send: (data) =>
        Effect.andThen(
          MainContext,
          Effect.try({
            try: () => {
              if (typeof data !== "string" && !(data instanceof Uint8Array))
                throw new SewedError({
                  code: "Protocol",
                  message: "A WebSocket message is a string or bytes",
                });
              socket.send(data);
            },
            catch: (cause) =>
              cause instanceof SewedError
                ? cause
                : new SewedError({ code: "Native", message: "Could not send the message", cause }),
          }),
        ),
      closed: Effect.andThen(MainContext, Deferred.await(closed)),
    };
  });
