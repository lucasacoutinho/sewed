import { Effect } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Worker from "sewed/worker";

export const CrashProtocol = RpcGroup.make(Rpc.make("crash"));
export default Worker.define(CrashProtocol, (implement) =>
  implement({
    crash: () =>
      Effect.sync(() => {
        setTimeout(() => {
          throw new Error("Injected post-startup worker failure");
        }, 20);
      }),
  }),
);
