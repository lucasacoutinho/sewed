import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { test } from "node:test";
import { Deferred, Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { makeBound, slot } from "../lib/Binding.js";
import { serveBindings } from "../lib/internal/WorkerBindings.js";
import { serveConnections } from "../lib/internal/BindingRelay.js";
import type { Connection } from "../lib/internal/Transport.js";

test("a disconnected caller interrupts dependency connection acquisition before the parent scope closes", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const dependency = slot(
          "relay-pending",
          RpcGroup.make(Rpc.make("value", { success: Schema.Number })),
        );
        const started = yield* Deferred.make<void>();
        const released = yield* Deferred.make<void>();
        const serve = yield* serveBindings([
          makeBound(dependency, "pending-owner", {
            connect: Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(Deferred.succeed(released, undefined)),
            ),
          }),
        ]);
        const channel = yield* Effect.acquireRelease(
          Effect.sync(() => new MessageChannel()),
          ({ port1, port2 }) =>
            Effect.sync(() => {
              port1.close();
              port2.close();
            }),
        );
        serve({ _tag: "Open", key: dependency.key, port: channel.port1 });
        yield* Deferred.await(started);
        channel.port2.close();
        const exit = yield* Deferred.await(released).pipe(
          Effect.timeout("300 millis"),
          Effect.exit,
        );
        assert.equal(
          exit._tag,
          "Success",
          "the pending connection outlived its disconnected caller",
        );
      }),
    ),
  );
});

test("validated messages arriving during connection setup retain their order", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const dependency = slot(
          "relay-buffered",
          RpcGroup.make(Rpc.make("value", { success: Schema.Number })),
        );
        const started = yield* Deferred.make<void>();
        const ready = yield* Deferred.make<void>();
        const flushed = yield* Deferred.make<void>();
        const messages: string[] = [];
        let receive: ((message: unknown) => void) | undefined;
        const target: Connection = {
          send: (message) => {
            messages.push(message);
            if (messages.length === 2) Deferred.doneUnsafe(flushed, Effect.void);
          },
          subscribe: () => () => {},
          close: () => {},
        };
        const serve = yield* serveConnections([
          makeBound(dependency, "buffered-owner", {
            connect: Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(ready)),
              Effect.as(target),
            ),
          }),
        ]);
        serve(dependency.key, {
          send: () => {},
          subscribe: (callback) => {
            receive = callback;
            return () => {};
          },
          close: () => {},
        });
        yield* Deferred.await(started);
        assert.ok(receive);
        const first = JSON.stringify({ _tag: "Ping" });
        const second = JSON.stringify({ _tag: "Ack", requestId: "1" });
        receive(first);
        receive(second);
        assert.deepEqual(messages, []);
        yield* Deferred.succeed(ready, undefined);
        yield* Deferred.await(flushed).pipe(Effect.timeout("300 millis"));
        assert.deepEqual(messages, [first, second]);
      }),
    ),
  );
});
