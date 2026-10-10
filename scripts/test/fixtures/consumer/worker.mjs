import { Effect } from "effect";
import * as Worker from "sewed/worker";
import { Protocol } from "./protocol.mjs";

export default Worker.define(Protocol, (implement) =>
  implement(Effect.succeed({ thread: () => Worker.threadId })),
);
