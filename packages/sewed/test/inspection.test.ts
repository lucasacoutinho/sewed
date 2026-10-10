import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Binding from "../src/Binding.ts";
import * as Binary from "../src/Binary.ts";
import * as Diagnostics from "../src/Diagnostics.ts";
import * as Remote from "../src/Remote.ts";
import * as Testing from "../src/Testing.ts";
import { Sink } from "../src/internal/Diagnostics.ts";
import { encodeChunks } from "../src/internal/Transport.ts";

class AcquisitionFailure extends Schema.TaggedError<AcquisitionFailure>()(
  "InspectionAcquisitionFailure",
  { message: Schema.String },
) {}

const Methods = RpcGroup.make(Rpc.make("read", { success: Schema.String }));
const Reader = Remote.make({
  payload: Schema.Struct({ path: Schema.String }),
  protocol: Methods,
  error: AcquisitionFailure,
});
const Readers = Binding.slot("inspection/readers", Reader.protocol);

test("resource diagnostics cover ready, failed, cancelled and released leases", async () => {
  const pendingStarted = Deferred.makeUnsafe<void>();
  const handlers = Remote.layer(Reader, ({ path }) =>
    Methods.toLayer(
      Effect.gen(function* () {
        if (path === "reject") return yield* new AcquisitionFailure({ message: "private failure" });
        if (path === "pending") {
          yield* Deferred.succeed(pendingStarted, undefined);
          return yield* Effect.never;
        }
        return { read: () => Effect.succeed(path) };
      }),
    ),
  );

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make({ capacity: 64 });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const owner = yield* Testing.host(Reader.protocol, handlers);
            yield* Effect.gen(function* () {
              const handle = yield* Remote.acquire(Reader, Readers, { path: "private-path" });
              const ready = yield* diagnostics.snapshot;
              const resource = ready.resources[0];
              assert.ok(resource);
              assert.equal(resource.ownerId, owner.id);
              assert.equal(resource.state, "ready");
              assert.ok(
                ready.events.some(
                  ({ event }) => event._tag === "ResourceChanged" && event.state === "acquiring",
                ),
              );
              assert.ok(
                ready.events.some(
                  ({ event }) => event._tag === "ResourceChanged" && event.state === "ready",
                ),
              );
              assert.equal(JSON.stringify(ready).includes("private-path"), false);
              assert.equal(JSON.stringify(ready).includes("x-sewed-remote-lease"), false);

              yield* handle.release;
              const released = yield* diagnostics.snapshot;
              assert.equal(released.resources.length, 0);
              assert.ok(
                released.events.some(
                  ({ event }) =>
                    event._tag === "ResourceClosed" &&
                    event.resourceId === resource.resourceId &&
                    event.outcome === "success" &&
                    event.reason === "release",
                ),
              );

              const failed = yield* Effect.exit(
                Remote.acquire(Reader, Readers, { path: "reject" }),
              );
              assert.equal(failed._tag, "Failure");
              const failedSnapshot = yield* diagnostics.snapshot;
              assert.ok(
                failedSnapshot.events.some(
                  ({ event }) =>
                    event._tag === "ResourceClosed" &&
                    event.outcome === "failure" &&
                    event.reason === "acquisition",
                ),
              );

              const pending = yield* Remote.acquire(Reader, Readers, { path: "pending" }).pipe(
                Effect.forkScoped,
              );
              yield* Deferred.await(pendingStarted);
              yield* Fiber.interrupt(pending);
              const pendingExit = yield* Fiber.await(pending);
              assert.equal(pendingExit._tag, "Failure");
              for (let attempt = 0; attempt < 20; attempt++) {
                if ((yield* diagnostics.snapshot).resources.length === 0) break;
                yield* Effect.sleep(5);
              }
              const cancelled = yield* diagnostics.snapshot;
              assert.equal(cancelled.resources.length, 0);
              assert.ok(
                cancelled.events.some(
                  ({ event }) => event._tag === "ResourceClosed" && event.outcome === "interrupted",
                ),
              );
            }).pipe(Effect.provide(Binding.layer([Binding.to(Readers, owner)])));
          }),
        ).pipe(Effect.provide([Testing.main, diagnostics.layer]));
      }),
    ),
  );
});

test("resource diagnostics report finalizer defects after delayed release cleanup", async () => {
  const cleanupStarted = Deferred.makeUnsafe<void>();
  const allowCleanup = Deferred.makeUnsafe<void>();
  const handlers = Remote.layer(Reader, ({ path }) => {
    const resource = Layer.effectDiscard(
      Effect.acquireRelease(Effect.void, () =>
        Deferred.succeed(cleanupStarted, undefined).pipe(
          Effect.andThen(Deferred.await(allowCleanup)),
          Effect.andThen(Effect.die(new Error("inspection finalizer failed"))),
        ),
      ),
    );
    return Methods.toLayer({ read: () => Effect.succeed(path) }).pipe(Layer.provideMerge(resource));
  });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make({ capacity: 64 });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const owner = yield* Testing.host(Reader.protocol, handlers);
            yield* Effect.gen(function* () {
              const handle = yield* Remote.acquire(Reader, Readers, { path: "delayed" });
              const ready = yield* diagnostics.snapshot;
              const resource = ready.resources.find(({ ownerId }) => ownerId === owner.id);
              assert.ok(resource);

              const release = yield* handle.release.pipe(Effect.forkScoped);
              yield* Deferred.await(cleanupStarted);
              const releasing = yield* diagnostics.snapshot;
              assert.equal(releasing.resources[0]?.state, "releasing");
              assert.equal(
                releasing.events.some(
                  ({ event }) =>
                    event._tag === "ResourceClosed" && event.resourceId === resource?.resourceId,
                ),
                false,
              );
              assert.equal(release.pollUnsafe(), undefined);
              const concurrentRelease = yield* handle.release.pipe(Effect.forkScoped);
              assert.equal(concurrentRelease.pollUnsafe(), undefined);

              yield* Deferred.succeed(allowCleanup, undefined);
              const releaseExit = yield* Fiber.await(release);
              const concurrentExit = yield* Fiber.await(concurrentRelease);
              assert.equal(releaseExit._tag, "Failure");
              assert.equal(concurrentExit._tag, "Failure");
              const closed = yield* diagnostics.snapshot;
              assert.equal(closed.resources.length, 0);
              assert.ok(
                closed.events.some(
                  ({ event }) =>
                    event._tag === "ResourceClosed" &&
                    event.resourceId === resource?.resourceId &&
                    event.outcome === "failure" &&
                    event.reason === "release",
                ),
              );
            }).pipe(Effect.provide(Binding.layer([Binding.to(Readers, owner)])));
          }),
        ).pipe(Effect.provide([Testing.main, diagnostics.layer]));
      }),
    ),
  );
});

test("resource acquisition diagnostics retain cleanup defects with typed acquisition failures", async () => {
  const handlers = Remote.layer(Reader, () => {
    const resource = Layer.effectDiscard(
      Effect.acquireRelease(Effect.void, () => Effect.die(new Error("acquisition cleanup failed"))),
    );
    return Methods.toLayer(
      Effect.fail(new AcquisitionFailure({ message: "typed acquisition failed" })),
    ).pipe(Layer.provideMerge(resource));
  });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make({ capacity: 64 });
        const owner = yield* Testing.host(Reader.protocol, handlers).pipe(
          Effect.provide([Testing.main, diagnostics.layer]),
        );
        yield* Effect.gen(function* () {
          const result = yield* Effect.exit(
            Remote.acquire(Reader, Readers, { path: "acquisition-defect" }),
          );
          assert.equal(result._tag, "Failure");
          const snapshot = yield* diagnostics.snapshot;
          const closed = snapshot.events.findLast(
            ({ event }) => event._tag === "ResourceClosed" && event.reason === "acquisition",
          );
          assert.ok(closed);
          if (closed?.event._tag !== "ResourceClosed") return;
          assert.equal(closed.event.outcome, "failure");
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Readers, owner)])),
          Effect.provide([Testing.main, diagnostics.layer]),
        );
      }),
    ),
  );
});

test("resource diagnostics observe automatic scope cleanup after finalizers finish", async () => {
  const cleanupStarted = Deferred.makeUnsafe<void>();
  const allowCleanup = Deferred.makeUnsafe<void>();
  const handlers = Remote.layer(Reader, ({ path }) => {
    const resource = Layer.effectDiscard(
      Effect.acquireRelease(Effect.void, () =>
        Deferred.succeed(cleanupStarted, undefined).pipe(
          Effect.andThen(Deferred.await(allowCleanup)),
        ),
      ),
    );
    return Methods.toLayer({ read: () => Effect.succeed(path) }).pipe(Layer.provideMerge(resource));
  });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make({ capacity: 64 });
        const ownerScope = yield* Scope.fork(yield* Effect.scope, "sequential");
        const owner = yield* Scope.provide(ownerScope)(
          Testing.host(Reader.protocol, handlers).pipe(
            Effect.provide([Testing.main, diagnostics.layer]),
          ),
        );
        yield* Effect.gen(function* () {
          yield* Remote.acquire(Reader, Readers, { path: "automatic" });
          const ready = yield* diagnostics.snapshot;
          const resource = ready.resources.find(({ ownerId }) => ownerId === owner.id);
          assert.ok(resource);

          const ownerClose = yield* Scope.close(ownerScope, Exit.void).pipe(Effect.forkScoped);
          yield* Deferred.await(cleanupStarted);
          const releasing = yield* diagnostics.snapshot;
          assert.equal(releasing.resources[0]?.state, "releasing");
          assert.equal(ownerClose.pollUnsafe(), undefined);

          yield* Deferred.succeed(allowCleanup, undefined);
          const ownerExit = yield* Fiber.await(ownerClose);
          assert.equal(ownerExit._tag, "Success");
          const closed = yield* diagnostics.snapshot;
          assert.equal(closed.resources.length, 0);
          assert.ok(
            closed.events.some(
              ({ event }) =>
                event._tag === "ResourceClosed" &&
                event.resourceId === resource?.resourceId &&
                event.outcome === "interrupted" &&
                event.reason === "scope-closed",
            ),
          );
          const ownerClosed = closed.events.findLast(
            ({ event }) => event._tag === "OwnerClosed" && event.ownerId === owner.id,
          );
          assert.ok(ownerClosed);
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Readers, owner)])),
          Effect.provide([Testing.main, diagnostics.layer]),
        );
      }),
    ),
  );
});

const StreamProtocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("bytes", { success: Binary.Bytes, stream: true }),
    Rpc.make("pending", { success: Binary.Bytes, stream: true }),
  ),
);
const Streams = Binding.slot("inspection/streams", StreamProtocol);

test("stream diagnostics count encoded frames and wire bytes and flush cancellation", async () => {
  const values = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7])] as const;
  const handlers = StreamProtocol.toLayer({
    bytes: () => Stream.make(...values),
    pending: () => Stream.concat(Stream.make(new Uint8Array([9, 10])), Stream.never),
  });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make({ capacity: 128 });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const owner = yield* Testing.host(StreamProtocol, handlers);
            yield* Effect.gen(function* () {
              const client = yield* Streams();
              const received = yield* client.bytes().pipe(
                Stream.runFold(
                  () => 0,
                  (total, bytes) => total + bytes.byteLength,
                ),
              );
              assert.equal(received, 7);
              const completed = yield* diagnostics.snapshot;
              const progress = completed.events
                .map(({ event }) => event)
                .filter((event) => event._tag === "TransferProgress" && event.terminal)
                .findLast(
                  (event) => event._tag === "TransferProgress" && event.ownerId === owner.id,
                );
              assert.ok(progress);
              if (progress?._tag !== "TransferProgress") return;
              const request = {
                _tag: "Chunk" as const,
                requestId: Number.isNaN(Number(progress.requestId))
                  ? progress.requestId
                  : Number(progress.requestId),
                values,
              };
              const frames = [...encodeChunks(request, "binary")];
              assert.equal(progress.frames, frames.length);
              assert.equal(
                progress.wireBytes,
                frames.reduce((total, frame) => total + frame.message.byteLength, 0),
              );
              assert.equal(completed.transfers.length, 0);
              const terminalSequence = completed.events.findLast(
                ({ event }) =>
                  event._tag === "TransferProgress" &&
                  event.requestId === progress.requestId &&
                  event.terminal,
              )?.sequence;
              const requestEndSequence = completed.events.findLast(
                ({ event }) =>
                  event._tag === "RequestEnded" && event.requestId === progress.requestId,
              )?.sequence;
              assert.ok(terminalSequence !== undefined && requestEndSequence !== undefined);
              assert.ok(terminalSequence < requestEndSequence);
              assert.equal(JSON.stringify(completed).includes("1,2,3"), false);

              const cancelledFiber = yield* client
                .pending()
                .pipe(Stream.take(1), Stream.runDrain, Effect.forkScoped);
              yield* Fiber.join(cancelledFiber);
              let cancelled = yield* diagnostics.snapshot;
              for (let attempt = 0; attempt < 20 && cancelled.transfers.length > 0; attempt++) {
                yield* Effect.sleep(5);
                cancelled = yield* diagnostics.snapshot;
              }
              assert.equal(cancelled.transfers.length, 0);
              const pendingStart = cancelled.events.findLast(
                ({ event }) => event._tag === "RequestStarted" && event.procedure === "pending",
              );
              assert.ok(pendingStart);
              assert.ok(
                cancelled.events.some(
                  ({ event }) =>
                    event._tag === "TransferProgress" &&
                    event.requestId ===
                      (pendingStart?.event._tag === "RequestStarted"
                        ? pendingStart.event.requestId
                        : undefined) &&
                    event.terminal,
                ),
              );
            }).pipe(Effect.provide(Binding.layer([Binding.to(Streams, owner)])));
          }),
        ).pipe(Effect.provide([Testing.main, diagnostics.layer]));
      }),
    ),
  );
});

const FramedProtocol = Binary.protocol(
  RpcGroup.make(Rpc.make("framed", { success: Binary.Bytes, stream: true })),
);
const FramedStreams = Binding.slot("inspection/framed-streams", FramedProtocol);

test("stream diagnostics keep blocked streams active and finish once after all encoded frames", async () => {
  const values = [
    new Uint8Array([0]),
    new Uint8Array([1]),
    new Uint8Array([2]),
    ...Array.from({ length: 125 }, (_, index) => new Uint8Array([(index + 3) % 251])),
  ] as const;
  const allowSecond = Deferred.makeUnsafe<void>();
  const allowTail = Deferred.makeUnsafe<void>();
  const firstReceived = Deferred.makeUnsafe<void>();
  const secondReceived = Deferred.makeUnsafe<void>();
  const source = Stream.concat(
    Stream.make(values[0]),
    Stream.concat(
      Stream.fromEffect(Deferred.await(allowSecond).pipe(Effect.as(values[1]))),
      Stream.concat(
        Stream.fromEffect(Deferred.await(allowTail).pipe(Effect.as(values[2]))),
        Stream.fromIterable(values.slice(3)),
      ),
    ),
  ).pipe(Stream.rechunk(1));
  const handlers = FramedProtocol.toLayer({ framed: () => source });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make({ capacity: 256 });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const owner = yield* Testing.host(FramedProtocol, handlers);
            yield* Effect.gen(function* () {
              const client = yield* FramedStreams();
              let received = 0;
              const consumer = yield* client.framed().pipe(
                Stream.runForEach(() =>
                  Effect.sync(() => {
                    received += 1;
                    if (received === 1) Deferred.doneUnsafe(firstReceived, Effect.void);
                    if (received === 2) Deferred.doneUnsafe(secondReceived, Effect.void);
                  }),
                ),
                Effect.forkScoped,
              );

              yield* Deferred.await(firstReceived);
              let beforeSecond = yield* diagnostics.snapshot;
              const started = beforeSecond.events.findLast(
                ({ event }) => event._tag === "RequestStarted" && event.procedure === "framed",
              );
              assert.ok(started);
              if (!started || started.event._tag !== "RequestStarted") return;
              const requestId = started.event.requestId;
              for (let attempt = 0; attempt < 20; attempt++) {
                if (beforeSecond.transfers.some((transfer) => transfer.requestId === requestId))
                  break;
                yield* Effect.sleep(5);
                beforeSecond = yield* diagnostics.snapshot;
              }
              assert.ok(
                beforeSecond.transfers.some(
                  (transfer) => transfer.ownerId === owner.id && transfer.requestId === requestId,
                ),
              );
              assert.equal(
                beforeSecond.events.some(
                  ({ event }) =>
                    event._tag === "TransferProgress" &&
                    event.requestId === requestId &&
                    event.terminal,
                ),
                false,
              );

              yield* Deferred.succeed(allowSecond, undefined);
              yield* Deferred.await(secondReceived);
              const middle = yield* diagnostics.snapshot;
              assert.ok(
                middle.transfers.some(
                  (transfer) => transfer.ownerId === owner.id && transfer.requestId === requestId,
                ),
              );
              assert.equal(
                middle.events.some(
                  ({ event }) =>
                    event._tag === "TransferProgress" &&
                    event.requestId === requestId &&
                    event.terminal,
                ),
                false,
              );

              yield* Deferred.succeed(allowTail, undefined);
              yield* Fiber.join(consumer);
              assert.equal(received, values.length);
              const completed = yield* diagnostics.snapshot;
              const progress = completed.events.filter(
                ({ event }) => event._tag === "TransferProgress" && event.requestId === requestId,
              );
              assert.equal(
                progress.filter(({ event }) => event._tag === "TransferProgress" && event.terminal)
                  .length,
                1,
              );
              assert.ok(progress.length < values.length / 4);
              const terminal = progress.findLast(
                ({ event }) => event._tag === "TransferProgress" && event.terminal,
              );
              assert.ok(terminal);
              if (!terminal || terminal.event._tag !== "TransferProgress") return;
              const encodedRequestId = Number.isNaN(Number(requestId))
                ? requestId
                : Number(requestId);
              let expectedFrames = 0;
              let expectedWireBytes = 0;
              for (const value of values) {
                for (const frame of encodeChunks(
                  { _tag: "Chunk" as const, requestId: encodedRequestId, values: [value] },
                  "binary",
                )) {
                  expectedFrames += 1;
                  expectedWireBytes += frame.message.byteLength;
                }
              }
              assert.equal(terminal.event.frames, expectedFrames);
              assert.equal(terminal.event.wireBytes, expectedWireBytes);
              assert.equal(completed.transfers.length, 0);
              const terminalSequence = terminal.sequence;
              const requestEnd = completed.events.findLast(
                ({ event }) => event._tag === "RequestEnded" && event.requestId === requestId,
              );
              assert.ok(requestEnd);
              if (!requestEnd) return;
              assert.ok(terminalSequence < requestEnd.sequence);
            }).pipe(Effect.provide(Binding.layer([Binding.to(FramedStreams, owner)])));
          }),
        ).pipe(Effect.provide([Testing.main, diagnostics.layer]));
      }),
    ),
  );
});

test("inspection active maps expose resource and transfer eviction", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make({ capacity: 1 });
        yield* Effect.gen(function* () {
          const sink = yield* Sink;
          const placement = { runtime: "main" as const, threadId: 0, runtimeId: "owner" };
          sink.emit({
            _tag: "ResourceChanged",
            resourceId: "resource-1",
            ownerId: "owner",
            clientId: 1,
            state: "ready",
            ...placement,
          });
          sink.emit({
            _tag: "ResourceChanged",
            resourceId: "resource-2",
            ownerId: "owner",
            clientId: 1,
            state: "ready",
            ...placement,
          });
          sink.emit({
            _tag: "TransferProgress",
            ownerId: "owner",
            clientId: 1,
            requestId: "request-1",
            frames: 1,
            wireBytes: 2,
            terminal: false,
            ...placement,
          });
          sink.emit({
            _tag: "TransferProgress",
            ownerId: "owner",
            clientId: 1,
            requestId: "request-2",
            frames: 1,
            wireBytes: 2,
            terminal: false,
            ...placement,
          });
          sink.emit({ _tag: "OwnerClosed", ownerId: "owner", reason: "terminated" });
        }).pipe(Effect.provide(diagnostics.layer));
        const snapshot = yield* diagnostics.snapshot;
        assert.equal(snapshot.resources.length, 0);
        assert.equal(snapshot.transfers.length, 0);
        assert.equal(snapshot.resourceDropped, 1);
        assert.equal(snapshot.transferDropped, 1);
        assert.equal(snapshot.complete, false);
      }),
    ),
  );
});
