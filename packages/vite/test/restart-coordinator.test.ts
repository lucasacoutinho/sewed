import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { launchManagedProcess, stopManagedProcess } from "../src/internal/process.js";
import { RestartCoordinator, type RestartEvent } from "../src/internal/restart-coordinator.js";

const processTreeFixture = fileURLToPath(new URL("./process-tree-fixture.mjs", import.meta.url));

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
    assert.equal(processIsAlive(processHandle.pid), false);
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

test("shutdown waits for artifact cleanup after a spontaneous process exit", async () => {
  const exit = deferred<{ code: number | null; signal: NodeJS.Signals | null }>();
  const cleanup = deferred<void>();
  const cleaning = deferred<void>();
  const coordinator = new RestartCoordinator({
    build: async () => 1,
    start: async () => ({ pid: 1, exit: exit.promise, requestShutdown: () => undefined }),
    stop: async () => ({ code: 0, signal: null }),
    discard: async () => {
      cleaning.resolve();
      await cleanup.promise;
    },
  });
  try {
    await coordinator.start();
    exit.resolve({ code: 0, signal: null });
    await cleaning.promise;
    let closed = false;
    const shutdown = coordinator.shutdown().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(closed, false);
    cleanup.resolve();
    await shutdown;
    assert.equal(closed, true);
  } finally {
    cleanup.resolve();
    await coordinator.shutdown();
  }
});

test("failed old-generation cleanup still discards the unstarted replacement", async () => {
  const discarded: number[] = [];
  const failed = deferred<void>();
  const coordinator = new RestartCoordinator({
    debounceMs: 0,
    build: async (generation) => generation,
    start: async (_artifact, generation) => ({
      pid: generation,
      exit: new Promise(() => undefined),
      requestShutdown: () => undefined,
    }),
    stop: async () => ({ code: 0, signal: null }),
    discard: async (artifact) => {
      discarded.push(artifact);
      if (artifact === 1) throw new Error("cleanup failed");
    },
    onError: () => failed.resolve(),
  });
  try {
    await coordinator.start();
    coordinator.request();
    await failed.promise;
    await coordinator.shutdown();
    assert.deepEqual(discarded, [1, 2]);
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
    assert.equal(processIsAlive(firstStarted.pid), true);

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

  const events: RestartEvent[] = [];
  const childPids: number[] = [];
  const childLivenessAtReplacement: boolean[] = [];
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
        args: [processTreeFixture, "stubborn", marker],
        cwd: directory,
      }),
    stop: (processHandle) => stopManagedProcess(processHandle, 100, 500),
    discard: (artifact) => rm(artifact, { force: true }),
    onEvent: (event) => {
      if (event.type === "started" && event.generation === 2) {
        for (const pid of childPids) childLivenessAtReplacement.push(processIsAlive(pid));
      }
      events.push(event);
    },
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
    assert.equal(processIsAlive(childPid), true);
    childPids.push(childPid);

    coordinator.request();
    const replacement = await waitForEvent(
      events,
      (event): event is Extract<RestartEvent, { readonly type: "started" }> =>
        event.type === "started" && event.generation === 2,
    );
    assert.notEqual(replacement.pid, firstStarted.pid);
    assert.equal(await waitForDead(firstStarted.pid), true);
    assert.deepEqual(childLivenessAtReplacement, [false]);
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

test("managed shutdown waits for an owned child after its parent exits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sewed-vite-parent-exit-"));
  const marker = join(directory, "child-pid");
  const processHandle = await launchManagedProcess({
    command: process.execPath,
    args: [processTreeFixture, "exit-on-shutdown", marker],
    cwd: directory,
  });
  try {
    const childPid = Number(await waitForFile(marker));
    assert.equal(Number.isInteger(childPid), true);
    assert.equal(processIsAlive(childPid), true);
    const exit = await stopManagedProcess(processHandle, 100, 500);
    assert.deepEqual(exit, { code: 0, signal: null });
    assert.equal(processIsAlive(processHandle.pid), false);
    assert.equal(processIsAlive(childPid), false);
  } finally {
    await stopManagedProcess(processHandle, 100, 500);
    await rm(directory, { recursive: true, force: true });
  }
});

test("managed shutdown preserves a denied process-tree liveness query", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "sewed-vite-liveness-denied-"));
  const marker = join(directory, "child-pid");
  const processHandle = await launchManagedProcess({
    command: process.execPath,
    args: [processTreeFixture, "exit-on-shutdown", marker],
    cwd: directory,
  });
  const nativeKill = process.kill;
  const ownedPid = process.platform === "win32" ? processHandle.pid : -processHandle.pid;
  const denied = Object.assign(new Error("Owned process liveness query denied"), { code: "EPERM" });
  let deniedQueries = 0;
  try {
    const childPid = Number(await waitForFile(marker));
    assert.equal(Number.isInteger(childPid), true);
    assert.equal(processIsAlive(childPid), true);
    context.mock.method(process, "kill", (pid: number, signal?: string | number) => {
      if (pid === ownedPid && signal === 0) {
        deniedQueries += 1;
        throw denied;
      }
      return nativeKill(pid, signal);
    });
    await assert.rejects(
      stopManagedProcess(processHandle, 100, 500),
      (error: unknown) => error === denied,
    );
    assert.ok(deniedQueries > 0);
    if (process.platform !== "win32") assert.equal(processIsAlive(childPid), true);
  } finally {
    context.mock.restoreAll();
    // Cleanup checks the real tree independently of the rejected exit observation.
    await stopManagedProcess(
      { ...processHandle, exit: Promise.resolve({ code: null, signal: null }) },
      100,
      500,
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("retains process ownership when its exit observation fails", async () => {
  const exit = deferred<{ code: number | null; signal: NodeJS.Signals | null }>();
  const observedError = deferred<unknown>();
  const failure = new Error("Process liveness could not be established");
  const events: RestartEvent[] = [];
  const started: number[] = [];
  const discarded: number[] = [];
  const stopped: number[] = [];
  const reportedExits: number[] = [];
  const coordinator = new RestartCoordinator({
    debounceMs: 0,
    build: async (generation) => generation,
    start: async (_artifact, generation) => {
      started.push(generation);
      return { pid: generation, exit: exit.promise, requestShutdown: () => undefined };
    },
    stop: async (processHandle) => {
      stopped.push(processHandle.pid);
      return { code: 0, signal: null };
    },
    discard: async (artifact) => {
      discarded.push(artifact);
    },
    onError: (error) => observedError.resolve(error),
    onEvent: (event) => events.push(event),
    onProcessExit: (generation) => reportedExits.push(generation),
  });
  try {
    await coordinator.start();
    exit.reject(failure);
    assert.equal(await observedError.promise, failure);
    assert.deepEqual(discarded, []);
    assert.deepEqual(reportedExits, []);
    assert.equal(
      events.some((event) => event.type === "stopped"),
      false,
    );
    coordinator.request();
    await coordinator.shutdown();
    assert.deepEqual(started, [1]);
    assert.deepEqual(stopped, [1]);
    assert.deepEqual(discarded, [1]);
  } finally {
    await coordinator.shutdown();
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

function deferred<A>() {
  let complete: ((value: A) => void) | undefined;
  let fail: ((error: unknown) => void) | undefined;
  const promise = new Promise<A>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  assert.ok(complete);
  assert.ok(fail);
  return { promise, resolve: complete, reject: fail };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForDead(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return true;
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
