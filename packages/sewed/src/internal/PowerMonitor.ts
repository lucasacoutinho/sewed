import type { EventEmitter } from "node:events";
import { powerMonitor } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Owner } from "../Binding.ts";
import { host as hostOwner } from "../Host.ts";
import * as PowerMonitor from "../PowerMonitor.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

export { Event, IdleState, IdleThreshold, State, ThermalState, protocol } from "../PowerMonitor.ts";

const decodeThreshold = Schema.decodeUnknownSync(PowerMonitor.IdleThreshold);
const decodeThermal = Schema.decodeUnknownSync(PowerMonitor.ThermalState);
const limitError = () =>
  new SewedError({ code: "Limit", message: "Power monitor observer queue is full" });

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

type Listener = (details: { readonly state?: unknown; readonly limit?: unknown }) => void;

const listeners = (
  offer: (event: PowerMonitor.Event) => void,
): readonly (readonly [string, Listener])[] => [
  ["suspend", () => offer({ kind: "suspend" })],
  ["resume", () => offer({ kind: "resume" })],
  ["on-ac", () => offer({ kind: "power-source", onBattery: false })],
  ["on-battery", () => offer({ kind: "power-source", onBattery: true })],
  ["lock-screen", () => offer({ kind: "screen", locked: true })],
  ["unlock-screen", () => offer({ kind: "screen", locked: false })],
  ["user-did-become-active", () => offer({ kind: "user", active: true })],
  ["user-did-resign-active", () => offer({ kind: "user", active: false })],
  ["shutdown", () => offer({ kind: "shutdown" })],
  [
    "thermal-state-change",
    (details) => offer({ kind: "thermal", state: decodeThermal(details.state) }),
  ],
  ["speed-limit-change", (details) => offer({ kind: "speed-limit", limit: Number(details.limit) })],
];

/** Every observer owns its listeners and a bounded queue; overflow fails that observer with `Limit`. */
export const events: Stream.Stream<PowerMonitor.Event, SewedError, MainContext> = Stream.callback<
  PowerMonitor.Event,
  SewedError,
  MainContext
>(
  (queue) =>
    Effect.gen(function* () {
      yield* MainContext;
      const emitter: EventEmitter = powerMonitor;
      const registrations = listeners((event) => {
        if (!Queue.offerUnsafe(queue, event))
          Queue.failCauseUnsafe(queue, Cause.fail(limitError()));
      });
      yield* Effect.acquireRelease(
        operation(() => {
          for (const [name, listener] of registrations) emitter.on(name, listener);
        }),
        () =>
          Effect.sync(() => {
            for (const [name, listener] of registrations) emitter.off(name, listener);
          }),
      );
    }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
  { bufferSize: 128 },
);

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
