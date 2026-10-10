import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Exit, Layer, Schema, SchemaGetter, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binary, SewedError } from "../lib/index.js";
import { server } from "../lib/Runtime.js";
import { decodeServer, encode, pair } from "../lib/internal/Transport.js";

const protocol = RpcGroup.make(
  Rpc.make("echo", {
    payload: { value: Schema.String },
    success: Schema.String,
    error: SewedError,
  }),
);

const request = (value: string, id = 1) =>
  encode({ _tag: "Request", id, tag: "echo", payload: { value }, headers: [] });

test("a disconnected startup queue cannot consume another client's pending byte budget", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const handled: string[] = [];
        const services = yield* Layer.build(
          protocol.toLayer({
            echo: ({ value }) =>
              Effect.sync(() => {
                handled.push(value);
                return value;
              }),
          }),
        );
        const stale = request("x".repeat(1024));
        const runtime = yield* server(protocol, {
          maxPendingBytes: Buffer.byteLength(stale),
        }).pipe(Effect.provideContext(services));
        const [hostile, accepted] = pair();
        hostile.send("malformed");
        hostile.send(stale);
        runtime.accept(accepted);

        const [healthy, healthyAccepted] = pair();
        const answered = yield* Deferred.make<ReturnType<typeof decodeServer>>();
        healthy.subscribe(
          (message) => Deferred.doneUnsafe(answered, Effect.succeed(decodeServer(message))),
          () => {},
        );
        runtime.accept(healthyAccepted);
        healthy.send(request("healthy", 2));
        const reply = yield* Deferred.await(answered).pipe(Effect.timeout("1 second"));
        assert.ok(reply._tag === "Exit" && reply.exit._tag === "Success");
        assert.equal(reply.exit.value, "healthy");
        assert.deepEqual(handled, ["healthy"]);
      }),
    ),
  );
});

test("a synchronous close during subscription setup releases the returned subscription once", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(
          protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) }),
        );
        const ownerScope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(ownerScope, Exit.void));
        const runtime = yield* server(protocol).pipe(
          Effect.provideContext(services),
          Scope.provide(ownerScope),
        );
        let unsubscribed = 0;
        let closed = 0;
        runtime.accept({
          send: () => {},
          subscribe: (_receive, close) => {
            close(new SewedError({ code: "Closed", message: "already closed" }));
            return () => {
              unsubscribed++;
            };
          },
          close: () => {
            closed++;
          },
        });
        assert.equal(unsubscribed, 1);
        assert.equal(closed, 1);
        yield* Scope.close(ownerScope, Exit.void);
        assert.equal(unsubscribed, 1);
        assert.equal(closed, 1);
      }),
    ),
  );
});

test("owner shutdown settles decoding, active handlers, streams, and unacknowledged bulk answers together", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const decoding = yield* Deferred.make<void>();
        const handling = yield* Deferred.make<void>();
        const streamed = yield* Deferred.make<void>();
        const fragmented = yield* Deferred.make<void>();
        const gate = yield* Deferred.make<void>();
        const counts = { decodedHandlers: 0, decoders: 0, handlers: 0, streams: 0, closed: 0 };
        const Value = Schema.String.pipe(
          Schema.decodeTo(Schema.String, {
            decode: SchemaGetter.transformEffect((value) =>
              Deferred.succeed(decoding, undefined).pipe(
                Effect.andThen(Deferred.await(gate)),
                Effect.as(value),
                Effect.ensuring(Effect.sync(() => counts.decoders++)),
              ),
            ),
            encode: SchemaGetter.passthrough(),
          }),
        );
        const mixed = Binary.protocol(
          RpcGroup.make(
            Rpc.make("decode", { payload: { value: Value }, success: Schema.Void }),
            Rpc.make("pending", { success: Schema.Void }),
            Rpc.make("values", { success: Schema.String, stream: true }),
            Binary.bulkAnswer(Rpc.make("answer", { success: Schema.String }), {
              maxBytes: 1024 * 1024,
            }),
            Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
          ),
        );
        const services = yield* Layer.build(
          mixed.toLayer({
            decode: () => Effect.sync(() => counts.decodedHandlers++).pipe(Effect.asVoid),
            pending: () =>
              Deferred.succeed(handling, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.ensuring(Effect.sync(() => counts.handlers++)),
              ),
            values: () =>
              Stream.make("first").pipe(
                Stream.concat(Stream.never),
                Stream.ensuring(Effect.sync(() => counts.streams++)),
              ),
            answer: () => Effect.succeed("x".repeat(512 * 1024)),
            echo: ({ value }) => Effect.succeed(value),
          }),
        );
        const ownerScope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(ownerScope, Exit.void));
        const runtime = yield* server(mixed).pipe(
          Effect.provideContext(services),
          Scope.provide(ownerScope),
        );
        const [client, accepted] = pair();
        const frames: ReturnType<typeof decodeServer>[] = [];
        const answered = yield* Deferred.make<string>();
        client.subscribe(
          (message) => {
            const frame = decodeServer(message, "binary");
            frames.push(frame);
            if (frame._tag === "Chunk") Deferred.doneUnsafe(streamed, Effect.void);
            if (frame._tag === "AnswerPart") Deferred.doneUnsafe(fragmented, Effect.void);
            if (frame._tag === "Exit" && frame.requestId === 5 && frame.exit._tag === "Success")
              Deferred.doneUnsafe(answered, Effect.succeed(String(frame.exit.value)));
          },
          () => counts.closed++,
        );
        runtime.accept(accepted);
        const send = (id: number, tag: string, payload: unknown) =>
          client.send(encode({ _tag: "Request", id, tag, payload, headers: [] }, "binary"));
        send(1, "decode", { value: "slow" });
        send(2, "pending", null);
        send(3, "values", null);
        send(4, "answer", null);
        yield* Effect.all([
          Deferred.await(decoding),
          Deferred.await(handling),
          Deferred.await(streamed),
          Deferred.await(fragmented),
        ]).pipe(Effect.timeout("2 seconds"));
        send(5, "echo", { value: "healthy" });
        assert.equal(yield* Deferred.await(answered).pipe(Effect.timeout("2 seconds")), "healthy");
        yield* Scope.close(ownerScope, Exit.void).pipe(Effect.timeout("2 seconds"));
        assert.deepEqual(counts, {
          decodedHandlers: 0,
          decoders: 1,
          handlers: 1,
          streams: 1,
          closed: 1,
        });
        const frameCount = frames.length;
        yield* Deferred.succeed(gate, undefined);
        yield* Scope.close(ownerScope, Exit.void);
        assert.equal(frames.length, frameCount);
        assert.equal(counts.decodedHandlers, 0);
        assert.equal(counts.closed, 1);
      }),
    ),
  );
});
