import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Deferred, Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Binary from "../lib/Binary.js";
import { makeBound, slot } from "../lib/Binding.js";
import { serveBindings } from "../lib/internal/WorkerBindings.js";
import { encodeBinary } from "../lib/internal/BinaryWire.js";
import { isBytes } from "../lib/internal/Bytes.js";
import { serveConnections } from "../lib/internal/BindingRelay.js";
import type { Connection, Wire } from "../lib/internal/Transport.js";

test("a disconnected caller interrupts dependency connection acquisition before the parent scope closes", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const dependency = slot(
          "relay-pending",
          RpcGroup.make(Rpc.make("value", { success: Schema.Finite })),
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
          RpcGroup.make(Rpc.make("value", { success: Schema.Finite })),
        );
        const started = yield* Deferred.make<void>();
        const ready = yield* Deferred.make<void>();
        const flushed = yield* Deferred.make<void>();
        const messages: Wire[] = [];
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

/**
 * The relay's guard decides whether a packet is a packet, and it runs before the decode that the
 * transport widened to accept another realm's bytes. Asking `instanceof` here would close the
 * connection on a packet the transport beneath it would have read — so the relay asks the same
 * question the transport asks, and this test is what says so.
 *
 * `MainBridge.ts` carries the identical guard over an Electron `MessageChannelMain`, which no unit
 * test can build; it is the same one identifier, held by the compiler.
 */
test("a relayed packet whose bytes another realm made is forwarded, not refused", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const dependency = slot(
          "relay-foreign-realm",
          Binary.protocol(RpcGroup.make(Rpc.make("value", { success: Schema.Finite }))),
        );
        const started = yield* Deferred.make<void>();
        const forwarded = yield* Deferred.make<Uint8Array>();
        let closed = false;
        let receive: ((message: unknown) => void) | undefined;
        const target: Connection = {
          send: (message) => {
            if (typeof message !== "string")
              Deferred.doneUnsafe(forwarded, Effect.succeed(message));
          },
          subscribe: () => () => {},
          close: () => {},
        };
        const serve = yield* serveConnections([
          makeBound(dependency, "foreign-owner", {
            connect: Deferred.succeed(started, undefined).pipe(Effect.as(target)),
          }),
        ]);
        serve(dependency.key, {
          send: () => {},
          subscribe: (callback) => {
            receive = callback;
            return () => {};
          },
          close: () => {
            closed = true;
          },
        });
        yield* Deferred.await(started);
        assert.ok(receive);

        const packet = encodeBinary({ _tag: "Ping" });
        const foreign: unknown = runInNewContext("Uint8Array.from(values)", {
          values: [...packet],
        });
        assert.ok(isBytes(foreign));
        assert.equal(
          foreign instanceof Uint8Array,
          false,
          "the premise: the packet's bytes are not from this realm",
        );

        receive(foreign);
        const relayed = yield* Deferred.await(forwarded).pipe(Effect.timeout("300 millis"));
        assert.deepEqual([...relayed], [...packet], "the packet crossed the relay unchanged");
        assert.equal(closed, false, "the relay did not close the connection");
      }),
    ),
  );
});

/**
 * A packet that parses and names its request, but does not decode, is the endpoint's to fail: the
 * endpoint fails that one request and keeps the connection. A relay that closed on it would end
 * every call on the connection instead, so it forwards it, in both directions. A packet that names
 * nothing still closes the relay. `MainBridge.ts` asks the same question through the same helper.
 */
test("a relay forwards a packet that names the request it fails, and closes on one that names none", async () => {
  // A map keyed by a number: no JSON value, so no packet carrying one is canonical.
  const undecodable = (envelope: Record<string, unknown>) =>
    encodeBinary({ ...envelope, value: new Map([[1, 2]]) });
  const request = undecodable({ _tag: "Request", id: "7", tag: "value", payload: {}, headers: [] });
  const answer = undecodable({ _tag: "Exit", requestId: "7", exit: { _tag: "Success" } });
  const nameless = undecodable({ _tag: "Ping" });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const dependency = slot(
          "relay-undecodable",
          Binary.protocol(RpcGroup.make(Rpc.make("value", { success: Schema.Finite }))),
        );
        const started = yield* Deferred.make<void>();
        const toTarget: unknown[] = [];
        const toSource: unknown[] = [];
        let closed = false;
        let fromSource: ((message: unknown) => void) | undefined;
        let fromTarget: ((message: unknown) => void) | undefined;
        const serve = yield* serveConnections([
          makeBound(dependency, "undecodable-owner", {
            connect: Deferred.succeed(started, undefined).pipe(
              Effect.as({
                send: (message: unknown) => {
                  toTarget.push(message);
                },
                subscribe: (callback: (message: unknown) => void) => {
                  fromTarget = callback;
                  return () => {};
                },
                close: () => {},
              }),
            ),
          }),
        ]);
        serve(dependency.key, {
          send: (message) => {
            toSource.push(message);
          },
          subscribe: (callback) => {
            fromSource = callback;
            return () => {};
          },
          close: () => {
            closed = true;
          },
        });
        yield* Deferred.await(started);
        yield* Effect.yieldNow;
        assert.ok(fromSource && fromTarget);
        fromSource(request);
        fromTarget(answer);
        assert.deepEqual(toTarget, [request], "the request crossed to the owner");
        assert.deepEqual(toSource, [answer], "the answer crossed to the caller");
        assert.equal(closed, false, "the relay did not close the connection");
        fromSource(nameless);
        yield* Effect.yieldNow;
        assert.equal(closed, true, "a packet that names no request closes the relay");
        assert.equal(toTarget.length, 1);
      }),
    ),
  );
});
