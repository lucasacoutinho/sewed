import assert from "node:assert/strict";
import { createRequire } from "node:module";

/** @param {{ packages: readonly string[]; entries: readonly string[] }} options */
export const absent = ({ packages, entries }) => {
  for (const origin of [import.meta.url, ...entries.map((entry) => import.meta.resolve(entry))]) {
    const require = createRequire(origin);
    for (const name of packages)
      assert.throws(() => require.resolve(name), { code: "MODULE_NOT_FOUND" }, name);
  }
};
