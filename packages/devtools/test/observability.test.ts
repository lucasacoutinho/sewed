import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Option, Stream } from "effect";
import { Diagnostics } from "sewed";
import * as Testing from "sewed/testing";

test("forwarded running spans include ownership before their stream ends", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const collector = yield* Diagnostics.make({ tracing: true });
        yield* Diagnostics.instrument(
          Effect.gen(function* () {
            const snapshot = yield* collector.snapshot;
            const span = snapshot.events
              .map(({ event }) => event)
              .findLast((event) => event._tag === "TraceSpan");
            assert.ok(span && span._tag === "TraceSpan");
            assert.equal(span.outcome, "running");
            assert.equal(span.ownerId, "worker-resource");
            assert.equal(span.binding, "reader");
          }).pipe(
            Effect.withSpan("RpcClient.read", {
              attributes: { "sewed.owner.id": "worker-resource", "sewed.binding": "reader" },
            }),
          ),
        ).pipe(Effect.provide(collector.layer));
      }),
    ),
  );
});

test(
  "instrument emits bounded spans and a scoped timer-lateness sample",
  { timeout: 5000 },
  async () => {
    const [inside, after] = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const collector = yield* Diagnostics.make({ capacity: 32, tracing: true });
          let inside: Diagnostics.Snapshot;
          yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Diagnostics.instrument(
                Effect.gen(function* () {
                  const span = yield* Effect.currentSpan;
                  span.event("checkpoint", 2n, { private: "omitted" });
                }).pipe(Effect.withSpan("observed operation")),
              );
              yield* Diagnostics.runtimeHealth({ intervalMs: 5 });
              yield* collector.changes.pipe(
                Stream.filter(({ event }) => event._tag === "RuntimeSample"),
                Stream.runHead,
                Effect.map(Option.getOrThrow),
                Effect.timeout(1000),
              );
              inside = yield* collector.snapshot;
            }).pipe(Effect.provide([collector.layer, Testing.main])),
          );
          yield* Effect.sleep(20);
          const after = yield* collector.snapshot;
          return [inside!, after] as const;
        }),
      ),
    );
    const observations = inside.events.map(({ event }) => event);
    assert.ok(
      observations.some(
        (event) => event._tag === "TraceSpan" && event.name === "observed operation",
      ),
    );
    assert.ok(
      observations.some((event) => event._tag === "TraceEvent" && event.name === "checkpoint"),
    );
    const samplesInside = observations.filter((event) => event._tag === "RuntimeSample").length;
    assert.ok(samplesInside > 0);
    assert.equal(
      after.events.filter(({ event }) => event._tag === "RuntimeSample").length,
      samplesInside,
    );
    assert.equal(JSON.stringify(inside).includes("private"), false);
  },
);
