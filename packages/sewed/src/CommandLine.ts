import { app } from "electron";
import type * as Application from "./Application.ts";
import type * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";

/** Declares one Chromium command-line switch, appended before readiness. One switch per declaration. */
export const declare = (flag: Application.CommandLineSwitch): Declaration.Declaration =>
  Declarations.commandLine(app.commandLine, flag);
