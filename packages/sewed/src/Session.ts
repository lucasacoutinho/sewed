import { createHash } from "node:crypto";
import { session } from "electron";
import { Effect, Schema } from "effect";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import * as Native from "./internal/Session.ts";
import type { Handle } from "./internal/Session.ts";
import type * as Permission from "./Permission.ts";
import * as SessionStorage from "./SessionStorage.ts";
import * as UrlRule from "./UrlRule.ts";

export type { Handle };

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
