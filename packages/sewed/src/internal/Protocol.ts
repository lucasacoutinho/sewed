import { Context, Effect, Exit, Fiber, Scope } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import type { Handle as SessionHandle } from "./Session.ts";
import * as Session from "./Session.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Protocol from "../Protocol.ts";

export { Privileges, scheme, definition } from "../Protocol.ts";
export type {
  Handler,
  Request,
  Response,
  Scheme,
  SchemeDefinition,
  WebHandler,
} from "../Protocol.ts";

// This module carries `serve`/`handle`/`serveWeb`/`handleWeb` — everything that only ever needs
// a session someone already resolved — and touches no Electron value import at module scope, so a
// test can import it directly under plain Node. `declare`'s own registration (`app.isReady()`,
// `protocol.registerSchemesAsPrivileged`) lives in `ProtocolSchemes.ts`, which imports back from
// here (`validateScheme`, `protocolError`) rather than the reverse, so nothing here ever pulls
// Electron in; `ProtocolMain.ts` is the one place that combines both for `sewed/main`'s own barrel.
const schemePattern = /^[a-z][a-z0-9+.-]*$/;
const reservedSchemes = new Set([
  "about",
  "blob",
  "chrome",
  "chrome-extension",
  "chrome-search",
  "data",
  "devtools",
  "edge",
  "file",
  "ftp",
  "http",
  "https",
  "javascript",
  "mailto",
  "resource",
  "view-source",
  "ws",
  "wss",
]);
const privilegeKeys = new Set([
  "standard",
  "secure",
  "supportFetchAPI",
  "corsEnabled",
  "stream",
  "serviceWorkers",
  "codeCache",
]);

export const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

/** Validates a scheme's own declared shape; `ProtocolSchemes.ts`'s `registerSchemes` shares it. */
export const validateScheme = (value: Protocol.Scheme): Protocol.SchemeDefinition => {
  const details = Protocol.definition(value);
  if (details === undefined) throw protocolError("Unknown protocol scheme definition");
  if (!schemePattern.test(details.name) || details.name !== details.name.toLowerCase()) {
    throw protocolError(`Invalid protocol scheme name: ${details.name}`);
  }
  if (reservedSchemes.has(details.name)) {
    throw protocolError(`Reserved protocol scheme name: ${details.name}`);
  }
  for (const key of Object.keys(details.privileges)) {
    if (!privilegeKeys.has(key)) throw protocolError(`Unsupported protocol privilege: ${key}`);
  }
  if (details.privileges.codeCache === true && details.privileges.standard !== true) {
    throw protocolError("The codeCache privilege requires standard");
  }
  const privileges = Protocol.Privileges.make(details.privileges);
  return { name: details.name, privileges };
};

const internalServerError = () =>
  new globalThis.Response("Internal Server Error", {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

interface ActiveRequest {
  readonly close: (reason?: unknown) => Promise<void>;
}

const maximumActiveRequests = 128;

const internalServiceUnavailable = () =>
  new globalThis.Response("Service Unavailable", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

const closeScope = (scope: Scope.Closeable): Promise<void> =>
  Effect.runPromise(Scope.close(scope, Exit.void));

const serve = <E, R>(
  request: globalThis.Request,
  registrationContext: Context.Context<R | MainContext>,
  handler: Protocol.Handler<E, R>,
  active: Set<ActiveRequest>,
  isClosed: () => boolean,
  reportCleanupFailure: (cause: unknown) => void,
): Promise<globalThis.Response> => {
  if (isClosed()) return Promise.resolve(internalServerError());
  if (active.size >= maximumActiveRequests) return Promise.resolve(internalServiceUnavailable());

  const requestScope = Scope.makeUnsafe("parallel");
  const requestValue = HttpServerRequest.fromWeb(request);
  const requestContext = Context.add(
    Context.add(registrationContext, Scope.Scope, requestScope),
    HttpServerRequest.HttpServerRequest,
    requestValue,
  );
  let fiber: Fiber.Fiber<HttpServerResponse.HttpServerResponse, E> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let readerCancellation: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let settled = false;
  let resolveResponse: ((response: globalThis.Response) => void) | undefined;
  let removeAbortListener: (() => void) | undefined;
  const response = new Promise<globalThis.Response>((resolve) => {
    resolveResponse = resolve;
  });
  const resolveResponseOnce = (value: globalThis.Response) => {
    if (settled) return;
    settled = true;
    resolveResponse?.(value);
  };
  const cancelReader = (reason?: unknown): Promise<void> => {
    if (reader === undefined) return Promise.resolve();
    if (readerCancellation === undefined) {
      readerCancellation = Promise.resolve().then(() => reader?.cancel(reason));
    }
    return readerCancellation;
  };
  const close = (reason?: unknown): Promise<void> => {
    if (closing !== undefined) return closing;
    closing = (async () => {
      removeAbortListener?.();
      removeAbortListener = undefined;
      const currentFiber = fiber;
      const interrupt =
        currentFiber === undefined
          ? Promise.resolve()
          : Promise.resolve().then(() =>
              Effect.runPromise(Fiber.interrupt(currentFiber).pipe(Effect.asVoid)),
            );
      const failures: unknown[] = [];
      try {
        const interruption = await Promise.allSettled([cancelReader(reason), interrupt]);
        for (const result of interruption) {
          if (result.status === "rejected") failures.push(result.reason);
        }
        const scopeClose = await Promise.allSettled([closeScope(requestScope)]);
        for (const result of scopeClose) {
          if (result.status === "rejected") failures.push(result.reason);
        }
      } finally {
        active.delete(resource);
        resolveResponseOnce(internalServerError());
      }
      if (failures.length > 0) {
        throw nativeError("Could not clean up protocol request", failures);
      }
    })();
    return closing;
  };
  const resource: ActiveRequest = { close };
  active.add(resource);
  const observeClose = async (reason?: unknown): Promise<void> => {
    try {
      await close(reason);
    } catch (cause) {
      reportCleanupFailure(cause);
    }
  };
  const cancelUnacceptedBody = async (body: ReadableStream<Uint8Array>): Promise<void> => {
    const result = await Promise.allSettled([Promise.resolve().then(() => body.cancel())]);
    for (const value of result) {
      if (value.status === "rejected") reportCleanupFailure(value.reason);
    }
  };

  const finish = async (value: HttpServerResponse.HttpServerResponse) => {
    try {
      const nativeResponse = HttpServerResponse.toWeb(value, { context: requestContext });
      if (nativeResponse.body === null) {
        resolveResponseOnce(nativeResponse);
        await observeClose();
        return;
      }
      if (closing !== undefined) {
        await cancelUnacceptedBody(nativeResponse.body);
        await observeClose();
        return;
      }
      reader = nativeResponse.body.getReader();
      if (closing !== undefined) {
        await observeClose();
        return;
      }
      const wrapped = new globalThis.ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const currentReader = reader;
            if (currentReader === undefined) throw new Error("Protocol response reader is missing");
            const next = await currentReader.read();
            if (next.done) {
              controller.close();
              await observeClose();
            } else {
              controller.enqueue(next.value);
            }
          } catch (cause) {
            controller.error(new Error("Protocol response body failed"));
            await observeClose(cause);
          }
        },
        async cancel(reason) {
          await observeClose(reason);
        },
      });
      if (closing !== undefined) {
        await observeClose();
        return;
      }
      resolveResponseOnce(
        new globalThis.Response(wrapped, {
          status: nativeResponse.status,
          statusText: nativeResponse.statusText,
          headers: nativeResponse.headers,
        }),
      );
    } catch (cause) {
      reportCleanupFailure(nativeError("Could not convert protocol response", cause));
      await observeClose();
    }
  };

  const abort = () => {
    void observeClose();
  };
  request.signal.addEventListener("abort", abort, { once: true });
  removeAbortListener = () => request.signal.removeEventListener("abort", abort);
  if (request.signal.aborted) {
    void observeClose();
    return response;
  }
  try {
    fiber = Effect.runForkWith(requestContext)(
      handler(requestValue).pipe(Scope.provide(requestScope)),
    );
    void Effect.runPromiseExit(Fiber.join(fiber)).then((exit) => {
      if (exit._tag === "Success") void finish(exit.value);
      else void observeClose();
    });
  } catch {
    void observeClose();
  }
  return response;
};

/**
 * The web-shaped counterpart to `serve`: `handler` is a plain function over the native
 * `Request`/`Response` the platform already speaks, so there is no `HttpServerRequest`/
 * `HttpServerResponse` conversion, no Effect, and no per-request Fiber to interrupt. What still
 * matches `serve`: the same `active`-set bookkeeping (so the owning registration's teardown can
 * reach every in-flight call), the same `maximumActiveRequests` admission, and the same answer —
 * `internalServerError()` — for a handler that throws or rejects, exactly as a failed Effect
 * handler's fiber settles today.
 *
 * `request.signal` aborts on a native abort, on the registration's own teardown (its owning scope
 * closing while the call is still in flight), on a handler throw, or when the page cancels the
 * response body it was handed — never merely because the handler returned. A body-less response
 * finishes the request at once, with no abort. A response carrying a body is rebuilt around a
 * `ReadableStream` that pulls from the handler's own reader: it finishes, with no abort, once
 * that reader reports `done`; a read error on it errors the rebuilt body the same way, again with
 * no abort of its own. A handler that chains its own `fetch` onto `request.signal` — as the guide
 * recommends — therefore keeps its upstream call alive for exactly as long as the page keeps
 * reading the response it was handed, the same contract `serve`'s own request scope carries.
 */
const serveWeb = (
  request: globalThis.Request,
  handler: Protocol.WebHandler,
  active: Set<ActiveRequest>,
  isClosed: () => boolean,
): Promise<globalThis.Response> => {
  if (isClosed()) return Promise.resolve(internalServerError());
  if (active.size >= maximumActiveRequests) return Promise.resolve(internalServiceUnavailable());

  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let settled = false;
  const onNativeAbort = () => close(request.signal.reason);
  // Bookkeeping alone, shared by every way this request ends: stop listening for a native abort
  // that can no longer matter and drop this request's own teardown handle. Never aborts the
  // controller by itself — `close` below is what a genuine abort trigger calls first.
  const settle = (): void => {
    if (settled) return;
    settled = true;
    request.signal.removeEventListener("abort", onNativeAbort);
    active.delete(resource);
  };
  // The one path that aborts `controller`: a native abort, the registration's own teardown, or
  // the page cancelling the response body all call this. A handler that already finished
  // normally (body-less, or read to `done`) never reaches it — `settle` alone closes that out.
  // `controller.abort` runs first, so a handler body chained on this same signal (the guide's
  // own recommended shape) can already be erroring by the time `reader.cancel` below runs; that
  // rejection is this teardown's own business; an uncaught listener must never see it.
  const close = (reason?: unknown): void => {
    if (settled) return;
    controller.abort(reason);
    void reader?.cancel(reason).catch(() => {});
    settle();
  };
  const resource: ActiveRequest = { close: (reason) => Promise.resolve(close(reason)) };
  active.add(resource);
  if (request.signal.aborted) {
    close(request.signal.reason);
    return Promise.resolve(internalServerError());
  }
  request.signal.addEventListener("abort", onNativeAbort, { once: true });
  const scopedRequest = new globalThis.Request(request, { signal: controller.signal });

  return (async () => {
    try {
      const result = await handler(scopedRequest);
      if (controller.signal.aborted) {
        await result.body?.cancel(controller.signal.reason).catch(() => {});
        return new globalThis.Response(null, {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
        });
      }
      if (result.body === null) {
        settle();
        return result;
      }
      reader = result.body.getReader();
      const wrapped = new globalThis.ReadableStream<Uint8Array>({
        async pull(sink) {
          const currentReader = reader;
          if (currentReader === undefined) {
            sink.error(new Error("Protocol response reader is missing"));
            settle();
            return;
          }
          try {
            const next = await currentReader.read();
            if (controller.signal.aborted) {
              sink.error(controller.signal.reason);
              return;
            }
            if (next.done) {
              sink.close();
              settle();
            } else {
              sink.enqueue(next.value);
            }
          } catch {
            sink.error(new Error("Protocol response body failed"));
            settle();
          }
        },
        cancel(reason) {
          close(reason);
        },
      });
      return new globalThis.Response(wrapped, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      });
    } catch {
      close();
      return internalServerError();
    }
  })();
};

export const handleWeb = (
  session: SessionHandle,
  value: Protocol.Scheme,
  handler: Protocol.WebHandler,
): Effect.Effect<void, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const details = yield* Effect.try({
      try: () => validateScheme(value),
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : protocolError("Could not validate protocol scheme", cause),
    });
    const nativeSession = yield* Effect.try({
      try: () => Session.resolve(session),
      catch: (cause) => nativeError("Could not resolve protocol session", cause),
    });
    const active = new Set<ActiveRequest>();
    let closed = false;
    const nativeHandler = (request: globalThis.Request) =>
      serveWeb(request, handler, active, () => closed);
    yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          nativeSession.protocol.handle(details.name, nativeHandler);
        },
        catch: (cause) => nativeError("Could not install protocol handler", cause),
      }),
      () =>
        Effect.promise(async () => {
          closed = true;
          let unhandleError: unknown;
          try {
            nativeSession.protocol.unhandle(details.name);
          } catch (cause) {
            unhandleError = cause;
          }
          const requests = await Promise.allSettled([...active].map((request) => request.close()));
          const failures = requests.filter((result) => result.status === "rejected");
          if (unhandleError !== undefined || failures.length > 0) {
            throw nativeError("Could not clean up protocol registration", {
              unhandleError,
              failureCount: failures.length,
            });
          }
        }),
    );
  });

export const handle = <E, R>(
  session: SessionHandle,
  value: Protocol.Scheme,
  handler: Protocol.Handler<E, R>,
): Effect.Effect<void, SewedError, MainContext | R | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const details = yield* Effect.try({
      try: () => validateScheme(value),
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : protocolError("Could not validate protocol scheme", cause),
    });
    const nativeSession = yield* Effect.try({
      try: () => Session.resolve(session),
      catch: (cause) => nativeError("Could not resolve protocol session", cause),
    });
    const registrationContext = yield* Effect.context<R | MainContext>();
    const active = new Set<ActiveRequest>();
    let firstCleanupFailure: SewedError | undefined;
    let cleanupFailureCount = 0;
    const reportCleanupFailure = (cause: unknown) => {
      cleanupFailureCount += 1;
      if (firstCleanupFailure === undefined) {
        firstCleanupFailure =
          cause instanceof SewedError
            ? cause
            : nativeError("Could not clean up protocol request", cause);
      }
    };
    let closed = false;
    const nativeHandler = (request: globalThis.Request) =>
      serve(request, registrationContext, handler, active, () => closed, reportCleanupFailure);
    yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          nativeSession.protocol.handle(details.name, nativeHandler);
        },
        catch: (cause) => nativeError("Could not install protocol handler", cause),
      }),
      () =>
        Effect.promise(async () => {
          closed = true;
          let unhandleError: unknown;
          try {
            nativeSession.protocol.unhandle(details.name);
          } catch (cause) {
            unhandleError = cause;
          }
          const requests = await Promise.allSettled([...active].map((request) => request.close()));
          for (const result of requests) {
            if (result.status === "rejected") reportCleanupFailure(result.reason);
          }
          if (unhandleError !== undefined || cleanupFailureCount > 0) {
            throw nativeError("Could not clean up protocol registration", {
              unhandleError,
              firstCleanupFailure,
              cleanupFailureCount,
            });
          }
        }),
    );
  });
