import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Every published entry point has a rule about what its module graph may reach, and until a
// renderer bundle pulled in the RPC server those rules lived only in prose. They are properties of
// the module graph rather than of types or of any answer a call returns, so nothing else in the
// repository checks them: the only other check that reads a built bundle is the playground's
// `pnpm verify`, which needs real Electron. These tests encode the rules where they are cheap.
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

const serverModules = (modules: ReadonlyMap<string, string>) =>
  named([...modules.keys()].filter((file) => file.endsWith("Host.ts")));

const electronModules = (modules: ReadonlyMap<string, string>) =>
  named(
    [...modules]
      .filter(([, text]) => linkedModules(text).includes("electron"))
      .map(([file]) => file),
  );

// `host` builds an RPC server and requires `MainContext`, which none of these runtimes can
// provide, and only main may touch Electron. `Capability.serve` builds a server too, which is why
// it lives in `internal/CapabilityServe.ts` behind `sewed/main` rather than beside `define` and
// `client`: every capability's root module imports `Capability.ts` to define its contract, so a
// server reachable from there entered the bundle of every renderer that bound any surface.
const runtimeEntries = [
  { entry: "sewed", file: "index.ts" },
  { entry: "sewed/worker", file: "WorkerApi.ts" },
  { entry: "sewed/utility", file: "UtilityApi.ts" },
] as const;

for (const { entry, file } of runtimeEntries) {
  test(`${entry} reaches no main-process implementation`, () => {
    const modules = reachableFrom(file);
    assert.ok(modules.size > 1, "the walk found no modules, so it proves nothing");
    assert.deepEqual(
      serverModules(modules),
      [],
      `${entry} must not reach the RPC server that host and serve build`,
    );
    assert.deepEqual(electronModules(modules), [], `${entry} must not reach Electron`);
  });
}

// `sewed/testing` is the one entry with a different rule. It may reach the RPC server, because
// `Testing.host` and `Testing.layer` exist to run one in process, but it must reach no Electron:
// the testing guide promises a Node test can import it without starting Electron.
test("sewed/testing hosts in process and still reaches no Electron", () => {
  const modules = reachableFrom("Testing.ts");
  assert.ok(named([...modules.keys()]).includes("Host.ts"), "sewed/testing hosts in process");
  assert.deepEqual(electronModules(modules), [], "sewed/testing must not reach Electron");
});

test("the main entry does reach what the other entries may not", () => {
  const modules = reachableFrom("main.ts");
  const files = named([...modules.keys()]);
  assert.ok(files.includes("Host.ts"), "sewed/main owns host");
  assert.ok(files.includes("internal/CapabilityServe.ts"), "sewed/main owns Capability.serve");
  assert.ok(electronModules(modules).length > 0, "sewed/main owns the Electron implementations");
});
