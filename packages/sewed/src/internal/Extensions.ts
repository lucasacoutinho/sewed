import path from "node:path";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import * as Extension from "../Extension.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { Handle } from "./Session.ts";
import { decoded, resolved } from "./SessionSettings.ts";

const decodeOptions = Schema.decodeUnknownSync(Extension.Options);
const protocolError = (message: string) => new SewedError({ code: "Protocol", message });

/**
 * Loads an unpacked extension for the scope's lifetime; closing the scope unloads it. Electron
 * only accepts extensions in persistent sessions.
 */
export const loadExtension = (
  handle: Handle,
  directory: string,
  options: Extension.Options = {},
): Effect.Effect<Extension.Info, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    const native = yield* resolved(handle);
    const settings = yield* decoded("Invalid extension options", () => {
      if (!path.isAbsolute(directory)) throw protocolError("Extension path must be absolute");
      if (!native.isPersistent()) throw protocolError("Extensions need a persistent session");
      return { directory: path.resolve(directory), ...decodeOptions(options) };
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
        catch: (cause) =>
          new SewedError({ code: "Native", message: "Could not load extension", cause }),
      }),
      (extension) =>
        Effect.sync(() => {
          native.extensions.removeExtension(extension.id);
        }),
    );
    return { id: loaded.id, name: loaded.name, version: loaded.version, url: loaded.url };
  });
