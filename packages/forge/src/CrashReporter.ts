import { app, crashReporter } from "electron";
import { mkdirSync } from "node:fs";
import { Effect, Schema } from "effect";
import { Declaration as SewedDeclaration } from "sewed/main";
import { MainContext, SewedError } from "sewed";
import { Declaration, Key, type Parameters, type Report, Value } from "./CrashReporterSchema.ts";

export { Declaration, Key, Options, Parameters, Report, Value } from "./CrashReporterSchema.ts";

const decodeKey = Schema.decodeUnknownSync(Key);
const decodeValue = Schema.decodeUnknownSync(Value);
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeDeclaration = Schema.decodeUnknownSync(Declaration);

/**
 * Declares the crash reporter for `App.run`: it starts before readiness so every later process is
 * covered. `directory` is created, recursively, and then set as Electron's `crashDumps` path
 * before the reporter starts, so the directory exists once the program runs; invalid options, or a
 * directory that cannot be created, fail startup with code `Startup`.
 */
export const declare = (options: Declaration): SewedDeclaration.Declaration =>
  SewedDeclaration.make("crash reporter", () => {
    const { directory, submitUrl, extra, globalExtra, ...rest } = decodeDeclaration(options);
    if (directory !== undefined) {
      try {
        mkdirSync(directory, { recursive: true });
      } catch (cause) {
        throw new Error(`Could not create the crash reporter directory at "${directory}"`, {
          cause,
        });
      }
      app.setPath("crashDumps", directory);
    }
    crashReporter.start({
      ...rest,
      ...(submitUrl === undefined ? {} : { submitURL: submitUrl }),
      ...(extra === undefined ? {} : { extra: { ...extra } }),
      ...(globalExtra === undefined ? {} : { globalExtra: { ...globalExtra } }),
    });
  });

const operation = <A>(message: string, run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) =>
        cause instanceof SewedError ? cause : new SewedError({ code: "Native", message, cause }),
    }),
  );
const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) =>
      cause instanceof SewedError ? cause : new SewedError({ code: "Protocol", message, cause }),
  });
const project = (report: Electron.CrashReport): Report => ({
  id: report.id,
  date: report.date.toISOString(),
});

export const lastReport: Effect.Effect<Report | null, SewedError, MainContext> = operation(
  "Could not read the last crash report",
  () => {
    const report = crashReporter.getLastCrashReport();
    return report === null ? null : project(report);
  },
);
export const uploadedReports: Effect.Effect<readonly Report[], SewedError, MainContext> = operation(
  "Could not read uploaded crash reports",
  () => crashReporter.getUploadedReports().map(project),
);
export const uploadToServer: Effect.Effect<boolean, SewedError, MainContext> = operation(
  "Could not read the upload setting",
  () => crashReporter.getUploadToServer(),
);
export const setUploadToServer = (enabled: boolean): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid upload flag", () => decodeBoolean(enabled)),
    (value) =>
      operation("Could not change the upload setting", () => {
        crashReporter.setUploadToServer(value);
      }),
  );
export const parameters: Effect.Effect<Parameters, SewedError, MainContext> = operation(
  "Could not read crash parameters",
  () => ({ ...crashReporter.getParameters() }),
);
export const setParameter = (
  key: string,
  value: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid crash parameter", () => [decodeKey(key), decodeValue(value)] as const),
    ([name, text]) =>
      operation("Could not set the crash parameter", () => {
        crashReporter.addExtraParameter(name, text);
      }),
  );
export const removeParameter = (key: string): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid crash parameter key", () => decodeKey(key)),
    (name) =>
      operation("Could not remove the crash parameter", () => {
        crashReporter.removeExtraParameter(name);
      }),
  );
