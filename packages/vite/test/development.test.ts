import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { sewed, type SewedViteEvent } from "../src/index.js";

const typescript = fileURLToPath(new URL("../../../node_modules/typescript", import.meta.url));
const child = `process.on("message", (message) => {
  if (message === "sewed:shutdown") process.exit(0);
}); setInterval(() => {}, 1000);`;

test("a broad source include does not restart on Sewed's own staging output", async () => {
  await fixture({ include: ["**/*.ts"] }, async ({ events }) => {
    await until(() => events.some((event) => event.type === "started"));
    const settled = await quiet(events);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(events.length, settled);
    assert.equal(events.at(-1)?.type, "started");
  });
});

test("an imported source outside files triggers an Electron rebuild", async () => {
  await fixture({ files: ["src/main/app.ts"] }, async ({ directory, events }) => {
    await until(() => events.some((event) => event.type === "started"));
    await writeFile(join(directory, "src/shared/value.ts"), "export const value = 2;\n");
    await until(() => events.filter((event) => event.type === "started").length === 2);
    assert.equal(events.filter((event) => event.type === "stopped").length, 1);
  });
});

test("changing package metadata rebuilds the staged application", async () => {
  await fixture({ files: ["src/main/app.ts"] }, async ({ directory, events }) => {
    await until(() => events.some((event) => event.type === "started"));
    await writeFile(join(directory, "package.json"), '{"type":"module","name":"changed"}\n');
    await until(() => events.filter((event) => event.type === "started").length === 2);
  });
});

test("renderer-only edits leave the Electron generation running", async () => {
  await fixture({ files: ["src/main/app.ts"] }, async ({ directory, events }) => {
    await mkdir(join(directory, "src/renderer"));
    await writeFile(join(directory, "src/renderer/app.ts"), "export const renderer = 1;\n");
    await until(() => events.some((event) => event.type === "started"));
    const settled = await quiet(events);
    await writeFile(join(directory, "src/renderer/app.ts"), "export const renderer = 2;\n");
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(events.length, settled);
    assert.equal(events.at(-1)?.type, "started");
  });
});

test("an initially invalid inherited config recovers when the parent config is fixed", async () => {
  await fixture(
    { files: ["src/main/app.ts"], extends: "./base.json" },
    async ({ directory, events }) => {
      await until(() => events.some((event) => event.type === "build-failed"));
      await writeFile(join(directory, "base.json"), '{"compilerOptions":{"target":"ES2023"}}\n');
      await until(() => events.some((event) => event.type === "started"));
    },
    (directory) =>
      writeFile(join(directory, "base.json"), '{"compilerOptions":{"target":"invalid"}}\n'),
  );
});

async function fixture(
  sources: {
    readonly files?: readonly string[];
    readonly include?: readonly string[];
    readonly extends?: string;
  },
  run: (fixture: {
    readonly directory: string;
    readonly events: SewedViteEvent[];
  }) => Promise<void>,
  setup?: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-development-")));
  const events: SewedViteEvent[] = [];
  await mkdir(join(directory, "src/main"), { recursive: true });
  await mkdir(join(directory, "src/shared"), { recursive: true });
  await mkdir(join(directory, "node_modules"));
  await symlink(typescript, join(directory, "node_modules/typescript"), "junction");
  await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
  await writeFile(join(directory, "src/shared/value.ts"), "export const value = 1;\n");
  await writeFile(
    join(directory, "src/main/app.ts"),
    'import { value } from "../shared/value.js"; export const app = value;\n',
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "NodeNext", rootDir: "src", skipLibCheck: true },
      ...sources,
    }),
  );
  await setup?.(directory);
  const server = await createServer({
    configFile: false,
    root: directory,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      sewed({
        cwd: directory,
        main: "src/main/app.ts",
        electronPath: process.execPath,
        electronArgs: ["--input-type=module", "-e", child],
        debounceMs: 10,
        onEvent: (event) => events.push(event),
      }),
    ],
  });
  try {
    await server.listen();
    await run({ directory, events });
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Waits until no event has arrived for a while and answers how many there are. A watcher can
 * report the fixture's own files late, which macOS does, so a test counts from here instead of
 * pinning the startup sequence.
 */
async function quiet(events: readonly SewedViteEvent[]): Promise<number> {
  const deadline = Date.now() + 4000;
  let seen = events.length;
  let since = Date.now();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (events.length !== seen) {
      seen = events.length;
      since = Date.now();
    } else if (Date.now() - since >= 300 && events.at(-1)?.type === "started") return seen;
  }
  return assert.fail("Timed out waiting for the development events to settle");
}

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for development event");
}
