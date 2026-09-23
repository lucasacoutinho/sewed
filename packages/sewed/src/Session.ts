import { session } from "electron";
import { Effect, Schema } from "effect";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import * as Native from "./internal/Session.ts";
import type { Handle } from "./internal/Session.ts";

export type { Handle };
export type { Handle as Cookies } from "./internal/Cookies.ts";
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

const Partition = Schema.Struct({
  kind: Schema.Literals(["memory", "persistent"]),
  name: Schema.String.check(Schema.isMinLength(1)),
  /**
   * `raw` hands Electron `name` unchanged (`persist:`-prefixed for a persistent partition), for
   * an application that already has users under a native partition name. Omitted or `"hashed"`
   * keeps the default `sewed-v1-<sha256>` mapping. See [sessions](../../docs/sessions.md) for
   * what the default costs an application switching to `raw` after it has shipped.
   */
  mapping: Schema.optionalKey(Schema.Literals(["hashed", "raw"])),
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

/**
 * Selects a native browser session by kind and name. `cookies`, `clearStorage`,
 * `closeAllConnections`, `resolveHost`, `blobData`, `requests`, `decide`, and `intercept` are
 * methods on the returned handle, matching how a window and a web contents already read; the
 * settings below stay free functions taking the handle, since they are not moving in this wave.
 */
export const fromPartition = (
  partition: Partition,
): Effect.Effect<Handle, SewedError, MainContext> =>
  acquire(() => session.fromPartition(Native.partitionKey(decodePartition(partition))));

export const defaultSession: Effect.Effect<Handle, SewedError, MainContext> = acquire(
  () => session.defaultSession,
);
