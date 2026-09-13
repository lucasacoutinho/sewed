import { createHash } from "node:crypto";
import path from "node:path";
import { session } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Owner } from "./Binding.ts";
import type * as Certificate from "./Certificate.ts";
import type * as Cookie from "./Cookie.ts";
import * as Extension from "./Extension.ts";
import type * as Permission from "./Permission.ts";
import * as Proxy from "./Proxy.ts";
import { MainContext } from "./RuntimeContext.ts";
import * as ServiceWorker from "./ServiceWorker.ts";
import * as SessionStorage from "./SessionStorage.ts";
import { SewedError } from "./SewedError.ts";
import * as UrlRule from "./UrlRule.ts";
import * as Cookies from "./internal/Cookies.ts";
import * as Native from "./internal/Session.ts";
import type { Handle } from "./internal/Session.ts";
import * as WebRequest from "./internal/WebRequest.ts";

export type { Handle };
export type { Handle as Cookies } from "./internal/Cookies.ts";
export type { Rules as InterceptRules } from "./internal/WebRequest.ts";

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });
const resolved = (handle: Handle): Effect.Effect<Electron.Session, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => Native.resolve(handle),
      catch: (cause) => nativeError("Unknown session handle", cause),
    }),
  );
const operation = <A>(
  handle: Handle,
  message: string,
  run: (native: Electron.Session) => A,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(resolved(handle), (native) =>
    Effect.try({
      try: () => run(native),
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );
const asynchronous = <A>(
  handle: Handle,
  message: string,
  run: (native: Electron.Session) => Promise<A>,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(resolved(handle), (native) =>
    Effect.tryPromise({
      try: () => run(native),
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );

const Partition = Schema.Struct({
  kind: Schema.Literals(["memory", "persistent"]),
  name: Schema.String.check(Schema.isMinLength(1)),
});
export type Partition = typeof Partition.Type;
const decodePartition = Schema.decodeUnknownSync(Partition);

const acquire = (run: () => Electron.Session): Effect.Effect<Handle, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => Native.fromNative(run()),
      catch: (cause) =>
        new SewedError({ code: "Native", message: "Could not acquire browser session", cause }),
    }),
  );

export const fromPartition = (
  partition: Partition,
): Effect.Effect<Handle, SewedError, MainContext> =>
  acquire(() => {
    const { kind, name } = decodePartition(partition);
    const key = `sewed-v1-${createHash("sha256").update(name, "utf16le").digest("hex")}`;
    return session.fromPartition(kind === "persistent" ? `persist:${key}` : key);
  });

export const defaultSession: Effect.Effect<Handle, SewedError, MainContext> = acquire(
  () => session.defaultSession,
);

export const setPermissions = (
  handle: Handle,
  policy: Permission.Policy,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => Native.setPermissions(handle, policy),
      catch: (cause) =>
        new SewedError({ code: "Native", message: "Could not set session permissions", cause }),
    }),
  );

const decodeClearOptions = Schema.decodeUnknownSync(SessionStorage.ClearOptions);
export const clearStorage = (
  handle: Handle,
  options: SessionStorage.ClearOptions,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.tryPromise({
      try: () => {
        const decoded = decodeClearOptions(options);
        if (decoded.kind === "origin") UrlRule.compile({ kind: "origin", origin: decoded.origin });
        return Native.resolve(handle).clearStorageData({
          ...(decoded.kind === "origin" ? { origin: decoded.origin } : {}),
          storages: [...decoded.storages],
        });
      },
      catch: (cause) =>
        new SewedError({ code: "Native", message: "Could not clear session storage", cause }),
    }),
  );

/** Cookie access for a session; the handle is inert until an operation runs in main. */
export const cookies = (handle: Handle): Cookies.Handle => Cookies.make(Native.resolve(handle));

/** Hosts a session's cookies for bound clients within a list of origins. */
export const hostCookies = (
  handle: Handle,
  policy: Cookie.Policy,
): Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof Cookie.protocol>>,
  SewedError,
  MainContext | Scope.Scope
> => Effect.andThen(resolved(handle), (native) => Cookies.host(Cookies.make(native), policy));

/** Installs request deciders on a filter for the scope's lifetime. */
export const intercept = <R>(
  handle: Handle,
  rules: WebRequest.Rules<R>,
): Effect.Effect<void, SewedError, MainContext | Scope.Scope | R> =>
  Effect.andThen(resolved(handle), (native) => WebRequest.intercept(native, rules));

const decodeProxy = Schema.decodeUnknownSync(Proxy.Config);
export const setProxy = (
  handle: Handle,
  config: Proxy.Config,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid proxy configuration", () => decodeProxy(config)),
    (value) => asynchronous(handle, "Could not set proxy", (native) => native.setProxy(value)),
  );

export const resolveProxy = (
  handle: Handle,
  url: string,
): Effect.Effect<string, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid URL", () => new URL(url).href),
    (href) =>
      asynchronous(handle, "Could not resolve proxy", (native) => native.resolveProxy(href)),
  );

export interface SpellChecker {
  readonly enabled: boolean;
  readonly languages: readonly string[];
  readonly available: readonly string[];
}
export const spellChecker = (
  handle: Handle,
): Effect.Effect<SpellChecker, SewedError, MainContext> =>
  operation(handle, "Could not read spell checker settings", (native) => ({
    enabled: native.isSpellCheckerEnabled(),
    languages: native.getSpellCheckerLanguages(),
    available: native.availableSpellCheckerLanguages,
  }));

const decodeSpellChecker = Schema.decodeUnknownSync(
  Schema.Struct({
    enabled: Schema.optionalKey(Schema.Boolean),
    languages: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  }),
);
export const setSpellChecker = (
  handle: Handle,
  settings: { readonly enabled?: boolean; readonly languages?: readonly string[] },
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid spell checker settings", () => decodeSpellChecker(settings)),
    (value) =>
      operation(handle, "Could not update spell checker", (native) => {
        if (value.languages !== undefined) native.setSpellCheckerLanguages([...value.languages]);
        if (value.enabled !== undefined) native.setSpellCheckerEnabled(value.enabled);
      }),
  );

export const clearCache = (handle: Handle): Effect.Effect<void, SewedError, MainContext> =>
  asynchronous(handle, "Could not clear cache", (native) => native.clearCache());
export const cacheSize = (handle: Handle): Effect.Effect<number, SewedError, MainContext> =>
  asynchronous(handle, "Could not read cache size", (native) => native.getCacheSize());

export const userAgent = (handle: Handle): Effect.Effect<string, SewedError, MainContext> =>
  operation(handle, "Could not read user agent", (native) => native.getUserAgent());
const decodeText = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
export const setUserAgent = (
  handle: Handle,
  value: string,
  acceptLanguages?: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded(
      "Invalid user agent",
      () =>
        [
          decodeText(value),
          acceptLanguages === undefined ? undefined : decodeText(acceptLanguages),
        ] as const,
    ),
    ([agent, languages]) =>
      operation(handle, "Could not set user agent", (native) => {
        native.setUserAgent(agent, languages);
      }),
  );

export const setDownloadPath = (
  handle: Handle,
  directory: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Download path must be absolute", () => {
      if (!path.isAbsolute(directory)) throw protocolError("Download path must be absolute");
      return path.resolve(directory);
    }),
    (value) =>
      operation(handle, "Could not set download path", (native) => {
        native.setDownloadPath(value);
      }),
  );

/** Replaces the certificate rules for the session; hosts without a rule keep Chromium's verdict. */
export const setCertificatePolicy = (
  handle: Handle,
  policy: Certificate.Policy,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(resolved(handle), () =>
    Effect.try({
      try: () => Native.setCertificatePolicy(handle, policy),
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid certificate policy", cause),
    }),
  );

const decodeExtensionOptions = Schema.decodeUnknownSync(Extension.Options);
/** Loads an unpacked extension for the scope's lifetime; closing the scope unloads it. */
export const loadExtension = (
  handle: Handle,
  directory: string,
  options: Extension.Options = {},
): Effect.Effect<Extension.Info, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    const native = yield* resolved(handle);
    const settings = yield* decoded("Invalid extension options", () => {
      if (!path.isAbsolute(directory)) throw protocolError("Extension path must be absolute");
      return { directory: path.resolve(directory), ...decodeExtensionOptions(options) };
    });
    const loaded = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          native.extensions.loadExtension(
            settings.directory,
            settings.allowFileAccess === undefined
              ? undefined
              : { allowFileAccess: settings.allowFileAccess },
          ),
        catch: (cause) => nativeError("Could not load extension", cause),
      }),
      (extension) =>
        Effect.sync(() => {
          native.extensions.removeExtension(extension.id);
        }),
    );
    return { id: loaded.id, name: loaded.name, version: loaded.version, url: loaded.url };
  });

export interface ServiceWorkers {
  readonly running: Effect.Effect<readonly ServiceWorker.Info[], SewedError, MainContext>;
  /** Every observer owns its listeners and a queue of 128 events; overflow fails it with `Limit`. */
  readonly events: Stream.Stream<ServiceWorker.Event, SewedError, MainContext>;
}
export const serviceWorkers = (handle: Handle): ServiceWorkers => ({
  running: operation(handle, "Could not list service workers", (native) =>
    Object.entries(native.serviceWorkers.getAllRunning()).map(([versionId, info]) => ({
      versionId: Number(versionId),
      scriptUrl: info.scriptUrl,
      scope: info.scope,
      renderProcessId: info.renderProcessId,
    })),
  ),
  events: Stream.unwrap(
    Effect.map(resolved(handle), (native) =>
      Stream.callback<ServiceWorker.Event, SewedError, MainContext>(
        (queue) =>
          Effect.gen(function* () {
            yield* MainContext;
            const offer = (event: ServiceWorker.Event) => {
              if (!Queue.offerUnsafe(queue, event))
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new SewedError({
                      code: "Limit",
                      message: "Service worker observer queue is full",
                    }),
                  ),
                );
            };
            const registered = (_event: Electron.Event, details: { readonly scope: string }) =>
              offer({ kind: "registered", scope: details.scope });
            const status = (
              details: Electron.Event<Electron.ServiceWorkersRunningStatusChangedEventParams>,
            ) =>
              offer({
                kind: "status",
                versionId: details.versionId,
                status: details.runningStatus,
              });
            yield* Effect.acquireRelease(
              Effect.sync(() => {
                native.serviceWorkers.on("registration-completed", registered);
                native.serviceWorkers.on("running-status-changed", status);
              }),
              () =>
                Effect.sync(() => {
                  native.serviceWorkers.off("registration-completed", registered);
                  native.serviceWorkers.off("running-status-changed", status);
                }),
            );
          }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
        { bufferSize: 128 },
      ),
    ),
  ),
});
