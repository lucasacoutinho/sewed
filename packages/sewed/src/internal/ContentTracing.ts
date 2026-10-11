import path from "node:path";
import { contentTracing } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import * as ContentTracing from "../ContentTracing.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as TracingRecording from "./TracingRecording.ts";

export { BufferUsage, Mode, Options } from "../ContentTracing.ts";

const decodeOptions = Schema.decodeUnknownSync(ContentTracing.Options);
const recorder = TracingRecording.make(contentTracing);
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

export const categories: Effect.Effect<readonly string[], SewedError, MainContext> = Effect.andThen(
  MainContext,
  Effect.tryPromise({
    try: () => contentTracing.getCategories(),
    catch: (cause) => nativeError("Could not read trace categories", cause),
  }),
);

export const bufferUsage: Effect.Effect<ContentTracing.BufferUsage, SewedError, MainContext> =
  Effect.andThen(
    MainContext,
    Effect.tryPromise({
      try: async () => {
        const usage = await contentTracing.getTraceBufferUsage();
        return { value: usage.value, percentage: usage.percentage };
      },
      catch: (cause) => nativeError("Could not read trace buffer usage", cause),
    }),
  );

export interface Handle {
  /** Stops recording and returns the trace file; a second stop fails with `Closed`. */
  readonly stop: Effect.Effect<string, SewedError, MainContext>;
}

/**
 * Records a Chromium trace for the scope's lifetime and writes it to an absolute path. Stop early
 * with `stop`; closing the scope stops a recording that is still running.
 */
export const record = (
  file: string,
  options: ContentTracing.Options = {},
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const settings = yield* Effect.try({
      try: () => {
        if (!path.isAbsolute(file))
          throw new SewedError({ code: "Protocol", message: "Trace path must be absolute" });
        return { file: path.resolve(file), ...decodeOptions(options) };
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Protocol", message: "Invalid trace options", cause }),
    });
    const handle = yield* recorder.record(settings.file, {
      ...(settings.included === undefined ? {} : { included_categories: [...settings.included] }),
      ...(settings.excluded === undefined ? {} : { excluded_categories: [...settings.excluded] }),
      ...(settings.mode === undefined ? {} : { recording_mode: settings.mode }),
      ...(settings.bufferKb === undefined ? {} : { trace_buffer_size_in_kb: settings.bufferKb }),
      ...(settings.argumentFilter === undefined
        ? {}
        : { enable_argument_filter: settings.argumentFilter }),
    });
    return {
      stop: Effect.andThen(MainContext, handle.stop),
    };
  });

const decodeHeapProfiling = Schema.decodeUnknownSync(ContentTracing.HeapProfiling);

/**
 * Turns on heap profiling, so a trace recorded with the `memory-infra` category carries
 * allocation samples. Electron marks this experimental.
 */
export const enableHeapProfiling = (
  options: ContentTracing.HeapProfiling = {},
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeHeapProfiling(options),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid heap profiling options", cause }),
    }),
    (value) =>
      Effect.andThen(
        MainContext,
        Effect.tryPromise({
          try: () => contentTracing.enableHeapProfiling({ ...value }),
          catch: (cause) =>
            new SewedError({ code: "Native", message: "Could not enable heap profiling", cause }),
        }),
      ),
  );
