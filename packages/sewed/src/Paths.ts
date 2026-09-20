import { app } from "electron";
import type * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";

export type Table = Declarations.PathTable;

/** Declares application paths set before readiness; every entry is checked before any is set. */
export const declare = (table: Table): Declaration.Declaration => Declarations.paths(app, table);
