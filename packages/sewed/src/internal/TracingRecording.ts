import { Effect, Exit } from "effect";
import type { Scope } from "effect";
import type { contentTracing } from "electron";
import { SewedError } from "../SewedError.ts";

export type NativeOptions = Parameters<typeof contentTracing.startRecording>[0];

type Native = Pick<typeof contentTracing, "startRecording" | "stopRecording">;

type State =
  | { readonly _tag: "Starting" }
  | { readonly _tag: "Recording" }
  | { readonly _tag: "Stopping"; readonly result: Promise<string> };

interface Reservation {
  readonly file: string;
  state: State;
}

export interface Handle {
  readonly stop: Effect.Effect<string, SewedError>;
}

const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

/** Owns one native tracing recorder for the lifetime of a scoped recording. */
export const make = (native: Native) => {
  let reservation: Reservation | undefined;

  const release = (lease: Reservation) => {
    if (reservation === lease) reservation = undefined;
  };

  const stopNative = (result: Promise<string>) =>
    Effect.tryPromise({
      try: () => result,
      catch: (cause) => nativeError("Could not stop tracing", cause),
    });

  const beginStop = (lease: Reservation): Promise<string> => {
    const result = Promise.resolve().then(() => native.stopRecording(lease.file));
    lease.state = { _tag: "Stopping", result };
    void result.then(
      () => release(lease),
      () => release(lease),
    );
    return result;
  };

  const close = (lease: Reservation) =>
    Effect.suspend(() => {
      switch (lease.state._tag) {
        case "Starting":
          return Effect.sync(() => release(lease));
        case "Recording":
          return stopNative(beginStop(lease)).pipe(Effect.asVoid, Effect.orDie);
        case "Stopping":
          return stopNative(lease.state.result).pipe(Effect.asVoid, Effect.orDie);
      }
    });

  const record = (
    file: string,
    options: NativeOptions,
  ): Effect.Effect<Handle, SewedError, Scope.Scope> =>
    Effect.gen(function* () {
      const lease = yield* Effect.acquireRelease(
        Effect.suspend(() => {
          if (reservation !== undefined) {
            return Effect.fail(
              new SewedError({
                code: "Limit",
                message: "A Chromium trace recording is already starting or active",
              }),
            );
          }

          const acquired: Reservation = {
            file,
            state: { _tag: "Starting" },
          };
          reservation = acquired;

          return Effect.tryPromise({
            try: () => native.startRecording(options),
            catch: (cause) => nativeError("Could not start tracing", cause),
          }).pipe(
            Effect.tap(() => Effect.sync(() => (acquired.state = { _tag: "Recording" }))),
            Effect.onExit((exit) =>
              Exit.isSuccess(exit) ? Effect.void : Effect.sync(() => release(acquired)),
            ),
            Effect.as(acquired),
          );
        }),
        close,
      );

      return {
        stop: Effect.suspend(() => {
          if (lease.state._tag !== "Recording") {
            return Effect.fail(
              new SewedError({ code: "Closed", message: "Trace recording is stopped" }),
            );
          }
          return stopNative(beginStop(lease));
        }),
      };
    });

  return { record };
};
