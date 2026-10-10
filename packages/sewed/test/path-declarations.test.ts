import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import * as Declarations from "../src/internal/Declarations.ts";

for (const name of ["userData", "logs", "exe", "module"] as const) {
  test(`a relative ${name} path is rejected before any directory or native path changes`, () => {
    const reached: string[] = [];
    const native: Declarations.PathsNative = {
      ensureDirectory: (target) => {
        reached.push(`create:${target}`);
      },
      setPath: (key, target) => {
        reached.push(`set:${key}:${target}`);
      },
    };
    const definition = Declarations.paths(native, {
      sessionData: path.resolve("audit-profile"),
      [name]: "relative-path",
    });
    assert.deepEqual(reached, []);
    const error = Declarations.apply([definition], { isReady: () => false });
    assert.equal(error?.code, "Startup");
    assert.ok(error?.cause instanceof Error);
    assert.match(error.cause.message, /absolute/);
    assert.deepEqual(reached, []);
  });
}
