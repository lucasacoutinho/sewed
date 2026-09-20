import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Fiber, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Binary from "../lib/Binary.js";
import * as Binding from "../lib/PublicBinding.js";
import * as Testing from "../lib/Testing.js";
import {
  decodeClient,
  decodeServer,
  encode,
  encodeChunks,
  maxMessageBytes,
} from "../lib/internal/Transport.js";

class Rejected extends Schema.TaggedError<Rejected>()("Rejected", { value: Schema.Number }) {}

const protocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("echo", { payload: { bytes: Binary.Bytes }, success: Binary.Bytes }),
    Rpc.make("bytes", { success: Binary.Bytes, stream: true }),
    Rpc.make("reject", { error: Rejected, success: Schema.Void }),
  ),
);
const slot = Binding.slot("binary-test", protocol);

test("binary RPC retains byte arrays, declared errors and bounded stream batches", async () => {
  const input = Uint8Array.from({ length: 64 * 1024 }, (_, index) => index % 251);
  const total = 12 * 1024 * 1024;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* slot();
        assert.deepEqual(Uint8Array.from(yield* client.echo({ bytes: input })), input);
        const error = yield* client.reject().pipe(Effect.flip);
        assert.ok(error instanceof Rejected);
        assert.equal(error.value, 42);
        const actual = yield* client.bytes().pipe(
          Stream.runFold(
            () => 0,
            (size, bytes) => {
              assert.ok(bytes instanceof Uint8Array);
              assert.ok(bytes.length <= Binary.chunkBytes);
              assert.equal(bytes[0], 17);
              assert.equal(bytes.at(-1), 17);
              return size + bytes.byteLength;
            },
          ),
        );
        assert.equal(actual, total);
        assert.equal((yield* client.echo({ bytes: input })).byteLength, input.byteLength);
      }).pipe(
        Effect.provide(
          Testing.layer(
            slot,
            protocol.toLayer({
              echo: ({ bytes }) => Effect.succeed(bytes),
              bytes: () => Binary.chunks(Stream.make(new Uint8Array(total).fill(17))),
              reject: () => Effect.fail(new Rejected({ value: 42 })),
            }),
          ),
        ),
      ),
    ),
  );
});

test("interrupting a binary consumer finalizes the producing stream", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const released = yield* Deferred.make<void>();
        const handlers = protocol.toLayer({
          echo: ({ bytes }) => Effect.succeed(bytes),
          reject: () => Effect.fail(new Rejected({ value: 1 })),
          bytes: () =>
            Stream.unwrap(
              Effect.gen(function* () {
                yield* Effect.addFinalizer(() => Deferred.succeed(released, undefined));
                return Stream.make(new Uint8Array([1, 2, 3])).pipe(Stream.concat(Stream.never));
              }),
            ),
        });
        yield* Effect.gen(function* () {
          const client = yield* slot();
          yield* client.bytes().pipe(Stream.take(1), Stream.runDrain);
          yield* Deferred.await(released).pipe(Effect.timeout("1 second"));
        }).pipe(Effect.provide(Testing.layer(slot, handlers)));
      }),
    ),
  );
});

test("binary envelopes reject oversized, truncated, appended and mismatched packets", () => {
  const request = {
    _tag: "Request",
    id: "1",
    tag: "echo",
    payload: { bytes: new Uint8Array([1]) },
    headers: [],
  };
  const wire = encode(request, "binary");
  assert.ok(wire instanceof Uint8Array);
  assert.equal(decodeClient(wire, "binary")._tag, "Request");
  assert.throws(() => decodeClient(wire, "json"));
  assert.throws(() => decodeClient(encode(request), "binary"));
  assert.throws(() => decodeClient(wire.subarray(0, wire.length - 1), "binary"));
  assert.throws(() => decodeClient(new Uint8Array([...wire, 0xc4]), "binary"));
  assert.throws(() => decodeClient(new Uint8Array(maxMessageBytes + 1), "binary"));
  for (const header of [0xdd, 0xdf, 0xdb, 0xc6]) {
    // A short packet cannot reserve a 32-bit array, map, string or byte buffer.
    assert.throws(() => decodeClient(new Uint8Array([header, 255, 255, 255, 255]), "binary"));
  }
});

/**
 * Resolves with `read()` once it has held still for `turns` consecutive event-loop turns.
 *
 * Turns, not milliseconds: the producer below is driven by messages, so it can only advance when this
 * process actually runs. Under CPU contention fifty milliseconds of clock can be almost no CPU, and a
 * fixed sleep then sampled a producer that had not reached its plateau yet.
 */
const quiescent = async (read: () => number, turns = 200, limit = 200_000): Promise<number> => {
  let last = read();
  let still = 0;
  for (let spent = 0; still < turns; spent++) {
    if (spent > limit)
      throw new Error(`still changing after ${limit} event-loop turns, at ${last}`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const now = read();
    if (now === last) still++;
    else {
      last = now;
      still = 0;
    }
  }
  return last;
};

test("a stalled binary consumer stops production before the full source is buffered", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const first = yield* Deferred.make<void>();
        const blocked = yield* Deferred.make<void>();
        const finalized = yield* Deferred.make<void>();
        let produced = 0;
        const handlers = protocol.toLayer({
          echo: ({ bytes }) => Effect.succeed(bytes),
          reject: () => Effect.fail(new Rejected({ value: 1 })),
          bytes: () =>
            Stream.range(0, 4095).pipe(
              Stream.rechunk(1),
              Stream.map(() => {
                produced++;
                return new Uint8Array(Binary.chunkBytes);
              }),
              Stream.ensuring(Deferred.succeed(finalized, undefined)),
            ),
        });
        yield* Effect.gen(function* () {
          const client = yield* slot();
          const consumer = yield* client.bytes().pipe(
            Stream.runForEach(() =>
              Deferred.succeed(first, undefined).pipe(Effect.andThen(Deferred.await(blocked))),
            ),
            Effect.forkScoped,
          );
          yield* Deferred.await(first);
          const stalled = yield* Effect.promise(() => quiescent(() => produced));
          assert.ok(stalled > 0 && stalled < 128, `producer ran ahead by ${stalled} chunks`);
          assert.equal(yield* Effect.promise(() => quiescent(() => produced)), stalled);
          const independent = yield* client
            .echo({ bytes: new Uint8Array([9]) })
            .pipe(Effect.timeout("1 second"));
          assert.equal(independent[0], 9, "stalled stream blocked an independent RPC response");
          yield* Fiber.interrupt(consumer);
          yield* Deferred.await(finalized).pipe(Effect.timeout("1 second"));
        }).pipe(Effect.provide(Testing.layer(slot, handlers)));
      }),
    ),
  );
});

test("binary stream fragmentation preserves value order and owns queued packet bytes", () => {
  const values = Array.from({ length: 11 }, (_, index) =>
    new Uint8Array(Binary.chunkBytes).fill(index),
  );
  const frames = [...encodeChunks({ _tag: "Chunk", requestId: "1", values }, "binary")];
  assert.equal(frames.length, 4);
  assert.equal(frames.at(-1)?.final, true);
  assert.ok(frames.slice(0, -1).every((frame) => !frame.final));
  const decoded = frames.flatMap(({ message }) => {
    assert.ok(message instanceof Uint8Array);
    assert.ok(message.byteLength <= maxMessageBytes);
    const value = decodeServer(message, "binary");
    assert.equal(value._tag, "Chunk");
    return value._tag === "Chunk" ? value.values : [];
  });
  assert.equal(decoded.length, values.length);
  decoded.forEach((value, index) => {
    assert.ok(value instanceof Uint8Array);
    assert.deepEqual(Uint8Array.from(value), values[index]);
  });
});
