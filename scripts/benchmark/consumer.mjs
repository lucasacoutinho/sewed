import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { threadId } from "node:worker_threads";
import { Effect, Stream } from "effect";
import { Binding, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import {
  binaryProtocol,
  binarySlot,
  configuration,
  jsonProtocol,
  jsonSlot,
  payloads,
  smallItems,
  splitItems,
} from "./protocol.mjs";

/** @typedef {Binding.Client<import("effect/rpc/RpcGroup").Rpcs<typeof jsonProtocol>>} Client */

/** @param {number} count */
const repeatPayloads = (count) =>
  Array.from({ length: count }, (_, index) => {
    const payload = payloads[index % payloads.length];
    assert.ok(payload !== undefined);
    return payload;
  });
const sequentialPayloads = repeatPayloads(configuration.sequentialCalls);
const parallelPayloads = repeatPayloads(configuration.parallelCalls);
const smallExpected = Array.from({ length: configuration.smallStreamCalls }, () => smallItems);
const splitExpected = Array.from({ length: configuration.splitStreamCalls }, () => splitItems);

/**
 * @template A, E, R
 * @param {Effect.Effect<A, E, R>} program
 * @param {(result: A) => void} validate
 */
const timed = (program, validate) =>
  Effect.gen(function* () {
    const start = performance.now();
    const result = yield* program;
    const elapsed = performance.now() - start;
    validate(result);
    return elapsed;
  });

/** @param {Client} client @param {string} encoding */
const casesFor = (client, encoding) => [
  {
    name: `${encoding}_sequential_ms`,
    run: timed(
      Effect.gen(function* () {
        /** @type {Array<Effect.Success<ReturnType<Client["echo"]>>>} */
        const results = [];
        for (const payload of sequentialPayloads) {
          results.push(yield* client.echo(payload));
        }
        return results;
      }),
      (results) => assert.deepEqual(results, sequentialPayloads),
    ),
  },
  {
    name: `${encoding}_parallel_ms`,
    run: timed(
      Effect.forEach(parallelPayloads, (payload) => client.echo(payload), {
        concurrency: configuration.concurrency,
      }),
      (results) => assert.deepEqual(results, parallelPayloads),
    ),
  },
  {
    name: `${encoding}_stream_small_ms`,
    run: timed(
      Effect.forEach(smallExpected, () => client.small().pipe(Stream.runCollect)),
      (results) => assert.deepEqual(results, smallExpected),
    ),
  },
  {
    name: `${encoding}_stream_split_ms`,
    run: timed(
      Effect.forEach(splitExpected, () => client.split().pipe(Stream.runCollect)),
      (results) => assert.deepEqual(results, splitExpected),
    ),
  },
];

/** @param {readonly number[]} values */
const median = (values) => {
  const value = values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
  assert.ok(value !== undefined);
  return value;
};

const result = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const jsonOwner = yield* Testing.Worker.spawn(
        Testing.Worker.entry(new URL("./worker-json.mjs", import.meta.url), jsonProtocol),
      );
      const binaryOwner = yield* Testing.Worker.spawn(
        Testing.Worker.entry(new URL("./worker-binary.mjs", import.meta.url), binaryProtocol),
      );
      const measurements = yield* Effect.gen(function* () {
        const json = yield* Binding.deferred(jsonSlot);
        const binary = yield* Binding.deferred(binarySlot);
        const jsonInfo = yield* json.info();
        const binaryInfo = yield* binary.info();
        assert.ok(jsonInfo.thread > 0 && binaryInfo.thread > 0);
        assert.notEqual(jsonInfo.thread, threadId);
        assert.notEqual(binaryInfo.thread, threadId);
        assert.notEqual(jsonInfo.thread, binaryInfo.thread);
        for (const client of [json, binary]) {
          const error = yield* client.reject().pipe(Effect.flip);
          assert.ok(error instanceof SewedError);
          assert.equal(error.code, "Protocol");
          assert.equal(error.reason, "benchmark/expected");
        }

        const cases = [...casesFor(json, "json"), ...casesFor(binary, "binary")];
        for (let round = 0; round < configuration.warmups; round++) {
          for (const entry of cases) yield* entry.run;
        }
        /** @type {Map<string, number[]>} */
        const samples = new Map(cases.map(({ name }) => [name, []]));
        const totals = [];
        for (let round = 0; round < configuration.samples; round++) {
          let total = 0;
          for (let offset = 0; offset < cases.length; offset++) {
            const entry = cases[(round + offset) % cases.length];
            assert.ok(entry !== undefined);
            const elapsed = yield* entry.run;
            const values = samples.get(entry.name);
            assert.ok(values !== undefined);
            values.push(elapsed);
            total += elapsed;
          }
          totals.push(total);
        }
        return { totals, samples };
      }).pipe(
        Effect.provide(
          Binding.layer([Binding.to(jsonSlot, jsonOwner), Binding.to(binarySlot, binaryOwner)]),
        ),
      );
      yield* jsonOwner.shutdown;
      yield* binaryOwner.shutdown;
      assert.equal(yield* jsonOwner.awaitExit, 0);
      assert.equal(yield* binaryOwner.awaitExit, 0);
      return measurements;
    }).pipe(Effect.provide(Testing.main)),
  ).pipe(Effect.timeout("120 seconds")),
);

const workload = median(result.totals);
const metrics = [
  ["rpc_workload_ms", workload],
  ...Array.from(result.samples, ([name, values]) => [name, median(values)]),
  [
    "rpc_workload_mad_pct",
    (median(result.totals.map((value) => Math.abs(value - workload))) / workload) * 100,
  ],
];
console.log(`BENCHMARK ${JSON.stringify({ node: process.version, ...configuration })}`);
for (const [name, value] of metrics) {
  assert.ok(typeof value === "number" && Number.isFinite(value) && value >= 0);
  console.log(`METRIC ${name}=${value.toFixed(3)}`);
}
