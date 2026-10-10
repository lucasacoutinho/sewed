import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Capability from "./Capability.ts";
import { SewedError } from "./SewedError.ts";

export const ThermalState = Schema.Literals(["unknown", "nominal", "fair", "serious", "critical"]);
export type ThermalState = typeof ThermalState.Type;
export const IdleState = Schema.Literals(["active", "idle", "locked", "unknown"]);
export type IdleState = typeof IdleState.Type;
export const IdleThreshold = Schema.Int.check(Schema.isGreaterThan(0));

export const Event = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("suspend") }),
  Schema.Struct({ kind: Schema.Literal("resume") }),
  Schema.Struct({ kind: Schema.Literal("power-source"), onBattery: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("screen"), locked: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("user"), active: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("shutdown") }),
  Schema.Struct({ kind: Schema.Literal("thermal"), state: ThermalState }),
  Schema.Struct({ kind: Schema.Literal("speed-limit"), limit: Schema.Number }),
]);
export type Event = typeof Event.Type;

export const State = Schema.Struct({
  onBattery: Schema.Boolean,
  idleSeconds: Schema.Number,
  idleState: IdleState,
  thermal: ThermalState,
});
export type State = typeof State.Type;

export const protocol = RpcGroup.make(
  Rpc.make("state", {
    payload: { idleThresholdSeconds: IdleThreshold },
    success: State,
    error: SewedError,
  }),
  Rpc.make("events", { success: Event, stream: true, error: SewedError }),
);

/**
 * The whole power surface as one capability: `PowerMonitor.native` in `sewed/main` provides it,
 * `Capability.client` reaches it from a document, and `Testing.PowerMonitor.memory` stands in for
 * tests. The surface carries no policy; the idle threshold is checked on every call.
 */
export const capability = Capability.define("power-monitor", protocol);
