import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Exit, Layer, Schema, SchemaGetter, Scope } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { SewedError } from "../lib/index.js";
import { server } from "../lib/Runtime.js";
import { decodeServer, encode, pair } from "../lib/internal/Transport.js";
import { waitUntil } from "./wait.ts";

for (const cancellation of ["interrupt", "disconnect", "owner-close"] as const) {
  test(`${cancellation} finalizes suspended request decoding without running its handler`, async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const gate = yield* Deferred.make<void>();
          let decoding = false;
          let finalized = false;
          const handled: string[] = [];
          const Value = Schema.String.pipe(
            Schema.decodeTo(Schema.String, {
              decode: SchemaGetter.transformEffect((value) =>
                value !== "slow"
                  ? Effect.succeed(value)
                  : Effect.sync(() => {
                      decoding = true;
                    }).pipe(
                      Effect.andThen(Deferred.await(gate)),
                      Effect.as(value),
                      Effect.ensuring(
                        Effect.sync(() => {
                          finalized = true;
                        }),
                      ),
                    ),
              ),
              encode: SchemaGetter.passthrough(),
            }),
          );
          const protocol = RpcGroup.make(
            Rpc.make("check", {
              payload: { value: Value },
              success: Schema.String,
              error: SewedError,
            }),
          );
          const services = yield* Layer.build(
            protocol.toLayer({
              check: ({ value }) =>
                Effect.sync(() => {
                  handled.push(value);
                  return value;
                }),
            }),
          );
          const ownerScope = yield* Scope.make();
          yield* Effect.addFinalizer(() => Scope.close(ownerScope, Exit.void));
          const runtime = yield* server(protocol).pipe(
            Effect.provideContext(services),
            Scope.provide(ownerScope),
          );
          const [slow, accepted] = pair();
          const replies: ReturnType<typeof decodeServer>[] = [];
          slow.subscribe(
            (message) => replies.push(decodeServer(message)),
            () => {},
          );
          runtime.accept(accepted);
          // Send immediately after construction, including the server's startup path.
          slow.send(
            encode({
              _tag: "Request",
              id: 1,
              tag: "check",
              payload: { value: "slow" },
              headers: [],
            }),
          );
          yield* Effect.promise(() => waitUntil(() => decoding, "payload decoding to suspend"));
          if (cancellation === "interrupt") slow.send(encode({ _tag: "Interrupt", requestId: 1 }));
          else if (cancellation === "disconnect") slow.close();
          else yield* Scope.close(ownerScope, Exit.void);
          yield* Effect.promise(() => waitUntil(() => finalized, "payload decoder's finalizer"));
          assert.deepEqual(handled, []);
          if (cancellation === "interrupt") {
            const reply = replies.find((message) => message._tag === "Exit");
            assert.ok(reply?._tag === "Exit" && reply.exit._tag === "Failure");
            assert.equal(reply.exit.cause[0]?._tag, "Interrupt");
          }
          yield* Deferred.succeed(gate, undefined);
          if (cancellation !== "owner-close") {
            const [fast, fastAccepted] = pair();
            let answered = false;
            fast.subscribe(
              (message) => {
                answered = decodeServer(message)._tag === "Exit";
              },
              () => {},
            );
            runtime.accept(fastAccepted);
            fast.send(
              encode({
                _tag: "Request",
                id: 2,
                tag: "check",
                payload: { value: "fast" },
                headers: [],
              }),
            );
            yield* Effect.promise(() =>
              waitUntil(() => answered, "the unrelated request's answer"),
            );
            assert.deepEqual(handled, ["fast"]);
          }
        }),
      ),
    );
  });
}

test("a suspended payload decoder leaves other clients and requests on its own connection usable", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        let decoding = false;
        const Value = Schema.String.pipe(
          Schema.decodeTo(Schema.String, {
            decode: SchemaGetter.transformEffect((value) =>
              value !== "slow"
                ? Effect.succeed(value)
                : Effect.sync(() => {
                    decoding = true;
                  }).pipe(Effect.andThen(Deferred.await(gate)), Effect.as(value)),
            ),
            encode: SchemaGetter.passthrough(),
          }),
        );
        const protocol = RpcGroup.make(
          Rpc.make("check", {
            payload: { value: Value },
            success: Schema.String,
            error: SewedError,
          }),
        );
        const services = yield* Layer.build(
          protocol.toLayer({ check: ({ value }) => Effect.succeed(value) }),
        );
        const runtime = yield* server(protocol).pipe(Effect.provideContext(services));
        const [slow, slowAccepted] = pair();
        const [fast, fastAccepted] = pair();
        const replies: (string | number)[] = [];
        const receive = (message: unknown) => {
          const reply = decodeServer(message);
          if (reply._tag === "Exit") replies.push(reply.requestId);
        };
        slow.subscribe(receive, () => {});
        fast.subscribe(receive, () => {});
        runtime.accept(slowAccepted);
        runtime.accept(fastAccepted);
        slow.send(
          encode({ _tag: "Request", id: 1, tag: "check", payload: { value: "slow" }, headers: [] }),
        );
        yield* Effect.promise(() => waitUntil(() => decoding, "payload decoding to suspend"));
        slow.send(
          encode({
            _tag: "Request",
            id: 2,
            tag: "check",
            payload: { value: "same connection" },
            headers: [],
          }),
        );
        fast.send(
          encode({
            _tag: "Request",
            id: 3,
            tag: "check",
            payload: { value: "other client" },
            headers: [],
          }),
        );
        yield* Effect.promise(() =>
          waitUntil(() => replies.includes(2) && replies.includes(3), "both unrelated answers"),
        );
        assert.equal(replies.includes(1), false);
        yield* Deferred.succeed(gate, undefined);
        yield* Effect.promise(() =>
          waitUntil(() => replies.includes(1), "the decoded request's answer"),
        );
      }),
    ),
  );
});

test("an interrupted decoder that finishes an uninterruptible section cannot dispatch a late handler", async () => {
  let handled = false;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        let decoding = false;
        let finalized = false;
        const Value = Schema.String.pipe(
          Schema.decodeTo(Schema.String, {
            decode: SchemaGetter.transformEffect((value) =>
              Effect.sync(() => {
                decoding = true;
              }).pipe(
                Effect.andThen(Deferred.await(gate)),
                Effect.as(value),
                Effect.uninterruptible,
                Effect.ensuring(
                  Effect.sync(() => {
                    finalized = true;
                  }),
                ),
              ),
            ),
            encode: SchemaGetter.passthrough(),
          }),
        );
        const protocol = RpcGroup.make(
          Rpc.make("check", {
            payload: { value: Value },
            success: Schema.Void,
            error: SewedError,
          }),
        );
        const services = yield* Layer.build(
          protocol.toLayer({
            check: () =>
              Effect.sync(() => {
                handled = true;
              }),
          }),
        );
        const runtime = yield* server(protocol).pipe(Effect.provideContext(services));
        const [client, accepted] = pair();
        runtime.accept(accepted);
        client.send(
          encode({ _tag: "Request", id: 1, tag: "check", payload: { value: "slow" }, headers: [] }),
        );
        yield* Effect.promise(() => waitUntil(() => decoding, "the uninterruptible decoder"));
        client.send(encode({ _tag: "Interrupt", requestId: 1 }));
        yield* Deferred.succeed(gate, undefined);
        yield* Effect.promise(() =>
          waitUntil(() => finalized, "the decoder to leave its uninterruptible section"),
        );
      }),
    ),
  );
  assert.equal(handled, false);
});

test("reusing a cancelled queued request's id cannot dispatch its old payload", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const handled: string[] = [];
        const protocol = RpcGroup.make(
          Rpc.make("check", {
            payload: { value: Schema.String },
            success: Schema.String,
            error: SewedError,
          }),
        );
        const services = yield* Layer.build(
          protocol.toLayer({
            check: ({ value }) =>
              Effect.sync(() => {
                handled.push(value);
                return value;
              }),
          }),
        );
        const runtime = yield* server(protocol).pipe(Effect.provideContext(services));
        const [client, accepted] = pair();
        runtime.accept(accepted);
        client.send(
          encode({ _tag: "Request", id: 1, tag: "check", payload: { value: "old" }, headers: [] }),
        );
        client.send(encode({ _tag: "Interrupt", requestId: 1 }));
        client.send(
          encode({ _tag: "Request", id: 1, tag: "check", payload: { value: "new" }, headers: [] }),
        );
        yield* Effect.promise(() =>
          waitUntil(() => handled.length > 0, "the replacement request's handler"),
        );
        assert.deepEqual(handled, ["new"]);
      }),
    ),
  );
});

test("ids that differ only by type name different requests on one connection", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const protocol = RpcGroup.make(
          Rpc.make("check", {
            payload: { value: Schema.String },
            success: Schema.String,
            error: SewedError,
          }),
        );
        const services = yield* Layer.build(
          protocol.toLayer({
            check: ({ value }) => Effect.as(Deferred.await(gate), value),
          }),
        );
        const runtime = yield* server(protocol).pipe(Effect.provideContext(services));
        const [client, accepted] = pair();
        const answers = new Map<string | number, unknown>();
        let closed = false;
        client.subscribe(
          (message) => {
            const decoded = decodeServer(message);
            if (decoded._tag === "Exit") answers.set(decoded.requestId, decoded.exit);
          },
          () => {
            closed = true;
          },
        );
        runtime.accept(accepted);
        for (const id of [1, "1"])
          client.send(
            encode({
              _tag: "Request",
              id,
              tag: "check",
              payload: { value: typeof id },
              headers: [],
            }),
          );
        // Interrupting the string id leaves the numeric request with its handler.
        client.send(encode({ _tag: "Interrupt", requestId: "1" }));
        yield* Effect.promise(() => waitUntil(() => answers.has("1"), "the interrupted answer"));
        yield* Deferred.succeed(gate, undefined);
        yield* Effect.promise(() => waitUntil(() => answers.has(1), "the numeric answer"));
        assert.equal(closed, false);
        assert.deepEqual(answers.get(1), { _tag: "Success", value: "number" });
        assert.deepEqual(answers.get("1"), {
          _tag: "Failure",
          cause: [{ _tag: "Interrupt", fiberId: null }],
        });
      }),
    ),
  );
});
