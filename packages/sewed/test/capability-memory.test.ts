import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Effect, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Capability from "../src/Capability.ts";
import * as CapabilityMemory from "../src/internal/CapabilityMemory.ts";

const Protocol = RpcGroup.make(
  Rpc.make("increment", { payload: { by: Schema.Number }, success: Schema.Number }),
  Rpc.make("ticks", { success: Schema.Number, stream: true }),
);

const Counter = Capability.define("capability-memory-counter", Protocol);

const handlers = Protocol.toLayer({
  increment: ({ by }) => Effect.succeed(by),
  ticks: () => Stream.make(1, 2, 3),
});

const withRecorder = <A, E>(
  body: (counter: (typeof Counter)["Service"]) => Effect.Effect<A, E, never>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const counter = yield* Counter;
        const value = yield* body(counter);
        const recorder = yield* CapabilityMemory.Recorder;
        return { value, calls: yield* recorder.calls };
      }).pipe(Effect.provide(CapabilityMemory.memory(Counter, handlers))),
    ),
  );

describe("CapabilityMemory recorder", () => {
  // Every surface's memory test builds and runs a call in the same expression
  // (`yield* shell.openExternal(...)`); this behavior change must leave that shape unaffected.
  it("records a call that is built and run together, as every other test does", async () => {
    const result = await withRecorder((counter) => counter.increment({ by: 5 }));
    assert.equal(result.value, 5);
    assert.deepEqual(result.calls, [{ tag: "increment", payload: { by: 5 } }]);
  });

  it("does not record an effect call that was built but never run", async () => {
    const result = await withRecorder((counter) =>
      Effect.sync(() => {
        counter.increment({ by: 1 });
      }),
    );
    assert.deepEqual(result.calls, []);
  });

  it("records an effect call once for each time a built call is run", async () => {
    const result = await withRecorder((counter) =>
      Effect.gen(function* () {
        const call = counter.increment({ by: 2 });
        assert.equal(yield* call, 2);
        assert.equal(yield* call, 2);
      }),
    );
    assert.deepEqual(result.calls, [
      { tag: "increment", payload: { by: 2 } },
      { tag: "increment", payload: { by: 2 } },
    ]);
  });

  it("does not record a stream call that was built but never run", async () => {
    const result = await withRecorder((counter) =>
      Effect.sync(() => {
        counter.ticks();
      }),
    );
    assert.deepEqual(result.calls, []);
  });

  it("records a stream call once for each time a built call is run", async () => {
    const result = await withRecorder((counter) =>
      Effect.gen(function* () {
        const stream = counter.ticks();
        assert.deepEqual([...(yield* Stream.runCollect(stream))], [1, 2, 3]);
        assert.deepEqual([...(yield* Stream.runCollect(stream))], [1, 2, 3]);
      }),
    );
    assert.deepEqual(result.calls, [
      { tag: "ticks", payload: undefined },
      { tag: "ticks", payload: undefined },
    ]);
  });
});
