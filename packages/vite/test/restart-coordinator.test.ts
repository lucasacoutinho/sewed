import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { launchManagedProcess, stopManagedProcess } from "../src/internal/process.js";
import { RestartCoordinator, type RestartEvent } from "../src/internal/restart-coordinator.js";

test("managed shutdown requests application cleanup over its parent IPC channel", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sewed-managed-shutdown-"));
  const finished = join(directory, "finalized");
  const program = join(directory, "app.cjs");
  await writeFile(
    program,
    `const fs = require("node:fs");
process.on("SIGTERM", () => {});
process.on("message", async (message) => {
  if (message !== "sewed:shutdown") return;
  await new Promise(resolve => setTimeout(resolve, 30));
  fs.writeFileSync(process.argv[2], "finalized");
  process.exit(0);
});
setInterval(() => {}, 1000);
`,
  );
  const processHandle = await launchManagedProcess({
    command: process.execPath,
    args: [program, finished],
    cwd: directory,
  });
  try {
    const exit = await stopManagedProcess(processHandle, 2_000, 500);
    assert.deepEqual(exit, { code: 0, signal: null });
    assert.equal(await readFile(finished, "utf8"), "finalized");
    assert.equal(await processIsAlive(processHandle.pid), false);
  } finally {
    await stopManagedProcess(processHandle, 100, 500);
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps watching after an initial build failure and recovers on a later request", async () => {
  const events: RestartEvent[] = [];
  const discarded: number[] = [];
  let buildCount = 0;
  const coordinator = new RestartCoordinator({
    debounceMs: 10,
    build: async (generation) => {
      buildCount += 1;
      if (generation === 1) throw new Error("initial compiler failure");
      return generation;
    },
    start: async (_artifact, generation) => ({
      pid: generation,
      exit: new Promise(() => undefined),
      requestShutdown: () => undefined,
    }),
    stop: async () => ({ code: 0, signal: null }),
    discard: async (artifact) => {
      discarded.push(artifact);
    },
    onEvent: (event) => events.push(event),
  });

  try {
    await coordinator.start();
    assert.deepEqual(
      events.map((event) => event.type),
      ["building", "build-failed"],
    );
    coordinator.request();
    await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "started" }> =>
        event.type === "started" && event.generation === 2,
    );
    assert.equal(buildCount, 2);
    assert.deepEqual(discarded, []);
  } finally {
    await coordinator.shutdown();
  }
});

test("retains the running generation after a failed build and serializes restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sewed-vite-coordinator-"));
  const marker = join(directory, "events.log");
  const worker = join(directory, "worker.mjs");
  await writeFile(
    worker,
    [
      'import { appendFileSync } from "node:fs";',
      "const marker = process.env.COORDINATOR_MARKER;",
      "const generation = process.env.COORDINATOR_GENERATION;",
      "if (marker !== undefined && generation !== undefined) appendFileSync(marker, `start:${generation}\\n`);",
      'process.on("SIGTERM", () => {',
      "  if (marker !== undefined && generation !== undefined) appendFileSync(marker, `stop:${generation}\\n`);",
      "  process.exit(0);",
      "});",
      "setInterval(() => {}, 1000);",
    ].join("\n"),
    "utf8",
  );

  const events: RestartEvent[] = [];
  let buildCount = 0;
  const coordinator = new RestartCoordinator({
    debounceMs: 10,
    build: async (generation) => {
      buildCount += 1;
      if (generation === 2) throw new Error("intentional compiler failure");
      const artifact = join(directory, `generation-${generation}`);
      await writeFile(artifact, String(generation), "utf8");
      return artifact;
    },
    start: (artifact, generation) =>
      launchManagedProcess({
        command: process.execPath,
        args: [worker],
        cwd: directory,
        env: {
          ...process.env,
          COORDINATOR_MARKER: marker,
          COORDINATOR_GENERATION: String(generation),
          COORDINATOR_ARTIFACT: artifact,
        },
      }),
    stop: (processHandle) => stopManagedProcess(processHandle, 500, 500),
    discard: (artifact) => rm(artifact, { force: true }),
    onEvent: (event) => events.push(event),
  });

  try {
    await coordinator.start();
    const firstStarted = await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "started" }> =>
        event.type === "started" && event.generation === 1,
    );
    coordinator.request();
    await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "build-failed" }> =>
        event.type === "build-failed" && event.generation === 2,
    );
    assert.equal(buildCount, 2);
    assert.equal(await processIsAlive(firstStarted.pid), true);

    coordinator.request();
    const replacement = await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "started" }> =>
        event.type === "started" && event.generation === 3,
    );
    assert.notEqual(replacement.pid, firstStarted.pid);
    const stoppedIndex = events.findIndex(
      (event) => event.type === "stopped" && event.generation === 1,
    );
    const replacementIndex = events.findIndex(
      (event) => event.type === "started" && event.generation === 3,
    );
    assert.notEqual(stoppedIndex, -1);
    assert.ok(stoppedIndex < replacementIndex);
  } finally {
    await coordinator.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

test("discards a superseded build before it can start", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sewed-vite-superseded-"));
  const events: RestartEvent[] = [];
  const startedGenerations: number[] = [];
  let buildCount = 0;
  const coordinator = new RestartCoordinator({
    debounceMs: 0,
    build: async (generation, signal) => {
      buildCount += 1;
      if (generation === 2) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 250);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("superseded"));
            },
            { once: true },
          );
        });
      }
      const artifact = join(directory, `generation-${generation}`);
      await writeFile(artifact, String(generation), "utf8");
      return artifact;
    },
    start: async (_artifact, generation) => {
      startedGenerations.push(generation);
      return {
        pid: process.pid,
        exit: Promise.resolve({ code: 0, signal: null }),
        requestShutdown: () => undefined,
      };
    },
    stop: async () => ({ code: 0, signal: null }),
    discard: (artifact) => rm(artifact, { force: true }),
    onEvent: (event) => events.push(event),
  });

  try {
    await coordinator.start();
    coordinator.request();
    await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "building" }> =>
        event.type === "building" && event.generation === 2,
    );
    coordinator.request();
    await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "started" }> =>
        event.type === "started" && event.generation === 3,
    );
    assert.equal(buildCount, 3);
    assert.deepEqual(startedGenerations, [1, 3]);
    assert.equal(
      events.some((event) => event.type === "started" && event.generation === 2),
      false,
    );
  } finally {
    await coordinator.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

test("force-stops an owned stubborn process tree before starting its replacement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sewed-vite-stubborn-"));
  const marker = join(directory, "child-pid");
  const child = join(directory, "stubborn-child.mjs");
  const worker = join(directory, "stubborn-worker.mjs");
  await writeFile(child, 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);\n', "utf8");
  await writeFile(
    worker,
    [
      'import { appendFileSync } from "node:fs";',
      'import { spawn } from "node:child_process";',
      'const child = spawn(process.execPath, [new URL("./stubborn-child.mjs", import.meta.url)], { stdio: "ignore" });',
      "const marker = process.env.COORDINATOR_CHILD_MARKER;",
      "if (marker !== undefined && child.pid !== undefined) appendFileSync(marker, String(child.pid));",
      'process.on("SIGTERM", () => {});',
      "setInterval(() => {}, 1000);",
    ].join("\n"),
    "utf8",
  );

  const events: RestartEvent[] = [];
  const coordinator = new RestartCoordinator({
    debounceMs: 10,
    build: async (generation) => {
      const artifact = join(directory, `generation-${generation}`);
      await writeFile(artifact, String(generation), "utf8");
      return artifact;
    },
    start: (_artifact, _generation) =>
      launchManagedProcess({
        command: process.execPath,
        args: [worker],
        cwd: directory,
        env: {
          ...process.env,
          COORDINATOR_CHILD_MARKER: marker,
        },
      }),
    stop: (processHandle) => stopManagedProcess(processHandle, 100, 500),
    discard: (artifact) => rm(artifact, { force: true }),
    onEvent: (event) => events.push(event),
  });

  try {
    await coordinator.start();
    const firstStarted = await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "started" }> =>
        event.type === "started" && event.generation === 1,
    );
    const childPid = Number(await waitForFile(marker));
    assert.equal(Number.isInteger(childPid), true);

    coordinator.request();
    const replacement = await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "started" }> =>
        event.type === "started" && event.generation === 2,
    );
    assert.notEqual(replacement.pid, firstStarted.pid);
    assert.equal(await waitForDead(firstStarted.pid), true);
    assert.equal(await waitForDead(childPid), true);
    const stoppedIndex = events.findIndex(
      (event) => event.type === "stopped" && event.generation === 1,
    );
    const replacementIndex = events.findIndex(
      (event) => event.type === "started" && event.generation === 2,
    );
    assert.ok(stoppedIndex >= 0 && stoppedIndex < replacementIndex);
  } finally {
    await coordinator.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

async function waitForEvent<Event extends RestartEvent>(
  events: readonly RestartEvent[],
  predicate: (event: RestartEvent) => event is Event,
): Promise<Event> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const event = events.find(predicate);
    if (event !== undefined) return event;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for coordinator event");
}

async function processIsAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForDead(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!(await processIsAlive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

async function waitForFile(path: string): Promise<string> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}
