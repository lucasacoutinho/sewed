import { Effect, Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import type { SewedError } from "../SewedError.ts";
import * as ServiceWorker from "../ServiceWorker.ts";
import * as Observation from "./Observation.ts";
import type { Handle } from "./Session.ts";
import { operation, resolved } from "./SessionSettings.ts";

export interface ServiceWorkers {
  readonly running: Effect.Effect<readonly ServiceWorker.Info[], SewedError, MainContext>;
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
