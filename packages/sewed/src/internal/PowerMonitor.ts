import { powerMonitor } from "electron";
import { Effect, Layer, Schema } from "effect";
import type { Stream } from "effect";
import * as Capability from "../Capability.ts";
import * as PowerMonitor from "../PowerMonitor.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observation from "./Observation.ts";
import * as PowerMonitorPolicy from "./PowerMonitorPolicy.ts";

export {
  Event,
  IdleState,
  IdleThreshold,
  State,
  ThermalState,
  capability,
  protocol,
} from "../PowerMonitor.ts";

const decodeThreshold = Schema.decodeUnknownSync(PowerMonitor.IdleThreshold);
const decodeThermal = Schema.decodeUnknownSync(PowerMonitor.ThermalState);

const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: "Power monitor operation failed", cause }),
    }),
  );

export const state = (
  idleThresholdSeconds: number,
): Effect.Effect<PowerMonitor.State, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeThreshold(idleThresholdSeconds),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid idle threshold", cause }),
    }),
    (threshold) =>
      operation(() => ({
        onBattery: powerMonitor.isOnBatteryPower(),
        idleSeconds: powerMonitor.getSystemIdleTime(),
        idleState: powerMonitor.getSystemIdleState(threshold),
        thermal: powerMonitor.getCurrentThermalState(),
      })),
  );

/** Every observer owns its listeners and a bounded queue; overflow fails that observer with `Limit`. */
export const events: Stream.Stream<PowerMonitor.Event, SewedError, MainContext> =
  Observation.fromEmitter<PowerMonitor.Event>("Power monitor", () => powerMonitor, [
    ["suspend", () => ({ kind: "suspend" })],
    ["resume", () => ({ kind: "resume" })],
    ["on-ac", () => ({ kind: "power-source", onBattery: false })],
    ["on-battery", () => ({ kind: "power-source", onBattery: true })],
    ["lock-screen", () => ({ kind: "screen", locked: true })],
    ["unlock-screen", () => ({ kind: "screen", locked: false })],
    ["user-did-become-active", () => ({ kind: "user", active: true })],
    ["user-did-resign-active", () => ({ kind: "user", active: false })],
    ["shutdown", () => ({ kind: "shutdown" })],
    [
      "thermal-state-change",
      (details: { readonly state: unknown }) => ({
        kind: "thermal",
        state: decodeThermal(details.state),
      }),
    ],
    [
      "speed-limit-change",
      (details: { readonly limit: unknown }) => ({
        kind: "speed-limit",
        limit: Number(details.limit),
      }),
    ],
  ]);

// Electron only ever sees an idle threshold the schema accepted.
const core: PowerMonitorPolicy.Core<MainContext> = { state, events };

/**
 * The power capability for main. The rules live in this Layer, not in a separate host, so
 * `Capability.serve(PowerMonitor.capability)` gives a document exactly the checks a main-side call
 * obeys.
 */
export const native = (): Layer.Layer<typeof PowerMonitor.capability, SewedError, MainContext> =>
  Capability.fromHandlers(PowerMonitor.capability, (implement) =>
    implement(
      Effect.map(PowerMonitorPolicy.operations(core), (operations) => ({
        state: ({ idleThresholdSeconds }) => operations.state(idleThresholdSeconds),
        events: () => operations.events,
      })),
    ),
  );
