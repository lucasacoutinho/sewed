import path from "node:path";
import { Effect, Schema } from "effect";
import * as Download from "../Download.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { adopt, type AdoptableItem } from "./DownloadItem.ts";
import { decoded, protocolError } from "./ProtocolError.ts";
import type { Handle } from "./Session.ts";
import { resolved } from "./SessionSettings.ts";

const decodeResume = Schema.decodeUnknownSync(Download.Resume);

type Listener = (event: unknown, item: AdoptableItem, contents: unknown) => void;

/** The structural subset of a session a resumed download needs. */
interface Resumable {
  on(event: "will-download", listener: Listener): unknown;
  off(event: "will-download", listener: Listener): unknown;
  createInterruptedDownload(options: Electron.CreateInterruptedDownloadOptions): void;
}

/**
 * Continues a download interrupted in an earlier run. Electron recreates it interrupted and
 * announces it like any other download, with no web contents behind it; this adopts the one saved
 * at `path` and answers its handle, on which `resume` continues the transfer. No download decider
 * is asked: the application named the file itself.
 */
export const resume = (
  session: Resumable,
  options: Download.Resume,
): Effect.Effect<Download.Handle, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid interrupted download", () => {
      const value = decodeResume(options);
      if (!path.isAbsolute(value.path)) throw protocolError("Download path must be absolute");
      return { ...value, path: path.resolve(value.path), urlChain: [...value.urlChain] };
    }),
    (value) =>
      Effect.andThen(
        MainContext,
        Effect.callback<Download.Handle, SewedError>((resumeWith) => {
          const listener: Listener = (_event, item, contents) => {
            if (contents !== null && contents !== undefined) return;
            if (path.resolve(item.getSavePath()) !== value.path) return;
            session.off("will-download", listener);
            resumeWith(Effect.succeed(adopt(item)));
          };
          session.on("will-download", listener);
          try {
            session.createInterruptedDownload(value);
          } catch (cause) {
            session.off("will-download", listener);
            resumeWith(
              Effect.fail(
                new SewedError({
                  code: "Native",
                  message: "Could not recreate the interrupted download",
                  cause,
                }),
              ),
            );
          }
          return Effect.sync(() => {
            session.off("will-download", listener);
          });
        }),
      ),
  );

export const resumeDownload = (
  handle: Handle,
  options: Download.Resume,
): Effect.Effect<Download.Handle, SewedError, MainContext> =>
  Effect.andThen(resolved(handle), (native) => resume(native, options));
