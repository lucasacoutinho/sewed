import { Effect, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, SewedError } from "sewed";
import * as Worker from "sewed/worker";

export const configuration = Object.freeze({
  warmups: 2,
  samples: 7,
  sequentialCalls: 2048,
  parallelCalls: 4096,
  concurrency: 16,
  smallStreamCalls: 8,
  smallStreamItems: 1024,
  splitStreamCalls: 4,
  splitStreamItems: 256,
});

const Record = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  labels: Schema.Array(Schema.String),
  point: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
});
const Item = Schema.Struct({ index: Schema.Int, text: Schema.String });
export const jsonProtocol = RpcGroup.make(
  Rpc.make("info", { success: Schema.Struct({ thread: Schema.Int }), error: SewedError }),
  Rpc.make("echo", { payload: Record, success: Record, error: SewedError }),
  Rpc.make("reject", { error: SewedError }),
  Rpc.make("small", { success: Item, error: SewedError, stream: true }),
  Rpc.make("split", { success: Item, error: SewedError, stream: true }),
);
export const binaryProtocol = Binary.protocol(jsonProtocol);
export const jsonSlot = Binding.slot("benchmark-json", jsonProtocol);
export const binarySlot = Binding.slot("benchmark-binary", binaryProtocol);

export const payloads = Array.from({ length: 256 }, (_, id) => ({
  id,
  name: `record-${id}:"\\\n\u{10437}`,
  labels: ["sewed", "benchmark", `bucket-${id % 16}`],
  point: { x: id / 4, y: -(id + 1) / 2 },
}));
export const smallItems = Array.from({ length: configuration.smallStreamItems }, (_, index) => ({
  index,
  text: '\u{10437}"\\\n'.repeat(8),
}));
const splitText = '\u{10437}"\\\n'.repeat(1024);
export const splitItems = Array.from({ length: configuration.splitStreamItems }, (_, index) => ({
  index,
  text: splitText,
}));

export const handlers = jsonProtocol.toLayer({
  info: () => Effect.map(Worker.threadId, (thread) => ({ thread })),
  echo: (payload) => Effect.succeed(payload),
  reject: () =>
    Effect.fail(
      new SewedError({
        code: "Protocol",
        message: "Expected benchmark failure",
        reason: "benchmark/expected",
      }),
    ),
  small: () => Stream.fromArray(smallItems),
  split: () => Stream.fromArray(splitItems),
});
