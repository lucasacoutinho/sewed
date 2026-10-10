import { app } from "electron";
import { mkdirSync } from "node:fs";
import type * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";

export type Table = Declarations.PathTable;

/**
 * Declares absolute application paths set before readiness: every entry is checked, then every declared
 * directory is created (recursively) before any path is set — `exe` and `module` name files and
 * are never created — so a declared directory exists once the program starts.
 */
export const declare = (table: Table): Declaration.Declaration =>
  Declarations.paths(
    {
      setPath: (name, path) => app.setPath(name, path),
      ensureDirectory: (path) => {
        mkdirSync(path, { recursive: true });
      },
    },
    table,
  );
