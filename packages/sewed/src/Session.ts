import { isAbsolute } from "node:path";
import { session } from "electron";
import { Effect } from "effect";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import * as Native from "./internal/Session.ts";
import type { Handle } from "./internal/Session.ts";

export type { Handle };
export type { Handle as Cookies } from "./internal/Cookies.ts";
export type { SpellChecker } from "./internal/SessionSettings.ts";
export type { ServiceWorkers } from "./internal/ServiceWorkers.ts";
export {
  addSpellCheckerWord,
  cacheSize,
  clearAuthCache,
  clearCache,
  clearCodeCaches,
  clearHostResolverCache,
  clearNetworkEmulation,
  flushStorage,
  forceReloadProxyConfig,
  removeSpellCheckerWord,
  resolveProxy,
  setDownloadPath,
  setNetworkEmulation,
  setProxy,
  setSpellChecker,
  setSSLConfig,
  setUserAgent,
  spellChecker,
  spellCheckerWords,
  storagePath,
  userAgent,
} from "./internal/SessionSettings.ts";
export { deviceChanges, setUsbProtectedClasses } from "./internal/SessionDevices.ts";
export { resumeDownload } from "./internal/SessionDownloads.ts";
export {
  allowNtlmCredentialsForDomains,
  clearData,
  clearSharedDictionaries,
  extensionEvents,
  extensions,
  isProtocolHandled,
  preloadScripts,
  registerPreloadScript,
  setCodeCachePath,
  setSpellCheckerDictionaryDownloadUrl,
  sharedDictionaries,
  sharedDictionaryUsage,
  spellCheckerDictionaries,
} from "./internal/SessionData.ts";
export { loadExtension } from "./internal/Extensions.ts";
export { serviceWorkers } from "./internal/ServiceWorkers.ts";

export type Partition = Native.Partition;

const acquire = (run: () => Electron.Session): Effect.Effect<Handle, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => Native.fromNative(run()),
      catch: (cause) =>
        new SewedError({ code: "Native", message: "Could not acquire browser session", cause }),
    }),
  );

/**
 * Selects a native browser session by kind and name. `cookies`, `clearStorage`,
 * `closeAllConnections`, `resolveHost`, `blobData`, `requests`, `decide`, and `intercept` are
 * methods on the returned handle, matching how a window and a web contents already read; the
 * settings below stay free functions taking the handle, since they are not moving in this wave.
 */
export const fromPartition = (
  partition: Partition,
): Effect.Effect<Handle, SewedError, MainContext> =>
  acquire(() => session.fromPartition(Native.partitionKey(Native.decodePartition(partition))));

/**
 * A persistent session stored at an absolute directory of the application's choosing, instead of
 * under the user data directory by partition name. `cache: false` keeps its HTTP cache off disk.
 */
export const fromPath = (
  directory: string,
  options: { readonly cache?: boolean } = {},
): Effect.Effect<Handle, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => {
        if (typeof directory !== "string" || !isAbsolute(directory))
          throw new SewedError({ code: "Protocol", message: "Session path must be absolute" });
        if (options.cache !== undefined && typeof options.cache !== "boolean")
          throw new SewedError({ code: "Protocol", message: "Invalid session cache flag" });
        return directory;
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Protocol", message: "Invalid session path", cause }),
    }),
    (value) =>
      acquire(() =>
        session.fromPath(value, options.cache === undefined ? undefined : { cache: options.cache }),
      ),
  );

export const defaultSession: Effect.Effect<Handle, SewedError, MainContext> = acquire(
  () => session.defaultSession,
);
