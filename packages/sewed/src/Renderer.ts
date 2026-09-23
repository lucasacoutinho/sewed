import { Context, Effect, Schema } from "effect";
import type { Scope } from "effect";
import { clientContext, makeBound, type Bound, type Declaration } from "./Binding.ts";
import { ClientContext, RendererContext, rendererIdentity } from "./RuntimeContext.ts";
import type { ConnectionFactory } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { Hello, Packet } from "./internal/Bridge.ts";
import * as BindingContract from "./internal/BindingContract.ts";
import type { Connection } from "./internal/Transport.ts";
import { OwnerContext, Sink } from "./internal/Diagnostics.ts";
import * as RendererDiagnostics from "./internal/RendererDiagnostics.ts";
import * as Tracing from "./internal/Tracing.ts";

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
 * filesystem work itself. Refuses a `path` the URL constructor cannot resolve (a bare `%` not
 * part of a percent-escape, for instance) with `Protocol`, naming the path, rather than an
 * undocumented `URIError`.
 */
export const local = <Keys extends string = never>(
  path: string,
  importMetaUrl: string,
  options: { readonly bindings: readonly Declaration<Keys>[] } = { bindings: [] },
): Entry<Keys> => {
  try {
    return entry(new URL(path, importMetaUrl), options);
  } catch (cause) {
    throw new SewedError({
      code: "Protocol",
      message: `Invalid local document path: ${path}`,
      cause,
    });
  }
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

const connect = (entry: Entry) =>
  Effect.gen(function* () {
    const bridge = window.sewed;
    if (!bridge)
      return yield* Effect.fail(
        new SewedError({
          code: "Startup",
          message: "Sewed preload is missing. Load this renderer with window.webContents.load.",
        }),
      );
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
    const bindings: Bound[] = hello.bindings.map(({ key, ownerId }) =>
      makeBound(
        Context.Service<Context.Service.Identifier<Bound["slot"]>, ConnectionFactory>(key),
        ownerId,
        {
          connect: Effect.gen(function* () {
            const id = crypto.randomUUID();
            const close = Effect.sync(() => bridge.close(hello.session, id));
            yield* Effect.addFinalizer(() => close);
            const opened = yield* Effect.tryPromise({
              try: () => bridge.open(hello.session, key, id),
              catch: (cause) =>
                new SewedError({ code: "Closed", message: "Binding owner is unavailable", cause }),
            }).pipe(Effect.onError(() => close));
            yield* Schema.decodeUnknownEffect(Schema.Literal(id))(opened).pipe(
              Effect.mapError(
                (cause) =>
                  new SewedError({ code: "Protocol", message: "Could not open binding", cause }),
              ),
            );
            return {
              send: (message) => {
                bridge.send(hello.session, id, message);
              },
              close: () => {
                bridge.close(hello.session, id);
              },
              subscribe(receive, close) {
                return bridge.subscribe((value) => {
                  try {
                    const packet = Schema.decodeUnknownSync(Packet)(value);
                    if (packet.connection !== id) return;
                    if ("message" in packet) receive(packet.message);
                    else close(new SewedError({ code: "Closed", message: packet.error }));
                  } catch (cause) {
                    close(
                      new SewedError({
                        code: "Protocol",
                        message: "Invalid preload packet",
                        cause,
                      }),
                    );
                  }
                });
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
