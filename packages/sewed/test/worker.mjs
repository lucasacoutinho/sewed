import { Effect, Schedule, Stream } from "effect";
import * as Worker from "../lib/WorkerApi.js";
import { Protocol, Rejected } from "./protocol.mjs";

let alive = false;
let active = 0;
let released = 0;
export default Worker.define(Protocol, (implement) =>
  implement(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          alive = true;
        }),
        () =>
          Effect.sync(() => {
            alive = false;
          }),
      );
      return {
        info: () => Effect.map(Worker.threadId, (thread) => ({ thread, alive, active, released })),
        wait: ({ milliseconds }) =>
          Effect.acquireUseRelease(
            Effect.sync(() => {
              active++;
            }),
            () => Effect.sleep(milliseconds).pipe(Effect.as("done")),
            () =>
              Effect.sync(() => {
                active--;
                released++;
              }),
          ),
        reject: () => Effect.fail(new Rejected({ message: "typed failure" })),
        echo: ({ value }) => Effect.succeed(value),
        events: () =>
          Stream.iterate(0, (value) => value + 1).pipe(Stream.schedule(Schedule.spaced(10))),
      };
    }),
  ),
);
