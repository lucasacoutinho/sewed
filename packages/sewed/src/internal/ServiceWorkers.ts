import { Effect, Stream } from "effect";
import type { Scope } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as ServiceWorker from "../ServiceWorker.ts";
import * as Observation from "./Observation.ts";
import type { Handle } from "./Session.ts";
import { asynchronous, operation, resolved } from "./SessionSettings.ts";

export interface ServiceWorkers {
  readonly running: Effect.Effect<readonly ServiceWorker.Info[], SewedError, MainContext>;
  /** One worker by its version id, or `null` when no worker has it. */
  readonly info: (
    versionId: number,
  ) => Effect.Effect<ServiceWorker.Info | null, SewedError, MainContext>;
  /**
   * Starts the worker registered for a scope, or answers the one already running, as its version
   * id, scope and script. Electron marks this experimental.
   */
  readonly start: (scope: string) => Effect.Effect<ServiceWorker.Started, SewedError, MainContext>;
  /**
   * Keeps a running worker from being stopped for idleness, for the scope's lifetime. Fails
   * `Protocol` for a version id no running worker has. Electron marks this experimental.
   */
  readonly keepAlive: (
    versionId: number,
  ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
  /** Every observer owns its listeners and a queue of 128 events; overflow fails it with `Limit`. */
  readonly events: Stream.Stream<ServiceWorker.Event, SewedError, MainContext>;
}

export const serviceWorkers = (handle: Handle): ServiceWorkers => ({
  running: operation(handle, "Could not list service workers", (native) =>
    Object.entries(native.serviceWorkers.getAllRunning()).map(([versionId, info]) => ({
      versionId: Number(versionId),
      scriptUrl: info.scriptUrl,
      scope: info.scope,
      renderProcessId: info.renderProcessId,
    })),
  ),
  info: (versionId) =>
    operation(handle, "Could not read the service worker", (native) => {
      // Electron throws for an id no worker has; that is an answer here, not a failure.
      try {
        const found = native.serviceWorkers.getInfoFromVersionID(versionId);
        return {
          versionId,
          scriptUrl: found.scriptUrl,
          scope: found.scope,
          renderProcessId: found.renderProcessId,
        };
      } catch (cause) {
        if (cause instanceof Error && cause.message.includes("Could not find service worker"))
          return null;
        throw cause;
      }
    }),
  start: (scope) =>
    asynchronous(handle, "Could not start the service worker", async (native) => {
      const worker = await native.serviceWorkers.startWorkerForScope(new URL(scope).href);
      return { versionId: worker.versionId, scope: worker.scope, scriptUrl: worker.scriptURL };
    }),
  keepAlive: (versionId) =>
    Effect.asVoid(
      Effect.acquireRelease(
        operation(handle, "Could not keep the service worker alive", (native) => {
          const worker = native.serviceWorkers.getWorkerFromVersionID(versionId);
          if (worker === undefined)
            throw new SewedError({
              code: "Protocol",
              message: "No running service worker has this version id",
            });
          return worker.startTask();
        }),
        (task) => Effect.sync(() => task.end()),
      ),
    ),
  events: Stream.unwrap(
    Effect.map(resolved(handle), (native) =>
      Observation.fromEmitter<ServiceWorker.Event>("Service worker", () => native.serviceWorkers, [
        [
          "registration-completed",
          (_event: unknown, details: { readonly scope: string }) => ({
            kind: "registered",
            scope: details.scope,
          }),
        ],
        [
          "running-status-changed",
          (details: Electron.Event<Electron.ServiceWorkersRunningStatusChangedEventParams>) => ({
            kind: "status",
            versionId: details.versionId,
            status: details.runningStatus,
          }),
        ],
      ]),
    ),
  ),
});
