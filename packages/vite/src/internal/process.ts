import { spawn, type ChildProcess } from "node:child_process";

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface ManagedProcess {
  readonly pid: number;
  readonly exit: Promise<ProcessExit>;
  readonly requestShutdown: () => void;
}

interface CommandResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

interface CommandOptions {
  readonly cwd: string;
  readonly signal?: AbortSignal;
  readonly stdio?: "pipe" | "inherit";
  readonly env?: NodeJS.ProcessEnv;
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions,
): Promise<CommandResult> {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    stdio: options.stdio ?? "pipe",
  });

  let stdout = "";
  let stderr = "";
  if (child.stdout !== null) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
  }
  if (child.stderr !== null) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
  }

  let abortListener: (() => void) | undefined;
  let spawnListener: (() => void) | undefined;
  let forceTimer: NodeJS.Timeout | undefined;
  let settled = false;
  let abortRequested = false;
  let commandPid: number | undefined;
  const scheduleForce = (): void => {
    if (forceTimer !== undefined) clearTimeout(forceTimer);
    forceTimer = setTimeout(() => {
      if (!settled && commandPid !== undefined) void terminateProcessTree(commandPid, "SIGKILL");
    }, 500);
  };
  if (options.signal !== undefined) {
    abortListener = () => {
      abortRequested = true;
      const pid = commandPid;
      if (pid !== undefined) void terminateProcessTree(pid, "SIGTERM");
      scheduleForce();
    };
    spawnListener = () => {
      commandPid = child.pid ?? undefined;
      if (abortRequested && commandPid !== undefined) {
        void terminateProcessTree(commandPid, "SIGTERM");
        scheduleForce();
      }
    };
    child.once("spawn", spawnListener);
    if (options.signal.aborted) abortListener();
    else options.signal.addEventListener("abort", abortListener, { once: true });
  }

  return new Promise((resolve) => {
    const finish = async (result: CommandResult): Promise<void> => {
      if (settled) return;
      settled = true;
      if (forceTimer !== undefined) clearTimeout(forceTimer);
      if (options.signal !== undefined && abortListener !== undefined) {
        options.signal.removeEventListener("abort", abortListener);
      }
      if (spawnListener !== undefined) child.off("spawn", spawnListener);
      if (abortRequested && commandPid !== undefined) {
        await terminateProcessTree(commandPid, "SIGKILL");
      }
      resolve(result);
    };

    child.once("error", (error: Error) => {
      void finish({
        code: null,
        signal: null,
        stdout,
        stderr,
        error,
      });
    });
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      void finish({ code, signal, stdout, stderr, error: undefined });
    });
  });
}

export async function launchManagedProcess(options: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ManagedProcess> {
  const child = spawn(options.command, [...options.args], {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  const leaderExit = waitForExit(child);
  await waitForSpawn(child);
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("The Electron process did not expose a process id after spawning");
  }
  return {
    pid,
    exit: waitForManagedExit(pid, leaderExit),
    requestShutdown: () => {
      if (child.connected) {
        child.send("sewed:shutdown", (error) => {
          if (error !== null && child.exitCode === null && child.signalCode === null)
            child.kill("SIGTERM");
        });
      } else child.kill("SIGTERM");
    },
  };
}

export async function stopManagedProcess(
  processHandle: ManagedProcess,
  gracefulMs = 5_000,
  forceMs = 1_000,
): Promise<ProcessExit> {
  processHandle.requestShutdown();
  const gracefulExit = await waitForProcessTreeStop(
    processHandle.pid,
    processHandle.exit,
    gracefulMs,
  );
  if (gracefulExit !== undefined) return gracefulExit;

  await terminateProcessTree(processHandle.pid, "SIGKILL");
  const forcedExit = await waitForProcessTreeStop(processHandle.pid, processHandle.exit, forceMs);
  if (forcedExit === undefined) {
    throw new Error(
      `The owned development process ${processHandle.pid} did not stop after graceful and forceful termination`,
    );
  }
  return forcedExit;
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSpawn = (): void => {
      child.off("error", onError);
      resolve();
    };
    const onError = (error: Error): void => {
      child.off("spawn", onSpawn);
      reject(error);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

function waitForExit(child: ChildProcess): Promise<ProcessExit> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exit: ProcessExit): void => {
      if (settled) return;
      settled = true;
      resolve(exit);
    };
    child.once("error", () => finish({ code: null, signal: null }));
    child.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      finish({ code, signal });
    });
  });
}

async function waitForManagedExit(
  pid: number,
  leaderExit: Promise<ProcessExit>,
): Promise<ProcessExit> {
  const exit = await leaderExit;
  const deniedUntil = Date.now() + deniedGraceMs;
  while (true) {
    const probe = probeProcessTree(pid);
    if (probe.state === "gone") return exit;
    if (probe.state === "denied" && Date.now() >= deniedUntil) throw probe.error;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

async function waitForProcessTreeStop(
  pid: number,
  exit: Promise<ProcessExit>,
  timeoutMs: number,
): Promise<ProcessExit | undefined> {
  let outcome:
    | { readonly type: "exited"; readonly value: ProcessExit }
    | { readonly type: "failed"; readonly error: unknown }
    | undefined;
  void exit.then(
    (value) => {
      outcome = { type: "exited", value };
    },
    (error: unknown) => {
      outcome = { type: "failed", error };
    },
  );
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (outcome?.type === "failed") throw outcome.error;
    const probe = probeProcessTree(pid);
    if (outcome?.type === "exited" && probe.state === "gone") return outcome.value;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      // A tree that still refuses the query is reported before anything is escalated against it.
      if (probe.state === "denied") throw probe.error;
      return undefined;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(20, remaining));
    });
  }
}

/** How long a tree that has exited may keep refusing the liveness query before that is an error. */
const deniedGraceMs = 250;

type Liveness =
  | { readonly state: "alive" }
  | { readonly state: "gone" }
  | { readonly state: "denied"; readonly error: unknown };

/**
 * Asks whether the owned tree still exists. A refused query is its own answer: macOS refuses
 * briefly while a process group exits, so callers wait it out, and report it if it persists.
 */
function probeProcessTree(pid: number): Liveness {
  try {
    if (process.platform === "win32") process.kill(pid, 0);
    else process.kill(-pid, 0);
    return { state: "alive" };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error)) throw error;
    if (error.code === "ESRCH") return { state: "gone" };
    if (error.code === "EPERM") return { state: "denied", error };
    throw error;
  }
}

async function terminateProcessTree(pid: number, signal: NodeJS.Signals): Promise<void> {
  if (process.platform === "win32") {
    await runTaskkill(pid, signal === "SIGKILL");
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // The process group may already have exited.
  }
}

function runTaskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn("taskkill.exe", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => resolve());
    child.once("close", () => resolve());
  });
}
