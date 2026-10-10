import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Deferred, Effect, Fiber, Schema, Stream, Tracer } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding, Diagnostics, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import { Protocol as WorkerProtocol } from "./protocol.mjs";
import { CrashProtocol } from "./diagnostic-crash.mjs";

class Rejected extends Schema.TaggedError<Rejected>()("DiagnosticRejected", {
  message: Schema.String,
}) {}
const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { secret: Schema.String }, success: Schema.String }),
  Rpc.make("reject", { error: Rejected }),
  Rpc.make("events", { success: Schema.Number, stream: true }),
);
const Service = Binding.slot("diagnostics/service", Protocol);

test(
  "an injected failure after worker startup is reported as an exit",
  { timeout: 10000 },
  async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const diagnostics = yield* Diagnostics.make();
          const Crash = Binding.slot("diagnostics/crash", CrashProtocol);
          yield* Effect.scoped(
            Effect.gen(function* () {
              const worker = yield* Testing.Worker.spawn(
                Testing.Worker.entry(
                  new URL("./diagnostic-crash.mjs", import.meta.url),
                  CrashProtocol,
                ),
              );
              yield* Effect.gen(function* () {
                const client = yield* Crash();
                // The worker throws from a timer its `crash` handler schedules, so the process can
                // die before its reply to that call has been flushed — under machine load it did,
                // 2 runs in 24, and the call failed `Closed: Worker owner disconnected` instead of
                // returning. Both are the same injected failure observed one message apart, and
                // what this test is about is downstream of either: the non-zero exit and the
                // diagnostic. So a `Closed` is accepted here by name, and every other failure still
                // fails the test rather than being swallowed with it.
                const requested = yield* Effect.exit(client.crash());
                if (requested._tag === "Failure") {
                  const error = Cause.squash(requested.cause);
                  assert.ok(error instanceof SewedError, `crash() failed with ${String(error)}`);
                  assert.equal(error.code, "Closed", error.message);
                }
                assert.notEqual(yield* worker.awaitExit, 0);
                const snapshot = yield* diagnostics.snapshot;
                assert.ok(
                  snapshot.events.some(
                    ({ event }) =>
                      event._tag === "OwnerClosed" &&
                      event.ownerId === worker.id &&
                      event.reason === "exited",
                  ),
                );
                assert.equal(snapshot.owners.length, 0);
              }).pipe(Effect.provide(Binding.layer([Binding.to(Crash, worker)])));
            }),
          ).pipe(Effect.provide([Testing.main, diagnostics.layer]));
        }),
      ),
    );
  },
);

const eventually = (
  collector: Diagnostics.Collector,
  predicate: (snapshot: Diagnostics.Snapshot) => boolean,
) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 100; attempt++) {
      const snapshot = yield* collector.snapshot;
      if (predicate(snapshot)) return snapshot;
      yield* Effect.sleep(10);
    }
    assert.fail("Diagnostic state did not settle");
  });

test(
  "diagnostics record owners, active calls, typed failure and interruption without payloads",
  { timeout: 10000 },
  async () => {
    const spans: Tracer.Span[] = [];
    const collector = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const diagnostics = yield* Diagnostics.make({ capacity: 64 });
          const tracer = yield* Effect.tracer;
          yield* Effect.scoped(
            Effect.gen(function* () {
              const released = yield* Deferred.make<void>();
              const subscribed = yield* Deferred.make<void>();
              const owner = yield* Testing.host(Protocol, (implement) =>
                implement({
                  echo: ({ secret }) => Effect.succeed(secret),
                  reject: () => Effect.fail(new Rejected({ message: "private failure" })),
                  events: () =>
                    Stream.scoped(
                      Stream.fromEffect(
                        Effect.acquireRelease(Deferred.succeed(subscribed, undefined), () =>
                          Deferred.succeed(released, undefined),
                        ),
                      ).pipe(Stream.flatMap(() => Stream.never)),
                    ),
                }),
              );
              yield* Effect.gen(function* () {
                const service = yield* Service();
                assert.equal(yield* service.echo({ secret: "private payload" }), "private payload");
                const failure = yield* service.reject().pipe(Effect.flip);
                assert.ok(failure instanceof Rejected);
                const pending = yield* service.events().pipe(Stream.runDrain, Effect.forkScoped);
                yield* Deferred.await(subscribed);
                const running = yield* diagnostics.snapshot;
                assert.equal(running.owners[0]?.ownerId, owner.id);
                assert.equal(running.owners[0]?.runtime, "main");
                assert.ok(
                  running.bindings.some(
                    (binding) => binding.ownerId === owner.id && binding.slot === Service.key,
                  ),
                );
                assert.ok(running.requests.some((request) => request.procedure === "events"));
                yield* Fiber.interrupt(pending);
                yield* Deferred.await(released);
                yield* eventually(diagnostics, (snapshot) => snapshot.requests.length === 0);
                const snapshot = yield* diagnostics.snapshot;
                const endings = snapshot.events.flatMap(({ event }) =>
                  event._tag === "RequestEnded" ? [event.outcome] : [],
                );
                assert.ok(endings.includes("success"));
                assert.ok(endings.includes("failure"));
                assert.ok(endings.includes("interrupted"));
                assert.equal(JSON.stringify(snapshot).includes("private"), false);
              }).pipe(Effect.provide(Binding.layer([Binding.to(Service, owner)])));
            }),
          ).pipe(
            Effect.provide([diagnostics.layer, Testing.main]),
            Effect.withTracer(
              Tracer.make({
                span(options) {
                  const span = tracer.span(options);
                  spans.push(span);
                  return span;
                },
              }),
            ),
          );
          const snapshot = yield* diagnostics.snapshot;
          assert.equal(snapshot.owners.length, 0);
          assert.equal(snapshot.bindings.length, 0);
          assert.equal(snapshot.requests.length, 0);
          assert.ok(
            snapshot.events.some(
              ({ event }) => event._tag === "OwnerClosed" && event.reason === "scope-closed",
            ),
          );
          return diagnostics;
        }),
      ),
    );
    assert.equal((await Effect.runPromise(collector.snapshot)).closed, true);
    const client = spans.find((span) => span.name === "RpcClient.echo");
    const server = spans.find((span) => span.name === "RpcServer.echo");
    assert.ok(client);
    assert.ok(server);
    assert.equal(client.attributes.get("sewed.binding"), Service.key);
    assert.equal(client.attributes.get("sewed.owner.id"), server.attributes.get("sewed.owner.id"));
    assert.equal(server.attributes.get("sewed.runtime"), "main");
    assert.equal(client.traceId, server.traceId);
  },
);

test("diagnostic history is bounded while live state survives eviction and changes are observable", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make({ capacity: 4 });
        const observed: Diagnostics.Record[] = [];
        yield* diagnostics.changes.pipe(
          Stream.runForEach((record) => Effect.sync(() => observed.push(record))),
          Effect.forkScoped,
        );
        yield* Effect.yieldNow;
        yield* Effect.scoped(
          Effect.gen(function* () {
            const owner = yield* Testing.host(
              Protocol,
              Protocol.toLayer({
                echo: ({ secret }) => Effect.succeed(secret),
                reject: () => Effect.void,
                events: () => Stream.empty,
              }),
            );
            yield* Effect.gen(function* () {
              const service = yield* Service();
              for (let index = 0; index < 20; index++)
                yield* service.echo({ secret: String(index) });
              const snapshot = yield* diagnostics.snapshot;
              assert.equal(snapshot.events.length, 4);
              assert.equal(snapshot.owners.length, 1);
              assert.equal(snapshot.bindings.length, 1);
              assert.equal(snapshot.requests.length, 0);
              assert.equal(snapshot.complete, true);
              assert.ok(snapshot.events[0]!.sequence > 1);
              assert.ok(observed.length > 4);
            }).pipe(Effect.provide(Binding.layer([Binding.to(Service, owner)])));
          }),
        ).pipe(Effect.provide([diagnostics.layer, Testing.main]));
      }),
    ),
  );
});

test(
  "actual workers report their thread and pending calls disappear on termination",
  { timeout: 15000 },
  async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const diagnostics = yield* Diagnostics.make({ capacity: 128 });
          const Tasks = Binding.slot("diagnostics/worker", WorkerProtocol);
          yield* Effect.scoped(
            Effect.gen(function* () {
              const worker = yield* Testing.Worker.spawn(
                Testing.Worker.entry(new URL("./worker.mjs", import.meta.url), WorkerProtocol),
              );
              yield* Effect.gen(function* () {
                const tasks = yield* Tasks();
                const info = yield* tasks.info();
                const owner = (yield* diagnostics.snapshot).owners.find(
                  (owner) => owner.ownerId === worker.id,
                );
                assert.equal(owner?.threadId, info.thread);
                assert.equal(owner?.runtime, "worker");
                assert.ok(info.thread > 0);
                const pending = yield* tasks.wait({ milliseconds: 10000 }).pipe(Effect.forkScoped);
                yield* eventually(diagnostics, (snapshot) =>
                  snapshot.requests.some((request) => request.procedure === "wait"),
                );
                yield* worker.terminate;
                yield* worker.awaitExit;
                yield* Fiber.await(pending);
                const snapshot = yield* diagnostics.snapshot;
                assert.equal(snapshot.requests.length, 0);
                assert.equal(snapshot.owners.length, 0);
                assert.ok(
                  snapshot.events.some(
                    ({ event }) =>
                      event._tag === "OwnerClosed" &&
                      event.ownerId === worker.id &&
                      event.reason === "terminated",
                  ),
                );
              }).pipe(Effect.provide(Binding.layer([Binding.to(Tasks, worker)])));
            }),
          ).pipe(Effect.provide([diagnostics.layer, Testing.main]));
        }),
      ),
    );
  },
);
