import assert from "node:assert/strict";
import { xSync } from "tinyexec";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "./internal/package-manifest.mjs";

if (process.argv.length !== 2) {
  console.error("Usage: sdk-benchmark.mjs");
  process.exit(2);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "sewed-sdk-"));
const tarballs = join(temporary, "local packages");
const tools = join(temporary, "tools");
const consumer = join(temporary, "desktop app");
const { version } = readManifest(join(root, "packages/create/package.json"));
/** @param {string} command @param {readonly string[]} args @param {string} [cwd] */
const run = (command, args, cwd = root) =>
  xSync(command, args, {
    nodePath: false,
    throwOnError: true,
    nodeOptions: { cwd, stdio: "inherit" },
  });

const started = performance.now();
let stage = "pack";
let succeeded = false;
try {
  run(process.execPath, [join(root, "scripts/release.mjs"), "pack", tarballs]);
  mkdirSync(tools);
  run("tar", ["-xzf", join(tarballs, `create-sewed-${version}.tgz`), "-C", tools]);
  stage = "scaffold";
  run(
    process.execPath,
    [
      join(tools, "package/bin/create-sewed.mjs"),
      "desktop app",
      "--name",
      "@sewed-demo/desktop",
      "--local-packages",
      "local packages",
    ],
    temporary,
  );
  stage = "install";
  const manifest = readFileSync(join(consumer, "package.json"));
  run("pnpm", ["install", "--offline"], consumer);
  assert.deepEqual(readFileSync(join(consumer, "package.json")), manifest);
  stage = "typecheck";
  run("pnpm", ["typecheck"], consumer);
  stage = "build";
  run("pnpm", ["build"], consumer);
  stage = "frozen-install";
  const lockfile = readFileSync(join(consumer, "pnpm-lock.yaml"));
  rmSync(join(consumer, "node_modules"), { recursive: true, force: true });
  run("pnpm", ["install", "--offline", "--frozen-lockfile"], consumer);
  assert.deepEqual(readFileSync(join(consumer, "pnpm-lock.yaml")), lockfile);
  assert.deepEqual(readFileSync(join(consumer, "package.json")), manifest);
  stage = "worker";
  const probe = join(consumer, "sdk-worker.mjs");
  writeFileSync(
    probe,
    `import assert from "node:assert/strict";
import { threadId } from "node:worker_threads";
import { Effect, Stream } from "effect";
import { Binding } from "sewed";
import * as Testing from "sewed/testing";
import { Clock } from "./dist/shared/bindings.js";
import { ClockProtocol } from "./dist/shared/contracts.js";

const owner = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* Testing.Worker.spawn(
        Testing.Worker.entry(new URL("./dist/worker/clock.js", import.meta.url), ClockProtocol),
      );
      yield* Effect.gen(function* () {
        const clock = yield* Clock();
        const nativeThread = yield* clock.thread();
        assert.ok(nativeThread > 0);
        assert.notEqual(nativeThread, threadId);
        const ticks = yield* Stream.runCollect(clock.ticks().pipe(Stream.take(3)));
        assert.deepEqual(ticks, [1, 2, 3]);
        console.log("SDK_WORKER " + JSON.stringify({ nativeThread, ticks }));
      }).pipe(Effect.provide(Binding.layer([Binding.to(Clock, owner)])));
      return owner;
    }),
  ).pipe(Effect.provide(Testing.main)),
);
assert.equal(await Effect.runPromise(owner.awaitExit.pipe(Effect.provide(Testing.main))), 0);
console.log("SDK_WORKER_CLOSED");
`,
  );
  run(
    "pnpm",
    [
      "exec",
      "tsc",
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--allowJs",
      "--checkJs",
      "--noUncheckedIndexedAccess",
      "--exactOptionalPropertyTypes",
      "--noUnusedLocals",
      "--noUnusedParameters",
      "--verbatimModuleSyntax",
      "--skipLibCheck",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2023",
      "sdk-worker.mjs",
    ],
    consumer,
  );
  run(process.execPath, ["sdk-worker.mjs"], consumer);
  succeeded = true;
} catch (error) {
  console.error(
    `SDK bootstrap failed at ${stage}: ${error instanceof Error ? error.message : String(error)}`,
  );
} finally {
  console.log(`METRIC sdk_bootstrap_failures=${succeeded ? 0 : 1}`);
  console.log(`METRIC sdk_workflow_ms=${(performance.now() - started).toFixed(3)}`);
  console.log(`ASI stage=${stage}`);
  console.log(`ASI consumer_path=${consumer}`);
  console.log(`ASI scenario=packed-scaffold-install-build-frozen-install-real-worker`);
  if (!succeeded) rmSync(temporary, { recursive: true, force: true });
}
