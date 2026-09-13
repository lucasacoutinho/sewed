import path from "node:path";
import { netLog } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import * as NetLog from "../NetLog.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

export { CaptureMode, Options } from "../NetLog.ts";

const decodeOptions = Schema.decodeUnknownSync(NetLog.Options);

export interface Handle {
  readonly path: string;
  /** Whether Electron is still writing; false once the scope stopped the log. */
  readonly active: Effect.Effect<boolean, SewedError, MainContext>;
}

/**
 * Records Chromium's network log to an absolute path for the scope's lifetime. Electron keeps
 * one log at a time, so a second recording fails with `Limit` until the first scope closes.
 */
export const record = (
  file: string,
  options: NetLog.Options = {},
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const settings = yield* Effect.try({
      try: () => {
        if (!path.isAbsolute(file))
          throw new SewedError({ code: "Protocol", message: "Net log path must be absolute" });
        return { file: path.resolve(file), ...decodeOptions(options) };
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Protocol", message: "Invalid net log options", cause }),
    });
    yield* Effect.acquireRelease(
      Effect.suspend(() =>
        netLog.currentlyLogging
          ? Effect.fail(
              new SewedError({ code: "Limit", message: "A net log recording is already active" }),
            )
          : Effect.tryPromise({
              try: () => {
                const { file: _file, ...rest } = settings;
                return netLog.startLogging(settings.file, rest);
              },
              catch: (cause) =>
                new SewedError({ code: "Native", message: "Could not start net logging", cause }),
            }),
      ),
      () => Effect.ignore(Effect.promise(() => netLog.stopLogging())),
    );
    return {
      path: settings.file,
      active: Effect.andThen(
        MainContext,
        Effect.sync(() => netLog.currentlyLogging),
      ),
    };
  });
