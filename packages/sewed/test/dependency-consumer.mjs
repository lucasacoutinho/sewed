import { Effect } from "effect";
import { Binding } from "../lib/index.js";
import * as Worker from "../lib/WorkerApi.js";
import { Protocol } from "./protocol.mjs";

const Dependency = Binding.slot("dependency", Protocol);
const Main = Binding.slot("main", Protocol);

export default Worker.define(
  Protocol,
  (implement) =>
    implement(
      Effect.gen(function* () {
        const thread = yield* Worker.threadId;
        const dependency = yield* Dependency();
        const main = yield* Main();
        const dependencyAtStartup = yield* dependency.info();
        yield* Effect.addFinalizer(() =>
          dependency.wait({ milliseconds: 0 }).pipe(Effect.asVoid, Effect.ignore),
        );

        return {
          info: () => Effect.succeed({ thread, alive: true, active: 0, released: 0 }),
          wait: (input) => dependency.wait(input),
          echo: ({ value }) =>
            Effect.gen(function* () {
              const mainInfo = yield* main.info();
              const result = yield* main.echo({ value });
              return `${thread}:${dependencyAtStartup.thread}:${mainInfo.thread}:${result}`;
            }),
          reject: () => dependency.reject(),
          events: () => dependency.events(),
        };
      }),
    ),
  { bindings: [Dependency, Main] },
);
