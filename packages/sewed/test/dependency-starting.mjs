import { Effect } from "effect";
import { Binding } from "../lib/index.js";
import * as Worker from "../lib/WorkerApi.js";
import { Protocol } from "./protocol.mjs";

const Dependency = Binding.slot("dependency", Protocol);

export default Worker.define(
  Protocol,
  (implement) =>
    implement(
      Effect.gen(function* () {
        const dependency = yield* Dependency();
        yield* dependency.wait({ milliseconds: 10000 });
        return {
          info: () => Effect.succeed({ thread: 1, alive: true, active: 0, released: 0 }),
          wait: () => Effect.succeed("done"),
          echo: ({ value }) => Effect.succeed(value),
          reject: () => Effect.die("unused"),
          events: () => Effect.die("unused"),
        };
      }),
    ),
  { bindings: [Dependency] },
);
