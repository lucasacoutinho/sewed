import assert from "node:assert/strict";
import { test } from "node:test";
import { threadId as mainThreadId } from "node:worker_threads";
import { Effect, Fiber, Schedule, Scope, Stream } from "effect";
import { Binding, MainContext, SewedError } from "../lib/index.js";
import { host } from "../lib/Host.js";
import * as Worker from "../lib/WorkerHost.js";
import { mainIdentity } from "../lib/RuntimeContext.js";
import { Protocol, Rejected } from "./protocol.mjs";

const Dependency = Binding.slot("dependency", Protocol);
const Main = Binding.slot("main", Protocol);
const Consumer = Binding.slot("consumer", Protocol);
const Extra = Binding.slot("extra", Protocol);
const Replacement = Binding.slot("replacement", Protocol);

const dependencyEntry = Worker.entry(new URL("./worker.mjs", import.meta.url), Protocol);
const consumerEntry = Worker.entry(new URL("./dependency-consumer.mjs", import.meta.url), Protocol);
const startingEntry = Worker.entry(new URL("./dependency-starting.mjs", import.meta.url), Protocol);
const duplicateEntry = Worker.entry(
  new URL("./dependency-duplicate.mjs", import.meta.url),
  Protocol,
);

const run = <A, E>(program: Effect.Effect<A, E, MainContext | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(program).pipe(Effect.provideService(MainContext, mainIdentity)));

const mainHandlers = Protocol.toLayer({
  info: () => Effect.sync(() => ({ thread: mainThreadId, alive: true, active: 0, released: 0 })),
  wait: ({ milliseconds }) => Effect.sleep(milliseconds).pipe(Effect.as("done")),
  reject: () => Effect.fail(new Rejected({ message: "typed failure" })),
  echo: ({ value }) => Effect.succeed(`main:${value}`),
  events: () => Stream.iterate(0, (value) => value + 1).pipe(Stream.schedule(Schedule.spaced(10))),
});

const assertStartupFailure = async (
  program: Effect.Effect<unknown, unknown, MainContext | Scope.Scope>,
  expected: { readonly code: "Protocol" | "Startup"; readonly text: string },
) =>
  assert.rejects(
    () => run(program),
    (error: unknown) => {
      assert.ok(error instanceof SewedError);
      assert.equal(error.code, expected.code);
      assert.match(`${error.message}\n${String(error.cause)}`, new RegExp(expected.text));
      return true;
    },
  );

test(
  "worker binding dependencies form a two-worker chain and retain main placement, errors, and streams",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);
        const main = yield* host(Protocol, mainHandlers);
        const consumer = yield* Worker.spawn(consumerEntry, {
          bindings: [Binding.to(Dependency, dependency), Binding.to(Main, main)],
        });

        yield* Effect.gen(function* () {
          const dependencyClient = yield* Dependency();
          const consumerClient = yield* Consumer();
          const dependencyInfo = yield* dependencyClient.info({});
          const consumerInfo = yield* consumerClient.info({});
          assert.ok(dependencyInfo.thread > 0);
          assert.ok(consumerInfo.thread > 0);
          assert.notEqual(dependencyInfo.thread, consumerInfo.thread);
          assert.equal(dependencyInfo.alive, true);
          assert.equal(consumerInfo.alive, true);
          assert.equal(
            yield* consumerClient.echo({ value: "through-main" }),
            `${consumerInfo.thread}:${dependencyInfo.thread}:${mainThreadId}:main:through-main`,
          );

          const error = yield* consumerClient.reject().pipe(Effect.flip);
          assert.equal(error.message, "typed failure");
          const values = yield* consumerClient.events({}).pipe(Stream.take(3), Stream.runCollect);
          assert.deepEqual(values, [0, 1, 2]);
        }).pipe(
          Effect.provide(
            Binding.layer([Binding.to(Dependency, dependency), Binding.to(Consumer, consumer)]),
          ),
        );
      }),
    );
  },
);

test(
  "outer cancellation releases a dependency request while both owners remain usable",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);
        const main = yield* host(Protocol, mainHandlers);
        const consumer = yield* Worker.spawn(consumerEntry, {
          bindings: [Binding.to(Dependency, dependency), Binding.to(Main, main)],
        });

        yield* Effect.gen(function* () {
          const dependencyClient = yield* Dependency();
          const consumerClient = yield* Consumer();
          const pending = yield* consumerClient
            .wait({ milliseconds: 10000 })
            .pipe(Effect.forkScoped);
          let active = 0;
          for (let i = 0; i < 100 && active === 0; i++) {
            active = (yield* dependencyClient.info({})).active;
            if (active === 0) yield* Effect.sleep(10);
          }
          assert.equal(active, 1);

          yield* Fiber.interrupt(pending);
          let info = yield* dependencyClient.info({});
          for (let i = 0; i < 100 && info.released === 0; i++) {
            yield* Effect.sleep(10);
            info = yield* dependencyClient.info({});
          }
          assert.equal(info.active, 0);
          assert.equal(info.released, 1);
          assert.equal(info.alive, true);
          assert.equal(yield* dependencyClient.echo({ value: "dependency" }), "dependency");
          assert.match(
            yield* consumerClient.echo({ value: "consumer" }),
            new RegExp(`^\\d+:\\d+:${mainThreadId}:main:consumer$`),
          );
        }).pipe(
          Effect.provide(
            Binding.layer([Binding.to(Dependency, dependency), Binding.to(Consumer, consumer)]),
          ),
        );
      }),
    );
  },
);

test(
  "consumer termination releases active downstream requests and leaves the dependency usable",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);
        const main = yield* host(Protocol, mainHandlers);
        const consumer = yield* Worker.spawn(consumerEntry, {
          bindings: [Binding.to(Dependency, dependency), Binding.to(Main, main)],
        });

        yield* Effect.gen(function* () {
          const dependencyClient = yield* Dependency();
          const consumerClient = yield* Consumer();
          const pending = yield* consumerClient
            .wait({ milliseconds: 10000 })
            .pipe(Effect.forkScoped);
          let active = 0;
          for (let i = 0; i < 100 && active === 0; i++) {
            active = (yield* dependencyClient.info({})).active;
            if (active === 0) yield* Effect.sleep(10);
          }
          assert.equal(active, 1);

          yield* consumer.terminate;
          assert.equal((yield* Fiber.await(pending))._tag, "Failure");
          assert.equal((yield* Effect.exit(consumerClient.info({})))._tag, "Failure");

          let info = yield* dependencyClient.info({});
          for (let i = 0; i < 100 && info.released === 0; i++) {
            yield* Effect.sleep(10);
            info = yield* dependencyClient.info({});
          }
          assert.equal(info.active, 0);
          assert.equal(info.released, 1);
          assert.equal(info.alive, true);
          assert.equal(yield* dependencyClient.echo({ value: "still usable" }), "still usable");
        }).pipe(
          Effect.provide(
            Binding.layer([Binding.to(Dependency, dependency), Binding.to(Consumer, consumer)]),
          ),
        );
      }),
    );
  },
);

test(
  "interrupting startup releases a downstream request before the worker becomes ready",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);

        yield* Effect.gen(function* () {
          const dependencyClient = yield* Dependency();
          const starting = yield* Worker.spawn(startingEntry, {
            bindings: [Binding.to(Dependency, dependency)],
          }).pipe(Effect.forkScoped);
          let active = 0;
          for (let i = 0; i < 100 && active === 0; i++) {
            active = (yield* dependencyClient.info({})).active;
            if (active === 0) yield* Effect.sleep(10);
          }
          assert.equal(active, 1);

          yield* Fiber.interrupt(starting);
          let info = yield* dependencyClient.info({});
          for (let i = 0; i < 100 && info.released === 0; i++) {
            yield* Effect.sleep(10);
            info = yield* dependencyClient.info({});
          }
          assert.equal(info.active, 0);
          assert.equal(info.released, 1);
          assert.equal(info.alive, true);
          assert.equal(yield* dependencyClient.echo({ value: "after startup" }), "after startup");
        }).pipe(Effect.provide(Binding.layer([Binding.to(Dependency, dependency)])));
      }),
    );
  },
);

test(
  "cooperative consumer shutdown can use its dependency before the bridge closes",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);
        const main = yield* host(Protocol, mainHandlers);
        const consumer = yield* Worker.spawn(consumerEntry, {
          bindings: [Binding.to(Dependency, dependency), Binding.to(Main, main)],
        });

        yield* Effect.gen(function* () {
          const dependencyClient = yield* Dependency();
          const consumerClient = yield* Consumer();

          yield* consumer.shutdown;
          assert.equal(yield* consumer.awaitExit, 0);
          assert.equal((yield* Effect.exit(consumerClient.info({})))._tag, "Failure");

          let info = yield* dependencyClient.info({});
          for (let i = 0; i < 100 && info.released === 0; i++) {
            yield* Effect.sleep(10);
            info = yield* dependencyClient.info({});
          }
          assert.equal(info.active, 0);
          assert.equal(info.released, 1);
          assert.equal(info.alive, true);
          assert.equal(yield* dependencyClient.echo({ value: "after shutdown" }), "after shutdown");
        }).pipe(
          Effect.provide(
            Binding.layer([Binding.to(Dependency, dependency), Binding.to(Consumer, consumer)]),
          ),
        );
      }),
    );
  },
);

test(
  "dependency termination rejects active and later calls without replacing its owner",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);
        const main = yield* host(Protocol, mainHandlers);
        const consumer = yield* Worker.spawn(consumerEntry, {
          bindings: [Binding.to(Dependency, dependency), Binding.to(Main, main)],
        });

        yield* Effect.gen(function* () {
          const dependencyClient = yield* Dependency();
          const consumerClient = yield* Consumer();
          const pending = yield* consumerClient
            .wait({ milliseconds: 10000 })
            .pipe(Effect.forkScoped);
          let active = 0;
          for (let i = 0; i < 100 && active === 0; i++) {
            active = (yield* dependencyClient.info({})).active;
            if (active === 0) yield* Effect.sleep(10);
          }
          assert.equal(active, 1);

          yield* dependency.terminate;
          assert.equal((yield* Fiber.await(pending))._tag, "Failure");
          assert.equal((yield* Effect.exit(dependencyClient.info({})))._tag, "Failure");

          const replacement = yield* Worker.spawn(dependencyEntry);
          yield* Effect.gen(function* () {
            const replacementClient = yield* Replacement();
            assert.equal(yield* replacementClient.echo({ value: "replacement" }), "replacement");
          }).pipe(Effect.provide(Binding.layer([Binding.to(Replacement, replacement)])));
          assert.equal(
            (yield* Effect.exit(consumerClient.wait({ milliseconds: 1 })))._tag,
            "Failure",
          );
          assert.match(
            yield* consumerClient.echo({ value: "main-still-works" }),
            new RegExp(`^\\d+:\\d+:${mainThreadId}:main:main-still-works$`),
          );
        }).pipe(
          Effect.provide(
            Binding.layer([Binding.to(Dependency, dependency), Binding.to(Consumer, consumer)]),
          ),
        );
      }),
    );
  },
);

test(
  "worker binding declarations reject bounded startup mismatches",
  { timeout: 15000 },
  async () => {
    await assertStartupFailure(
      Effect.gen(function* () {
        yield* Worker.spawn(consumerEntry);
      }),
      { code: "Startup", text: "Missing bindings: sewed/binding/dependency" },
    );

    await assertStartupFailure(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);
        yield* Worker.spawn(dependencyEntry, {
          bindings: [Binding.to(Extra, dependency)],
        });
      }),
      { code: "Startup", text: "Unexpected bindings: sewed/binding/extra" },
    );

    await assertStartupFailure(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);
        const main = yield* host(Protocol, mainHandlers);
        yield* Worker.spawn(consumerEntry, {
          bindings: [
            Binding.to(Dependency, dependency),
            Binding.to(Dependency, dependency),
            Binding.to(Main, main),
          ],
        });
      }),
      { code: "Protocol", text: "Duplicate binding sewed/binding/dependency" },
    );

    await assertStartupFailure(
      Effect.gen(function* () {
        const dependency = yield* Worker.spawn(dependencyEntry);
        yield* Worker.spawn(duplicateEntry, {
          bindings: [Binding.to(Dependency, dependency)],
        });
      }),
      { code: "Startup", text: "Duplicate declarations: sewed/binding/dependency" },
    );
  },
);
