import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, SewedError } from "sewed";

export const configuration = Object.freeze({
  warmups: 2,
  samples: 7,
  nativeCalls: 10000,
  smallCalls: 512,
  largeCalls: 128,
  payloadBytes: [1024, 65536],
  idleBindings: [0, 32],
});

export const Payload = Schema.Struct({ sequence: Schema.Int, value: Schema.String });
export const RawRequest = Schema.Struct({ id: Schema.Int, payload: Payload });
export const RawReply = Schema.Struct({ id: Schema.Int, value: Payload });
export const Measurement = Schema.Struct({
  path: Schema.Literals(["electron", "json", "binary"]),
  bytes: Schema.Int,
  idleBindings: Schema.Int,
  iterations: Schema.Int,
  samples: Schema.Array(Schema.Number),
  baselines: Schema.Array(Schema.Number),
});
export const Report = Schema.Union([
  Schema.Struct({
    success: Schema.Literal(true),
    rows: Schema.Array(Measurement),
    typedFailures: Schema.Literal(true),
  }),
  Schema.Struct({ success: Schema.Literal(false), error: Schema.String }),
]);
export const protocol = RpcGroup.make(
  Rpc.make("echo", { payload: Payload, success: Payload, error: SewedError }),
  Rpc.make("ready", { error: SewedError }),
  Rpc.make("begin", { error: SewedError }),
  Rpc.make("report", { payload: Report, error: SewedError }),
  Rpc.make("reject", { error: SewedError }),
);
export const binaryProtocol = Binary.protocol(protocol);
export const jsonSlot = Binding.slot("benchmark/electron-json", protocol);
export const binarySlot = Binding.slot("benchmark/electron-binary", binaryProtocol);
export const idleSlots = Array.from({ length: 32 }, (_, index) =>
  Binding.slot(`benchmark/electron-idle-${index}`, protocol),
);
export const slots = [jsonSlot, binarySlot, ...idleSlots];

/** @param {readonly number[]} values */
export const median = (values) => {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0))
    throw new Error("Missing or invalid benchmark samples");
  const value = values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
  if (value === undefined) throw new Error("Missing benchmark median");
  return value;
};

/** @param {readonly number[]} values */
export const madPct = (values) => {
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center)).toSorted((a, b) => a - b);
  const deviation = deviations[Math.floor(deviations.length / 2)];
  if (deviation === undefined) throw new Error("Missing benchmark deviation");
  return (deviation * 100) / center;
};
