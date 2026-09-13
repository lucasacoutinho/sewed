import { powerMonitor } from "electron";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import type { Scope } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Owner } from "../Binding.ts";
import { host as hostOwner } from "../Host.ts";
import * as PowerMonitor from "../PowerMonitor.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observation from "./Observation.ts";

export { Event, IdleState, IdleThreshold, State, ThermalState, protocol } from "../PowerMonitor.ts";

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

export const host = (): Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof PowerMonitor.protocol>>,
  SewedError,
  MainContext | Scope.Scope
> =>
  Effect.gen(function* () {
    yield* MainContext;
    return yield* hostOwner(
      PowerMonitor.protocol,
      PowerMonitor.protocol.toLayer({
        state: ({ idleThresholdSeconds }) => state(idleThresholdSeconds),
        events: () => events,
      }),
    );
  });
