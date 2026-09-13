import { createHash } from "node:crypto";
import { session } from "electron";
import { Effect, Schema } from "effect";
import { Stream } from "effect";
import type { Scope } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Owner } from "./Binding.ts";
import type * as Certificate from "./Certificate.ts";
import type * as Cookie from "./Cookie.ts";
import type * as Permission from "./Permission.ts";
import { MainContext } from "./RuntimeContext.ts";
import * as SessionStorage from "./SessionStorage.ts";
import { SewedError } from "./SewedError.ts";
import * as UrlRule from "./UrlRule.ts";
import type * as WebRequestData from "./WebRequest.ts";
import * as Cookies from "./internal/Cookies.ts";
import * as Native from "./internal/Session.ts";
import type { Handle } from "./internal/Session.ts";
import { decoded, resolved } from "./internal/SessionSettings.ts";
import * as WebRequest from "./internal/WebRequest.ts";

export type { Handle };
export type { Handle as Cookies } from "./internal/Cookies.ts";
export type { Rules as InterceptRules } from "./internal/WebRequest.ts";
export type { SpellChecker } from "./internal/SessionSettings.ts";
export type { ServiceWorkers } from "./internal/ServiceWorkers.ts";
export {
  cacheSize,
  clearCache,
  resolveProxy,
  setDownloadPath,
  setProxy,
  setSpellChecker,
  setUserAgent,
  spellChecker,
  userAgent,
} from "./internal/SessionSettings.ts";
export { loadExtension } from "./internal/Extensions.ts";
export { serviceWorkers } from "./internal/ServiceWorkers.ts";
export { setDisplayMedia } from "./internal/DisplayMedia.ts";

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

/** Observes the request stages deciders never see, for the requests a filter selects. */
export const requests = (
  handle: Handle,
  filter: WebRequestData.Filter,
): Stream.Stream<WebRequestData.Event, SewedError, MainContext> =>
  Stream.unwrap(Effect.map(resolved(handle), (native) => WebRequest.observe(native, filter)));

/** Replaces the certificate rules for the session; hosts without a rule keep Chromium's verdict. */
export const setCertificatePolicy = (
  handle: Handle,
  policy: Certificate.Policy,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(resolved(handle), () =>
    decoded("Invalid certificate policy", () => Native.setCertificatePolicy(handle, policy)),
  );
