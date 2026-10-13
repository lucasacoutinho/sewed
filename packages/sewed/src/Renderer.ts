import { Context, Deferred, Effect, Schema } from "effect";
import type { Scope } from "effect";
import { clientContext, makeBound, type Bound, type Declaration } from "./Binding.ts";
import { ClientContext, RendererContext, rendererIdentity } from "./RuntimeContext.ts";
import type { ConnectionFactory } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { Hello, Packet, PortTransfer } from "./internal/Bridge.ts";
import * as BindingContract from "./internal/BindingContract.ts";
import type { Connection } from "./internal/Transport.ts";
import { OwnerContext, Sink } from "./internal/Diagnostics.ts";
import * as RendererDiagnostics from "./internal/RendererDiagnostics.ts";
import * as Tracing from "./internal/Tracing.ts";

const decodePacket = Schema.decodeUnknownSync(Packet);
const isPortTransfer = Schema.is(PortTransfer);

/** The slot keys this document declares; main's `load` must bind exactly these. */
export interface Entry<Keys extends string = string> {
  readonly url: URL;
  readonly bindings: readonly Declaration<Keys>[];
}

export const entry = <Keys extends string>(
  url: URL,
  options: { readonly bindings: readonly Declaration<Keys>[] },
): Entry<Keys> => ({
  url,
  ...options,
});

/**
 * A document shipped with the application: `path` resolves against `importMetaUrl` to a `file:`
 * URL, exactly as `entry(new URL(path, importMetaUrl), options)` would. `window.webContents.load`
 * checks that the resolved file exists before it configures the bridge or navigates, failing
 * `Protocol` and naming the path when it does not — this constructor stays inert and does no
 * filesystem work itself. Refuses, all with `Protocol` naming the path rather than an
 * undocumented `URIError` or a document outside the application: a `path` the URL constructor
 * cannot resolve (a bare `%` not part of a percent-escape, for instance); a `path` whose
 * resolved URL is not `file:` (an absolute `http:`/`https:` path, or `importMetaUrl` itself not
 * a `file:` URL); and a `path` that resolves above `importMetaUrl`'s own directory (a `..`
 * escape).
 */
export const local = <Keys extends string = never>(
  path: string,
  importMetaUrl: string,
  options: { readonly bindings: readonly Declaration<Keys>[] } = { bindings: [] },
): Entry<Keys> => {
  let resolved: URL;
  let base: URL;
  try {
    resolved = new URL(path, importMetaUrl);
    base = new URL(".", importMetaUrl);
  } catch (cause) {
    throw new SewedError({
      code: "Protocol",
      message: `Invalid local document path: ${path}`,
      cause,
    });
  }
  if (resolved.protocol !== "file:")
    throw new SewedError({
      code: "Protocol",
      message: `Local document path must resolve to a file: URL: ${path}`,
    });
  if (!resolved.href.startsWith(base.href))
    throw new SewedError({
      code: "Protocol",
      message: `Local document path escapes its base directory: ${path}`,
    });
  return entry(resolved, options);
};

const utf8 = new TextEncoder();
const base64Of = (text: string): string => {
  let binary = "";
  for (const byte of utf8.encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/**
 * A document main writes itself, with nothing behind it: a `data:text/html;base64,…` entry with
 * no bindings, since a `data:` page has an opaque origin and cannot load the renderer runtime.
 * Use it for a message with no capability behind it, such as a crash-loop breaker's parked page
 * or a fatal notice; a page that offers an action needs a `local` document bound to a capability
 * instead. Refuses an empty string with `Protocol`.
 */
export const inline = (html: string): Entry<never> => {
  if (html === "")
    throw new SewedError({ code: "Protocol", message: "inline requires a non-empty document" });
  return entry(new URL(`data:text/html;base64,${base64Of(html)}`), { bindings: [] });
};

/**
 * The native path of a file the user dropped or chose in this document. Files that did not
 * come from the desktop have no path and fail with `Protocol`; the preload bridge answers
 * synchronously, so no main policy is involved: the user disclosed the file.
 */
export const pathOf = (file: File): Effect.Effect<string, SewedError, RendererContext> =>
  Effect.andThen(
    RendererContext,
    Effect.try({
      try: () => {
        const bridge = window.sewed;
        if (!bridge)
          throw new SewedError({
            code: "Startup",
            message: "Sewed preload is missing. Load this renderer with window.webContents.load.",
          });
        const path = bridge.pathOf(file);
        if (path === "")
          throw new SewedError({ code: "Protocol", message: "File has no native path" });
        return path;
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Protocol", message: "Could not resolve a file path", cause }),
    }),
  );

interface OpeningPort {
  readonly ready: Deferred.Deferred<MessagePort, SewedError>;
  port: MessagePort | undefined;
}

const connect = (entry: Entry) =>
  Effect.gen(function* () {
    const page = window;
    const bridge = page.sewed;
    if (!bridge)
      return yield* new SewedError({
        code: "Startup",
        message: "Sewed preload is missing. Load this renderer with window.webContents.load.",
      });
    const reply = yield* Effect.tryPromise({
      try: () => bridge.hello(),
      catch: (cause) =>
        new SewedError({ code: "Startup", message: "Renderer could not bind to main", cause }),
    });
    const hello = yield* Schema.decodeUnknownEffect(Hello)(reply).pipe(
      Effect.mapError(
        (cause) =>
          new SewedError({ code: "Protocol", message: "Invalid renderer handshake", cause }),
      ),
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        bridge.disconnect(hello.session);
      }),
    );
    yield* BindingContract.validate(
      entry.bindings.map((binding) => binding.key),
      hello.bindings.map(({ key }) => key),
      "Renderer bindings do not match the entry contract",
    );
    const openings = new Map<string, OpeningPort>();
    const receivePort = (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (
        typeof value !== "object" ||
        value === null ||
        !("type" in value) ||
        value.type !== "sewed:port"
      )
        return;
      const opening =
        event.source === page && isPortTransfer(value) && value.session === hello.session
          ? openings.get(value.connection)
          : undefined;
      const port = event.ports[0];
      if (
        opening === undefined ||
        opening.port !== undefined ||
        event.ports.length !== 1 ||
        !port
      ) {
        for (const transferred of event.ports) transferred.close();
        if (opening !== undefined && opening.port === undefined)
          Deferred.doneUnsafe(
            opening.ready,
            Effect.fail(
              new SewedError({ code: "Protocol", message: "Invalid binding port transfer" }),
            ),
          );
        return;
      }
      opening.port = port;
      Deferred.doneUnsafe(opening.ready, Effect.succeed(port));
    };
    page.addEventListener("message", receivePort);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        page.removeEventListener("message", receivePort);
        if (openings.size > 0) {
          const closed = new SewedError({
            code: "Closed",
            message: "Renderer closed while connecting",
          });
          for (const opening of openings.values()) {
            Deferred.doneUnsafe(opening.ready, Effect.fail(closed));
            opening.port?.close();
          }
          openings.clear();
        }
      }),
    );
    const bindings: Bound[] = hello.bindings.map(({ key, ownerId }) =>
      makeBound(
        Context.Service<Context.Service.Identifier<Bound["slot"]>, ConnectionFactory>(key),
        ownerId,
        {
          connect: Effect.gen(function* () {
            const id = crypto.randomUUID();
            const ready = yield* Deferred.make<MessagePort, SewedError>();
            const opening: OpeningPort = { ready, port: undefined };
            openings.set(id, opening);
            const receivers = new Set<(cause: SewedError) => void>();
            let failure: SewedError | undefined;
            let disposed = false;
            let unsubscribe = () => {};
            const fail = (cause: SewedError) => {
              if (failure !== undefined) return;
              failure = cause;
              Deferred.doneUnsafe(ready, Effect.fail(cause));
              for (const receive of receivers) receive(cause);
            };
            const close = () => {
              if (disposed) return;
              disposed = true;
              if (openings.get(id) === opening) openings.delete(id);
              if (failure === undefined)
                fail(new SewedError({ code: "Closed", message: "Binding port is closed" }));
              unsubscribe();
              opening.port?.close();
              bridge.close(hello.session, id);
            };
            yield* Effect.addFinalizer(() => Effect.sync(close));
            unsubscribe = bridge.subscribe(id, (value) => {
              try {
                const packet = decodePacket(value);
                if (packet.connection === id)
                  fail(new SewedError({ code: "Closed", message: packet.error }));
              } catch (cause) {
                fail(
                  new SewedError({ code: "Protocol", message: "Invalid preload packet", cause }),
                );
              }
            });
            const port = yield* Effect.gen(function* () {
              if (failure !== undefined) return yield* failure;
              const opened = yield* Effect.tryPromise({
                try: () => bridge.open(hello.session, key, id),
                catch: (cause) =>
                  new SewedError({
                    code: "Closed",
                    message: "Binding owner is unavailable",
                    cause,
                  }),
              });
              yield* Schema.decodeUnknownEffect(Schema.Literal(id))(opened).pipe(
                Effect.mapError(
                  (cause) =>
                    new SewedError({ code: "Protocol", message: "Could not open binding", cause }),
                ),
              );
              return yield* Effect.suspend(() =>
                failure === undefined ? Deferred.await(ready) : Effect.fail(failure),
              );
            }).pipe(Effect.onError(() => Effect.sync(close)));
            if (openings.get(id) === opening) openings.delete(id);
            return {
              send: (message) => {
                if (failure !== undefined) throw failure;
                port.postMessage(message);
              },
              close,
              subscribe(receive, onClose) {
                if (failure !== undefined) {
                  onClose(failure);
                  return () => {};
                }
                const onMessage = (event: MessageEvent<unknown>) => {
                  try {
                    receive(event.data);
                  } catch (cause) {
                    fail(
                      new SewedError({
                        code: "Protocol",
                        message: "Owner message could not be handled",
                        cause,
                      }),
                    );
                  }
                };
                const onMessageError = (event: MessageEvent<unknown>) =>
                  fail(
                    new SewedError({
                      code: "Protocol",
                      message: "Owner message could not be cloned",
                      cause: event,
                    }),
                  );
                const onPortClose = () =>
                  fail(new SewedError({ code: "Closed", message: "Owner disconnected" }));
                receivers.add(onClose);
                try {
                  port.addEventListener("message", onMessage);
                  port.addEventListener("messageerror", onMessageError);
                  port.addEventListener("close", onPortClose);
                  port.start();
                } catch (cause) {
                  port.removeEventListener("message", onMessage);
                  port.removeEventListener("messageerror", onMessageError);
                  port.removeEventListener("close", onPortClose);
                  const error = new SewedError({
                    code: "Protocol",
                    message: "Owner port could not start",
                    cause,
                  });
                  fail(error);
                  receivers.delete(onClose);
                  throw error;
                }
                return () => {
                  receivers.delete(onClose);
                  port.removeEventListener("message", onMessage);
                  port.removeEventListener("messageerror", onMessageError);
                  port.removeEventListener("close", onPortClose);
                };
              },
            } satisfies Connection;
          }),
        },
      ),
    );
    const runtime = yield* clientContext(bindings);
    return { runtime, hello, bridge };
  });

export const run = <E>(
  entry: Entry,
  setup: Effect.Effect<unknown, E, RendererContext | ClientContext | Scope.Scope>,
) =>
  Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        const { runtime, hello, bridge } = yield* connect(entry);
        const program = Effect.gen(function* () {
          yield* setup;
          yield* Effect.callback<void>((resume) => {
            const unload = () => resume(Effect.void);
            window.addEventListener("pagehide", unload, { once: true });
            return Effect.sync(() => window.removeEventListener("pagehide", unload));
          });
        }).pipe(
          Tracing.instrument,
          Effect.provideService(ClientContext, runtime),
          Effect.provideService(OwnerContext, { id: hello.runtimeId }),
        );
        if (hello.tracing) {
          const diagnostics = RendererDiagnostics.forward(bridge, hello.session);
          yield* Effect.addFinalizer(() => Effect.sync(diagnostics.close));
          yield* program.pipe(Effect.provideService(Sink, diagnostics));
        } else yield* program;
      }),
    ).pipe(Effect.provideService(RendererContext, rendererIdentity)),
  );
