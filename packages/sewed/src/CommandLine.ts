import { app } from "electron";
import { Effect, Schema } from "effect";
import * as Application from "./Application.ts";
import type * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";

/** Declares one Chromium command-line switch, appended before readiness. One switch per declaration. */
export const declare = (flag: Application.CommandLineSwitch): Declaration.Declaration =>
  Declarations.commandLine(app.commandLine, flag);

/** Declares one bare argument, appended after Chromium's switches before readiness. */
export const declareArgument = (value: string): Declaration.Declaration =>
  Declarations.commandLineArgument(app.commandLine, value);

/** Declares the removal of a switch before readiness, whoever added it. */
export const declareRemoval = (name: string): Declaration.Declaration =>
  Declarations.commandLineRemoval(app.commandLine, name);

const decodeName = Schema.decodeUnknownSync(Application.CommandLineSwitch.fields.name);
const read = <A>(
  name: string,
  run: (name: string) => A,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeName(name),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid command-line switch name", cause }),
    }),
    (value) =>
      Effect.andThen(
        MainContext,
        Effect.try({
          try: () => run(value),
          catch: (cause) =>
            new SewedError({ code: "Native", message: "Could not read the command line", cause }),
        }),
      ),
  );

/** Whether the process was started with a switch, named without its leading dashes. */
export const has = (name: string): Effect.Effect<boolean, SewedError, MainContext> =>
  read(name, (value) => app.commandLine.hasSwitch(value));

/** A switch's value; empty when the switch is absent or carries none. */
export const value = (name: string): Effect.Effect<string, SewedError, MainContext> =>
  read(name, (switchName) => app.commandLine.getSwitchValue(switchName));
