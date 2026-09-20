import { app } from "electron";
import type * as Application from "./Application.ts";
import type * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";

export type Options = Application.Gpu;

/** Declares GPU settings that must precede readiness; `acceleration: false` disables the GPU. */
export const declare = (options: Options): Declaration.Declaration =>
  Declarations.gpu(app, options);
