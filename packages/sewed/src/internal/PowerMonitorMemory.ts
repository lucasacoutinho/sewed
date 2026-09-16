import { Effect, Layer, Stream } from "effect";
import * as PowerMonitor from "../PowerMonitor.ts";
import type { SewedError } from "../SewedError.ts";
import * as CapabilityMemory from "./CapabilityMemory.ts";
import * as PowerMonitorPolicy from "./PowerMonitorPolicy.ts";

const snapshot: PowerMonitor.State = {
  onBattery: false,
  idleSeconds: 0,
  idleState: "active",
  thermal: "nominal",
};

// A core that stands in for Electron. The threshold check above it is the very code the native
// Layer runs, so a test meets the rules a renderer would, on a machine with no power to report.
const core: PowerMonitorPolicy.Core<never> = {
  state: () => Effect.succeed(snapshot),
  events: Stream.make({ kind: "suspend" }),
};

/**
 * The power capability for tests: the same threshold check `PowerMonitor.native` carries, no
 * Electron, and a recorder listing the calls.
 */
export const memory = (): Layer.Layer<
  typeof PowerMonitor.capability | CapabilityMemory.Recorder,
  SewedError
> =>
  CapabilityMemory.memory(PowerMonitor.capability, (implement) =>
    implement(
      Effect.map(PowerMonitorPolicy.operations(core), (operations) => ({
        state: ({ idleThresholdSeconds }) => operations.state(idleThresholdSeconds),
        events: () => operations.events,
      })),
    ),
  );
