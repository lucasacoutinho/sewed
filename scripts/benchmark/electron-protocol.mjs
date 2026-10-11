import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, SewedError } from "sewed";

export const Payload = Schema.Struct({ sequence: Schema.Int, value: Schema.String });
export const protocol = RpcGroup.make(
  Rpc.make("echo", { payload: Payload, success: Payload, error: SewedError }),
  Rpc.make("ready", { error: SewedError }),
  Rpc.make("begin", { error: SewedError }),
  Rpc.make("report", { payload: Schema.Unknown, error: SewedError }),
  Rpc.make("reject", { error: SewedError }),
);
export const binaryProtocol = Binary.protocol(protocol);
export const jsonSlot = Binding.slot("benchmark/electron-json", protocol);
export const binarySlot = Binding.slot("benchmark/electron-binary", binaryProtocol);
export const idleSlots = Array.from({ length: 32 }, (_, index) =>
  Binding.slot(`benchmark/electron-idle-${index}`, protocol),
);
export const slots = [jsonSlot, binarySlot, ...idleSlots];
export const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
