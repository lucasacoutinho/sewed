import assert from "node:assert/strict";
import { Context, Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Capability, Decision, Diagnostics, Navigation } from "sewed";

const measure = async (name: string, run: () => void | Promise<void>) => {
  const samples: number[] = [];
  for (let round = 0; round < 9; round++) {
    const start = performance.now();
    await run();
    if (round >= 2) samples.push(performance.now() - start);
  }
  const median = samples.toSorted((a, b) => a - b)[3];
  assert.ok(median !== undefined);
  console.log(`METRIC ${name}_ms=${median.toFixed(3)}`);
};

const Factor = Context.Service<"benchmark/factor", number>("benchmark/factor");
const protocol = RpcGroup.make(
  Rpc.make("scale", { payload: { value: Schema.Int }, success: Schema.Int }),
);
const Calculator = Capability.define("benchmark/calculator", protocol);
const handlers = protocol
  .toLayer({
    scale: ({ value }) => Effect.map(Factor, (factor) => factor * value),
  })
  .pipe(Layer.provide(Layer.succeed(Factor, 2)));
const iterations = 100_000;
const calls = Effect.gen(function* () {
  const calculator = yield* Calculator;
  let sum = 0;
  for (let i = 0; i < iterations; i++) sum += yield* calculator.scale({ value: i });
  assert.equal(sum, iterations * (iterations - 1));
}).pipe(Effect.provide(Capability.fromHandlers(Calculator, handlers)));
await measure("local_capability", () => Effect.runPromise(calls));

for (const count of [1, 8, 32]) {
  const documents = Array.from({ length: count }, (_, index) => ({
    kind: "document" as const,
    url: `https://desktop.example/app/${index}?view=main`,
  }));
  const policy = Decision.policy(Navigation.Policy, documents);
  const requests = documents.flatMap(({ url }) => [
    { url: url + "#panel" },
    { url: url + "%23other" },
    { url },
    { url: url + "&private" },
  ]);
  await measure(`navigation_${count}_documents`, () => {
    let allowed = 0;
    for (let i = 0; i < iterations; i++) {
      if (policy.decide(requests[i % requests.length]!) === "allow") allowed++;
    }
    assert.equal(allowed, iterations / 2);
  });
}

const eventCount = 30_000;
for (const capacity of [256, 8192]) {
  const trace = Effect.scoped(
    Effect.gen(function* () {
      const collector = yield* Diagnostics.make({ capacity, tracing: true });
      yield* Diagnostics.instrument(
        Effect.gen(function* () {
          const span = yield* Effect.currentSpan;
          for (let i = 0; i < eventCount; i++) span.event("progress", BigInt(i), {});
        }).pipe(Effect.withSpan("transfer")),
      ).pipe(Effect.provide(collector.layer));
      const { events, complete } = yield* collector.snapshot;
      assert.equal(complete, true);
      assert.equal(events.length, capacity);
      const first = events[0]?.event;
      const last = events.at(-1)?.event;
      assert.ok(first?._tag === "TraceEvent" && first.time === String(eventCount - capacity + 1));
      assert.ok(last?._tag === "TraceSpan" && last.outcome === "success");
    }),
  );
  await measure(`trace_events_capacity_${capacity}`, () => Effect.runPromise(trace));
}
