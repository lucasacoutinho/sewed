import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The `sewed` root entry is what a renderer imports, and every capability's root module imports
// `Capability.ts` to define its contract. A main-process implementation reachable from here
// therefore enters every renderer bundle, which the playground's architecture rule rejects. That
// rule only runs against a built Electron application, so this test pins the same property here,
// where it is a plain property of the module graph and needs neither a bundler nor Electron.
const source = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * The relative specifiers a module pulls in at runtime. `import type` and `export type` emit
 * nothing, so they are skipped; every other form, `export * as X from` included, brings the module
 * into a bundle.
 */
const linkedModules = (text: string): readonly string[] => {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:import|export)\s+([^;]*?)from\s+"([^"]+)"/g)) {
    const clause = match[1] ?? "";
    const specifier = match[2];
    if (specifier === undefined) continue;
    if (/^\s*type\s/.test(clause)) continue;
    found.push(specifier);
  }
  return found;
};

const reachableFrom = (entry: string): ReadonlyMap<string, string> => {
  const seen = new Map<string, string>();
  const queue = [normalize(join(source, entry))];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || seen.has(current)) continue;
    const text = readFileSync(current, "utf8");
    seen.set(current, text);
    for (const specifier of linkedModules(text)) {
      if (!specifier.startsWith(".")) continue;
      queue.push(normalize(join(dirname(current), specifier)));
    }
  }
  return seen;
};

const named = (files: Iterable<string>) => [...files].map((file) => relative(source, file)).sort();

test("the root entry reaches no main-process implementation", () => {
  const modules = reachableFrom("index.ts");
  assert.ok(modules.size > 1, "the walk found no modules, so it proves nothing");

  // `host` builds an RPC server and requires MainContext. `Capability.serve` builds one too, which
  // is why it lives in `internal/CapabilityServe.ts` behind `sewed/main` rather than beside
  // `define` and `client`.
  assert.deepEqual(
    named([...modules.keys()].filter((file) => file.endsWith("Host.ts"))),
    [],
    "the root entry must not reach the RPC server that host and serve build",
  );

  const electron = [...modules]
    .filter(([, text]) => linkedModules(text).includes("electron"))
    .map(([file]) => file);
  assert.deepEqual(named(electron), [], "the root entry must not reach Electron");
});

test("the main entry does reach the server the root entry may not", () => {
  const modules = named([...reachableFrom("main.ts").keys()]);
  assert.ok(modules.includes("Host.ts"), "sewed/main owns host");
  assert.ok(modules.includes("internal/CapabilityServe.ts"), "sewed/main owns Capability.serve");
});
