import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { launchManagedProcess, stopManagedProcess } from "./internal/process.js";
import {
  RestartCoordinator,
  type RestartCoordinatorOptions,
} from "./internal/restart-coordinator.js";
import {
  emitProject,
  isWithin,
  resolveProject,
  type EmittedProject,
  type ProjectInfo,
} from "./internal/tsc.js";
import type { SewedViteEvent } from "./events.js";

export type { SewedViteEvent };

export interface SewedViteOptions {
  readonly main: string;
  readonly tsconfig?: string;
  readonly cwd?: string;
  readonly electronPath?: string;
  readonly electronArgs?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly debounceMs?: number;
  readonly onEvent?: (event: SewedViteEvent) => void;
}

export function sewed(options: SewedViteOptions): Plugin {
  validateOptions(options);
  const tsconfig = options.tsconfig ?? "tsconfig.json";
  const electronArgs = [...(options.electronArgs ?? [])];
  const environment = { ...options.env };
  let projectDir: string | undefined;
  let server: ViteDevServer | undefined;
  let coordinator: RestartCoordinator<EmittedProject> | undefined;
  let sessionDir: string | undefined;
  let startPromise: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let watcherListener: ((event: string, path: string) => void) | undefined;
  let serverCloseListener: (() => void) | undefined;
  let interruptListener: (() => void) | undefined;
  let listenListener: (() => void) | undefined;
  const watchTargets = new Set<string>();

  const plugin: Plugin = {
    name: "sewed-vite",
    apply: "serve",

    configResolved(config): void {
      projectDir = resolve(
        options.cwd ?? (config.configFile ? dirname(config.configFile) : process.cwd()),
      );
    },

    configureServer(nextServer): () => void {
      if (server !== undefined && server !== nextServer) {
        throw new Error("@sewed/vite can only be attached to one Vite dev server instance");
      }
      server = nextServer;
      interruptListener = () => {
        process.exitCode ??= 130;
        void nextServer.close().catch((error: unknown) => reportShutdownFailure(error));
      };
      process.on("SIGINT", interruptListener);
      const activeProjectDir = projectDir ?? resolve(options.cwd ?? process.cwd());
      const developmentDir = join(activeProjectDir, ".sewed", "dev");
      projectDir = activeProjectDir;
      addWatchTarget(resolve(activeProjectDir, tsconfig));

      watcherListener = (_event: string, changedPath: string): void => {
        if (isWithin(developmentDir, resolve(activeProjectDir, changedPath))) return;
        if (!isWatchedPath(activeProjectDir, changedPath, watchTargets)) return;
        coordinator?.request();
      };
      nextServer.watcher.on("all", watcherListener);
      serverCloseListener = () => {
        void shutdown().catch((error: unknown) => reportShutdownFailure(error));
      };
      nextServer.httpServer?.once("close", serverCloseListener);

      return () => {
        if (listenListener !== undefined) return;
        listenListener = () => {
          listenListener = undefined;
          void start().catch((error: unknown) => reportStartupFailure(error));
        };
        const httpServer = nextServer.httpServer;
        if (httpServer === null || httpServer.listening) listenListener();
        else httpServer.once("listening", listenListener);
      };
    },

    async closeBundle(): Promise<void> {
      await shutdown();
    },
  };

  return plugin;

  async function start(): Promise<void> {
    if (startPromise !== undefined) return startPromise;
    if (shutdownPromise !== undefined) return shutdownPromise;
    const activeServer = server;
    const activeProjectDir = projectDir;
    if (activeServer === undefined || activeProjectDir === undefined) {
      throw new Error("@sewed/vite could not determine the Vite server project directory");
    }
    if (activeServer.httpServer === null) {
      throw new Error(
        "@sewed/vite requires a Vite HTTP server; middleware mode cannot host Electron",
      );
    }

    startPromise = (async () => {
      const activeSessionDir = join(activeProjectDir, ".sewed", "dev", createSessionName());
      sessionDir = activeSessionDir;
      await mkdir(activeSessionDir, { recursive: true });
      if (shutdownPromise !== undefined) {
        await rm(activeSessionDir, { recursive: true, force: true });
        return;
      }
      const coordinatorOptions: RestartCoordinatorOptions<EmittedProject> = {
        ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
        build: async (generation, signal) => {
          const project = await resolveProject({
            projectDir: activeProjectDir,
            tsconfig,
            main: options.main,
            signal,
            onConfigPaths: (paths) => {
              for (const path of paths) addWatchTarget(path);
            },
          });
          updateWatchTargets(activeServer, project);
          const stageDir = join(activeSessionDir, String(generation));
          return emitProject(project, stageDir, signal);
        },
        start: async (artifact, generation) => {
          const electron = resolveElectron({
            cwd: activeProjectDir,
            ...(options.electronPath === undefined ? {} : { electronPath: options.electronPath }),
          });
          return launchManagedProcess({
            command: electron,
            args: [...electronArgs, artifact.stageDir],
            cwd: activeProjectDir,
            env: {
              ...process.env,
              ...environment,
              SEWED_RENDERER_URL: rendererUrl(activeServer),
              SEWED_GENERATION: String(generation),
            },
          });
        },
        stop: (processHandle) => stopManagedProcess(processHandle),
        discard: async (artifact) => {
          await rm(artifact.stageDir, { recursive: true, force: true });
        },
        onEvent: (event) => {
          if (event.type === "build-failed") activeServer.config.logger.error(event.error);
          options.onEvent?.(event);
        },
        onProcessExit: () => {
          const activeCoordinator = coordinator;
          if (activeCoordinator !== undefined) {
            void activeCoordinator
              .shutdown()
              .catch((error: unknown) => reportShutdownFailure(error));
          }
          void activeServer.close().catch((error: unknown) => reportShutdownFailure(error));
        },
        onError: (error) => reportShutdownFailure(error),
      };
      coordinator = new RestartCoordinator(coordinatorOptions);
      await coordinator.start();
    })();
    return startPromise;
  }

  async function shutdown(): Promise<void> {
    if (shutdownPromise !== undefined) return shutdownPromise;
    shutdownPromise = (async () => {
      const activeServer = server;
      if (
        listenListener !== undefined &&
        activeServer?.httpServer !== null &&
        activeServer?.httpServer !== undefined
      ) {
        activeServer.httpServer.off("listening", listenListener);
        listenListener = undefined;
      }
      if (watcherListener !== undefined && activeServer !== undefined) {
        activeServer.watcher.off("all", watcherListener);
        watcherListener = undefined;
      }
      try {
        if (coordinator !== undefined) await coordinator.shutdown();
        if (sessionDir !== undefined) {
          await rm(sessionDir, { recursive: true, force: true });
          sessionDir = undefined;
        }
      } finally {
        if (interruptListener !== undefined) {
          process.off("SIGINT", interruptListener);
          interruptListener = undefined;
        }
        if (
          serverCloseListener !== undefined &&
          activeServer?.httpServer !== null &&
          activeServer?.httpServer !== undefined
        ) {
          activeServer.httpServer.off("close", serverCloseListener);
          serverCloseListener = undefined;
        }
      }
    })();
    return shutdownPromise;
  }

  function updateWatchTargets(activeServer: ViteDevServer, project: ProjectInfo): void {
    watchTargets.clear();
    for (const path of project.configPaths) watchTargets.add(path);
    for (const path of project.includeRoots) watchTargets.add(path);
    for (const path of project.files) watchTargets.add(path);
    for (const path of project.watchFiles) watchTargets.add(path);
    watchTargets.add(join(project.projectDir, "package.json"));
    activeServer.watcher.add([...watchTargets]);
  }

  function addWatchTarget(path: string): void {
    watchTargets.add(path);
    server?.watcher.add(path);
  }

  function reportStartupFailure(error: unknown): void {
    const activeServer = server;
    if (activeServer !== undefined) activeServer.config.logger.error(errorMessage(error));
    void shutdown()
      .then(async () => {
        if (
          activeServer?.httpServer !== null &&
          activeServer?.httpServer !== undefined &&
          activeServer.httpServer.listening
        ) {
          await activeServer.close();
        }
      })
      .catch((shutdownError: unknown) => reportShutdownFailure(shutdownError));
  }

  function reportShutdownFailure(error: unknown): void {
    const activeServer = server;
    if (activeServer !== undefined) activeServer.config.logger.error(errorMessage(error));
  }
}

function validateOptions(options: SewedViteOptions): void {
  if (options.main.trim() === "")
    throw new Error("@sewed/vite requires a non-empty main TypeScript source path");
  if (options.tsconfig !== undefined && options.tsconfig.trim() === "") {
    throw new Error("@sewed/vite tsconfig must be a non-empty path when provided");
  }
  if (
    options.debounceMs !== undefined &&
    (!Number.isFinite(options.debounceMs) || options.debounceMs < 0)
  ) {
    throw new Error("@sewed/vite debounceMs must be a finite non-negative number");
  }
}

/**
 * Resolves the Electron binary a launcher spawns: `require("electron")` from `cwd`'s
 * `package.json` (default: the current working directory), the same resolution the `sewed` Vite
 * plugin performs for its own development runs. An explicit `electronPath` overrides resolution
 * entirely and is taken as absolute or resolved against `cwd`. Throws when Electron cannot be
 * resolved there — install Electron >=41 <45 in the consumer project, or pass `electronPath`. A
 * Node launcher can import this from `@sewed/vite` without paying for a Vite dependency: the
 * package's own entry imports `vite` as types only.
 */
export function resolveElectron(options?: {
  readonly cwd?: string;
  readonly electronPath?: string;
}): string {
  const projectDir = resolve(options?.cwd ?? process.cwd());
  const electronPath = options?.electronPath;
  if (electronPath !== undefined)
    return isAbsolute(electronPath) ? electronPath : resolve(projectDir, electronPath);
  const require = createRequire(join(projectDir, "package.json"));
  let value: unknown;
  try {
    value = require("electron");
  } catch {
    throw new Error(
      `@sewed/vite could not resolve Electron from ${projectDir}. Install Electron >=41 <45 in the consumer project or set electronPath.`,
    );
  }
  if (typeof value !== "string") {
    throw new Error(`@sewed/vite resolved Electron from ${projectDir} to a non-path value`);
  }
  return value;
}

function rendererUrl(server: ViteDevServer): string {
  const configured = server.resolvedUrls?.local[0];
  if (configured !== undefined) return configured;
  const httpServer = server.httpServer;
  if (httpServer === null)
    throw new Error("Vite did not expose an HTTP server for Electron development");
  const address = httpServer.address();
  if (address === null || typeof address === "string")
    throw new Error("Vite did not bind a TCP port for Electron development");
  const protocol = server.config.server.https ? "https" : "http";
  const host =
    address.address === "::" || address.address === "0.0.0.0" ? "127.0.0.1" : address.address;
  const hostPart = host.includes(":") ? `[${host}]` : host;
  return `${protocol}://${hostPart}:${address.port}/`;
}

function isWatchedPath(
  projectDir: string,
  changedPath: string,
  targets: ReadonlySet<string>,
): boolean {
  const absolutePath = isAbsolute(changedPath) ? changedPath : resolve(projectDir, changedPath);
  for (const target of targets) {
    if (isWithin(target, absolutePath)) return true;
  }
  return false;
}

function createSessionName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
