import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { resolveElectron, sewed } from "@sewed/vite";
import { absent } from "./absent.mjs";

test("the standalone Vite helper and plugin definition need no optional peers", () => {
  absent({
    packages: ["electron", "vite", "typescript", "effect", "sewed", "react"],
    entries: ["@sewed/vite"],
  });
  assert.equal(
    resolveElectron({ electronPath: "tools/electron" }),
    join(process.cwd(), "tools/electron"),
  );
  assert.throws(() => resolveElectron(), /could not resolve Electron/);
  const plugin = sewed({ main: "src/main.mjs" });
  assert.equal(plugin.name, "sewed-vite");
  assert.equal(plugin.apply, "serve");
});
