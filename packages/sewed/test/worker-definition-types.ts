import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding } from "../lib/index.js";
import * as Worker from "../lib/WorkerApi.js";

export const Protocol = RpcGroup.make(
  Rpc.make("count", { payload: { n: Schema.Number }, success: Schema.Number }),
);
export const Dependency = Binding.slot("dependency", Protocol);

export default Worker.define(
  Protocol,
  (implement) =>
    implement(
      Effect.gen(function* () {
        const dependency = yield* Dependency();
        return { count: ({ n }) => dependency.count({ n }).pipe(Effect.orDie) };
      }),
    ),
  { bindings: [Dependency] },
);
