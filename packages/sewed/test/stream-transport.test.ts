import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Deferred, Effect, Fiber, Layer, Queue, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import type { FromClientEncoded, FromServerEncoded } from "effect/unstable/rpc/RpcMessage";
import { Binding } from "../lib/index.js";
import { host } from "../lib/Host.js";
import { MainContext, mainIdentity } from "../lib/RuntimeContext.js";
import { server } from "../lib/Runtime.js";
import { SewedError } from "../lib/SewedError.js";
import {
  decodeServer,
  encode,
  encodeChunks,
  maxMessageBytes,
  pair,
} from "../lib/internal/Transport.js";

const Item = Schema.Struct({ index: Schema.Number, value: Schema.String });
const Protocol = RpcGroup.make(
  Rpc.make("items", {
    payload: { count: Schema.Number, size: Schema.Number },
    success: Item,
    stream: true,
  }),
  Rpc.make("value", { payload: { size: Schema.Number }, success: Schema.String }),
  Rpc.make("delayed", { success: Schema.String }),
);
const Items = Binding.slot("stream-transport", Protocol);
const handlers = Protocol.toLayer({
  items: ({ count, size }) =>
    Stream.range(0, count - 1).pipe(Stream.map((index) => ({ index, value: "x".repeat(size) }))),
  value: ({ size }) => Effect.succeed("x".repeat(size)),
  delayed: () => Effect.as(Effect.sleep(100), "alive"),
});
const run = <A, E>(program: Effect.Effect<A, E, MainContext | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(program).pipe(Effect.provideService(MainContext, mainIdentity)));

const Probe = RpcGroup.make(
  Rpc.make("chunks", { success: Schema.String, stream: true }),
  Rpc.make("echo", { success: Schema.String }),
);
const probe = (stream: Stream.Stream<string, never, Scope.Scope>) =>
  Effect.gen(function* () {
    const services = yield* Layer.build(
      Probe.toLayer({ chunks: () => stream, echo: () => Effect.succeed("alive") }),
    );
    const runtime = yield* server(Probe).pipe(Effect.provideContext(services));
    const messages = yield* Queue.make<FromServerEncoded>();
    const [client, connection] = pair();
    runtime.accept(connection);
    const unsubscribe = client.subscribe(
      (message) => {
        Queue.offerUnsafe(messages, decodeServer(message));
      },
      () => {},
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        unsubscribe();
        client.close();
      }),
    );
    return {
      messages,
      close: () => client.close(),
      send: (message: FromClientEncoded) => client.send(encode(message)),
      request: (id: number, tag = "chunks") =>
        client.send(encode({ _tag: "Request", id, tag, payload: null, headers: [] })),
    };
  });

test("stream framing counts UTF-8 bytes, JSON escaping and the complete envelope", () => {
  const base = { _tag: "Chunk", requestId: 'request"\\😀' } as const;
  const value = '😀"\\\n'.repeat(20_000);
  const values = [value, undefined, { value }, null, value] as const;
  const frames = [...encodeChunks({ ...base, values })];
  assert.ok(frames.length > 1);
  for (const [index, frame] of frames.entries()) {
    assert.ok(Buffer.byteLength(frame.message) <= maxMessageBytes);
    assert.equal(frame.final, index === frames.length - 1);
  }
  assert.deepEqual(
    frames.flatMap((frame) => JSON.parse(frame.message).values),
    JSON.parse(JSON.stringify(values)),
  );
  const custom = { toJSON: (key: string) => ({ index: key }) };
  const [indexed] = encodeChunks({ ...base, values: [custom, custom, undefined] });
  assert.ok(indexed);
  assert.deepEqual(
    JSON.parse(indexed.message).values,
    JSON.parse(JSON.stringify([custom, custom, undefined])),
  );
  const overhead = Buffer.byteLength(JSON.stringify({ ...base, values: [""] }));
  const exact = [...encodeChunks({ ...base, values: ["x".repeat(maxMessageBytes - overhead)] })];
  assert.equal(exact.length, 1);
  assert.ok(exact[0]);
  assert.equal(Buffer.byteLength(exact[0].message), maxMessageBytes);
  assert.throws(
    () => [...encodeChunks({ ...base, values: ["x".repeat(maxMessageBytes - overhead + 1)] })],
    (error) => error instanceof SewedError && error.code === "Limit",
  );
});

test(
  "split chunks wait for each acknowledgment and retain the final RPC acknowledgment",
  { timeout: 5000 },
  async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let nextBatch = 0;
          const values = ["a", "b", "c", "d"].map((value) => value.repeat(140 * 1024));
          const connection = yield* probe(
            Stream.fromArray(values).pipe(
              Stream.concat(
                Stream.fromEffect(
                  Effect.sync(() => {
                    nextBatch++;
                    return "tail";
                  }),
                ),
              ),
            ),
          );
          connection.request(1);
          for (const [index, value] of values.entries()) {
            const packet = yield* Queue.take(connection.messages);
            assert.equal(packet._tag, "Chunk", JSON.stringify(packet).slice(0, 2000));
            if (packet._tag === "Chunk") assert.deepEqual(packet.values, [value]);
            yield* Effect.sleep(20);
            assert.equal(yield* Queue.size(connection.messages), 0);
            assert.equal(nextBatch, 0);
            if (index === 0) {
              connection.request(2, "echo");
              const other = yield* Queue.take(connection.messages);
              assert.deepEqual(other, {
                _tag: "Exit",
                requestId: 2,
                exit: { _tag: "Success", value: "alive" },
              });
            }
            connection.send({ _tag: "Ack", requestId: 1 });
          }
          const tail = yield* Queue.take(connection.messages);
          assert.equal(tail._tag, "Chunk");
          if (tail._tag === "Chunk") assert.deepEqual(tail.values, ["tail"]);
          assert.equal(nextBatch, 1);
          connection.send({ _tag: "Ack", requestId: 1 });
          const end = yield* Queue.take(connection.messages);
          assert.equal(end._tag, "Exit");
        }),
      ),
    );
  },
);

test(
  "cancellation and disconnection release handlers waiting on a split-chunk acknowledgment",
  { timeout: 5000 },
  async () => {
    for (const action of ["interrupt", "disconnect"] as const) {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const released = yield* Deferred.make<void>();
            const resource = Effect.acquireRelease(Effect.void, () =>
              Deferred.succeed(released, undefined),
            );
            const connection = yield* probe(
              Stream.unwrap(
                Effect.as(resource, Stream.make("x".repeat(140 * 1024), "y".repeat(140 * 1024))),
              ),
            );
            connection.request(1);
            const first = yield* Queue.take(connection.messages);
            assert.equal(first._tag, "Chunk", JSON.stringify(first).slice(0, 2000));
            if (action === "disconnect") connection.close();
            else connection.send({ _tag: "Interrupt", requestId: 1 });
            yield* Deferred.await(released);
            if (action === "interrupt") {
              const ended = yield* Queue.take(connection.messages);
              assert.equal(ended._tag, "Exit");
              connection.request(2, "echo");
              const next = yield* Queue.take(connection.messages);
              assert.equal(next._tag, "Exit");
              if (next._tag === "Exit")
                assert.deepEqual(next.exit, { _tag: "Success", value: "alive" });
            }
          }),
        ),
      );
    }
  },
);

test(
  "stream batches larger than the envelope limit retain every value in order",
  { timeout: 8000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const owner = yield* host(Protocol, handlers);
        yield* Effect.gen(function* () {
          const client = yield* Items();
          let received = 0;
          yield* Stream.runForEach(client.items({ count: 140, size: 140 * 1024 }), (item) =>
            Effect.gen(function* () {
              assert.equal(item.index, received++);
              assert.equal(item.value, "x".repeat(140 * 1024));
              yield* Effect.sleep(1);
            }),
          );
          assert.equal(received, 140);
          assert.equal(yield* client.value({ size: 1 }), "x");
        }).pipe(Effect.provide(Binding.layer([Binding.to(Items, owner)])));
      }),
    );
  },
);

test(
  "oversized response values fail their request while the same client remains usable",
  { timeout: 8000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const owner = yield* host(Protocol, handlers);
        yield* Effect.gen(function* () {
          const client = yield* Items();
          const unary = yield* Effect.exit(client.value({ size: 256 * 1024 }));
          assert.equal(unary._tag, "Failure");
          if (unary._tag === "Failure")
            assert.match(Cause.pretty(unary.cause), /limited to 262144 bytes/);
          assert.equal(yield* client.value({ size: 2 }), "xx");
          const stream = yield* Effect.exit(
            Stream.runDrain(client.items({ count: 1, size: 256 * 1024 })),
          );
          assert.equal(stream._tag, "Failure");
          if (stream._tag === "Failure")
            assert.match(Cause.pretty(stream.cause), /limited to 262144 bytes/);
          assert.equal(yield* client.value({ size: 3 }), "xxx");
        }).pipe(Effect.provide(Binding.layer([Binding.to(Items, owner)])));
      }),
    );
  },
);

test(
  "a forwarded oversized response does not fail an unrelated concurrent request",
  { timeout: 5000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const owner = yield* host(Protocol, handlers);
        const forwarding = Protocol.toLayer(
          Effect.gen(function* () {
            const client = yield* Items();
            return {
              items: (payload) => client.items(payload).pipe(Stream.orDie),
              value: (payload) => client.value(payload).pipe(Effect.orDie),
              delayed: () => client.delayed().pipe(Effect.orDie),
            };
          }),
        ).pipe(Layer.provide(Binding.layer([Binding.to(Items, owner)])));
        const relay = yield* host(Protocol, forwarding);
        yield* Effect.gen(function* () {
          const client = yield* Items();
          const concurrent = yield* client.delayed().pipe(Effect.forkScoped);
          const failure = yield* Effect.exit(
            Stream.runDrain(client.items({ count: 1, size: 256 * 1024 })),
          );
          assert.equal(failure._tag, "Failure");
          if (failure._tag === "Failure")
            assert.match(Cause.pretty(failure.cause), /limited to 262144 bytes/);
          assert.equal(yield* Fiber.join(concurrent), "alive");
          assert.equal(yield* client.value({ size: 1 }), "x");
        }).pipe(Effect.provide(Binding.layer([Binding.to(Items, relay)])));
      }),
    );
  },
);
