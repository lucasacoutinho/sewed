import { Stream } from "effect";
import * as Worker from "sewed/worker";
import { ClockProtocol } from "../shared/contracts.js";

export default Worker.define(ClockProtocol, (implement) =>
  implement({
    thread: () => Worker.threadId,
    ticks: () => Stream.tick(250).pipe(Stream.scan(0, (count) => count + 1)),
  }),
);
