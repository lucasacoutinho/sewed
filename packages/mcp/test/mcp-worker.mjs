import { isMainThread, threadId } from "node:worker_threads";
import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Worker from "sewed/worker";

export const MathWorkerProtocol = RpcGroup.make(
  Rpc.make("where", {
    success: Schema.Struct({
      isMainThread: Schema.Boolean,
      threadId: Schema.Int,
    }),
  }),
  Rpc.make("add", {
    payload: Schema.Struct({ a: Schema.Finite, b: Schema.Finite }),
    success: Schema.Struct({ sum: Schema.Finite }),
  }),
);

export default Worker.define(MathWorkerProtocol, (implement) =>
  implement({
    where: () => Effect.succeed({ isMainThread, threadId }),
    add: ({ a, b }) => Effect.succeed({ sum: a + b }),
  }),
);
