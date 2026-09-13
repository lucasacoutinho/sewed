import { app, protocol } from "electron";
import { Context, Effect, Exit, Fiber, Scope } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import type { Handle as SessionHandle } from "./Session.ts";
import * as Session from "./Session.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Protocol from "../Protocol.ts";

export { Privileges, scheme, definition } from "../Protocol.ts";
export type { Handler, Request, Response, Scheme, SchemeDefinition } from "../Protocol.ts";

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

const startupError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Startup", message, ...(cause === undefined ? {} : { cause }) });
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

const definition = (value: Protocol.Scheme): Protocol.SchemeDefinition => {
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

const nativePrivileges = (value: Protocol.Privileges): Electron.Privileges => {
  const privileges: Electron.Privileges = {};
  if (value.standard !== undefined) privileges.standard = value.standard;
  if (value.secure !== undefined) privileges.secure = value.secure;
  if (value.supportFetchAPI !== undefined) privileges.supportFetchAPI = value.supportFetchAPI;
  if (value.corsEnabled !== undefined) privileges.corsEnabled = value.corsEnabled;
  if (value.stream !== undefined) privileges.stream = value.stream;
  if (value.serviceWorkers !== undefined) privileges.allowServiceWorkers = value.serviceWorkers;
  if (value.codeCache !== undefined) privileges.codeCache = value.codeCache;
  return privileges;
};

let schemeRegistrationAttempted = false;

/** Registers all privileged schemes before Electron emits `ready`. */
export const registerSchemes = (values: readonly Protocol.Scheme[]): void => {
  if (values.length === 0) return;
  if (schemeRegistrationAttempted) {
    throw startupError("Privileged protocol schemes can only be registered once");
  }
  const seen = new Set<string>();
  const customSchemes = values.map((value) => {
    const details = definition(value);
    if (seen.has(details.name)) {
      throw protocolError(`Duplicate protocol scheme: ${details.name}`);
    }
    seen.add(details.name);
    return { scheme: details.name, privileges: nativePrivileges(details.privileges) };
  });
  if (app.isReady())
    throw startupError("Privileged protocol schemes must be registered before ready");
  schemeRegistrationAttempted = true;
  try {
    protocol.registerSchemesAsPrivileged(customSchemes);
  } catch (cause) {
    throw startupError("Could not register privileged protocol schemes", cause);
  }
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

const closeScope = (scope: Scope.Scope): Promise<void> =>
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

export const handle = <E, R>(
  session: SessionHandle,
  value: Protocol.Scheme,
  handler: Protocol.Handler<E, R>,
): Effect.Effect<void, SewedError, MainContext | R | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const details = yield* Effect.try({
      try: () => definition(value),
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
