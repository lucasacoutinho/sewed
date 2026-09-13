import type { ManagedProcess, ProcessExit } from "./process.js";
import type { SewedViteEvent } from "../events.js";

export type RestartEvent = SewedViteEvent;

export interface RestartCoordinatorOptions<Artifact> {
  readonly build: (generation: number, signal: AbortSignal) => Promise<Artifact>;
  readonly start: (artifact: Artifact, generation: number) => Promise<ManagedProcess>;
  readonly stop: (processHandle: ManagedProcess) => Promise<ProcessExit>;
  readonly discard: (artifact: Artifact) => Promise<void>;
  readonly debounceMs?: number;
  readonly onEvent?: (event: RestartEvent) => void;
  readonly onProcessExit?: (generation: number, exit: ProcessExit) => void;
  readonly onError?: (error: unknown) => void;
}

type BuildResult<Artifact> =
  | {
      readonly type: "success";
      readonly artifact: Artifact;
    }
  | {
      readonly type: "failed";
      readonly error: unknown;
    }
  | {
      readonly type: "aborted";
    };

interface RunningProcess<Artifact> {
  readonly generation: number;
  readonly process: ManagedProcess;
  readonly artifact: Artifact;
  stopping: boolean;
  cleanup: Promise<void> | undefined;
}

export class RestartCoordinator<Artifact> {
  private readonly options: RestartCoordinatorOptions<Artifact>;
  private readonly debounceMs: number;
  private desiredRevision = 0;
  private handledRevision = 0;
  private generation = 0;
  private running: RunningProcess<Artifact> | undefined;
  private activeBuild: AbortController | undefined;
  private timer: NodeJS.Timeout | undefined;
  private loop: Promise<void> | undefined;
  private startup: Promise<void> | undefined;
  private shutdownPromise: Promise<void> | undefined;
  private disposed = false;
  private fatalError: unknown | undefined;

  public constructor(options: RestartCoordinatorOptions<Artifact>) {
    this.options = options;
    this.debounceMs = options.debounceMs ?? 75;
  }

  public async start(): Promise<void> {
    if (this.shutdownPromise !== undefined || this.disposed) {
      throw new Error("The Sewed Vite development coordinator has already shut down");
    }
    if (this.startup !== undefined) return this.startup;
    this.desiredRevision = Math.max(this.desiredRevision, 1);
    this.startup = this.runLoop(true);
    try {
      await this.startup;
    } finally {
      this.startup = undefined;
      if (
        !this.disposed &&
        this.fatalError === undefined &&
        this.desiredRevision !== this.handledRevision
      ) {
        this.scheduleLoop();
      }
    }
  }

  public request(): void {
    if (this.disposed || this.fatalError !== undefined) return;
    this.desiredRevision += 1;
    this.activeBuild?.abort();
    if (this.startup !== undefined) return;
    this.scheduleLoop();
  }

  public async shutdown(): Promise<void> {
    if (this.shutdownPromise !== undefined) return this.shutdownPromise;
    this.shutdownPromise = this.shutdownInternal();
    return this.shutdownPromise;
  }

  private scheduleLoop(): void {
    if (this.timer !== undefined || this.loop !== undefined || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.loop = this.runLoop(false)
        .catch((error: unknown) => this.handleError(error))
        .finally(() => {
          this.loop = undefined;
          if (
            !this.disposed &&
            this.fatalError === undefined &&
            this.desiredRevision !== this.handledRevision
          )
            this.scheduleLoop();
        });
    }, this.debounceMs);
  }

  private async runLoop(startup: boolean): Promise<void> {
    while (!this.disposed && this.fatalError === undefined) {
      const revision = this.desiredRevision;
      if (revision === this.handledRevision) {
        if (startup && this.running === undefined) {
          throw new Error("The Electron development process did not start");
        }
        return;
      }

      const generation = this.generation + 1;
      this.generation = generation;
      this.emit({ type: "building", generation });
      const result = await this.build(generation);
      if (this.disposed) {
        if (result.type === "success") await this.discardArtifact(result.artifact);
        return;
      }
      if (result.type === "aborted" || revision !== this.desiredRevision) {
        if (result.type === "success") await this.discardArtifact(result.artifact);
        continue;
      }
      if (result.type === "failed") {
        this.handledRevision = revision;
        const message = errorMessage(result.error);
        this.emit({ type: "build-failed", generation, error: message });
        if (startup) return;
        continue;
      }

      const previous = this.running;
      if (previous !== undefined) {
        previous.stopping = true;
        let exit: ProcessExit;
        try {
          exit = await this.options.stop(previous.process);
        } catch (error) {
          previous.stopping = false;
          await this.discardArtifact(result.artifact);
          this.handledRevision = revision;
          this.handleError(error);
          this.emit({
            type: "build-failed",
            generation,
            error: errorMessage(error),
          });
          if (startup) throw error;
          return;
        }
        if (this.running === previous) {
          this.running = undefined;
          this.emit({
            type: "stopped",
            generation: previous.generation,
            pid: previous.process.pid,
            code: exit.code,
            signal: exit.signal,
          });
          previous.cleanup = this.discardArtifact(previous.artifact);
        }
        if (previous.cleanup !== undefined) await previous.cleanup;
        if (this.fatalError !== undefined) return;
      }
      if (this.disposed || revision !== this.desiredRevision) {
        await this.discardArtifact(result.artifact);
        continue;
      }

      let next: ManagedProcess;
      try {
        next = await this.options.start(result.artifact, generation);
      } catch (error) {
        await this.discardArtifact(result.artifact);
        this.handledRevision = revision;
        const message = errorMessage(error);
        this.emit({ type: "build-failed", generation, error: message });
        if (startup) throw new Error(message);
        continue;
      }

      this.running = {
        generation,
        process: next,
        artifact: result.artifact,
        stopping: false,
        cleanup: undefined,
      };
      this.monitor(next, generation);
      this.emit({ type: "started", generation, pid: next.pid });
      this.handledRevision = revision;
      if (startup) return;
    }
  }

  private async build(generation: number): Promise<BuildResult<Artifact>> {
    const controller = new AbortController();
    this.activeBuild = controller;
    try {
      return { type: "success", artifact: await this.options.build(generation, controller.signal) };
    } catch (error) {
      return controller.signal.aborted ? { type: "aborted" } : { type: "failed", error };
    } finally {
      if (this.activeBuild === controller) this.activeBuild = undefined;
    }
  }

  private monitor(processHandle: ManagedProcess, generation: number): void {
    void processHandle.exit.then((exit) => {
      if (this.disposed || this.running?.process !== processHandle) return;
      const previous = this.running;
      if (previous.stopping) return;
      this.running = undefined;
      this.emit({
        type: "stopped",
        generation,
        pid: processHandle.pid,
        code: exit.code,
        signal: exit.signal,
      });
      if (previous !== undefined) {
        previous.cleanup = this.discardArtifact(previous.artifact);
      }
      try {
        this.options.onProcessExit?.(generation, exit);
      } catch {
        // Process-exit observers cannot interrupt coordinator cleanup.
      }
    });
  }

  private async shutdownInternal(): Promise<void> {
    this.disposed = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.activeBuild?.abort();
    const loop = this.loop;
    if (loop !== undefined) await loop;
    const startup = this.startup;
    if (startup !== undefined) {
      try {
        await startup;
      } catch {
        // Startup errors are already reported by the coordinator event.
      }
    }
    const previous = this.running;
    if (previous !== undefined) {
      previous.stopping = true;
      let exit: ProcessExit;
      try {
        exit = await this.options.stop(previous.process);
      } catch (error) {
        previous.stopping = false;
        throw error;
      }
      if (this.running === previous) {
        this.running = undefined;
        this.emit({
          type: "stopped",
          generation: previous.generation,
          pid: previous.process.pid,
          code: exit.code,
          signal: exit.signal,
        });
        previous.cleanup = this.discardArtifact(previous.artifact);
      }
      if (previous.cleanup !== undefined) await previous.cleanup;
    }
  }

  private async discardArtifact(artifact: Artifact): Promise<void> {
    try {
      await this.options.discard(artifact);
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): void {
    if (this.fatalError === undefined) this.fatalError = error;
    try {
      this.options.onError?.(error);
    } catch {
      // Error observers cannot interrupt coordinator ownership.
    }
  }

  private emit(event: RestartEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch {
      // Event observers cannot interrupt build or shutdown ownership.
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
