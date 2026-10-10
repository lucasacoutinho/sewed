import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, Capability, SewedError } from "../lib/index.js";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import * as Testing from "../lib/Testing.js";
import { decodeClient, decodeServer, pair, type Connection } from "../lib/internal/Transport.js";
import { waitUntil } from "./wait.ts";

/**
 * Two ordinary operations — one request/response, one a stream — over the same shared connection
 * `bulk.test.ts` exercises for the bulk case. Nothing here declares a bulk field: this file is
 * about a request the transport never gates, so a lost connection has to answer for it directly.
 */
const Echo = Rpc.make("echo", {
  payload: { value: Schema.String },
  success: Schema.String,
  error: SewedError,
});
const Counting = Rpc.make("counting", {
  payload: { count: Schema.Int },
  success: Schema.Number,
  error: SewedError,
  stream: true,
});
const protocol = RpcGroup.make(Echo, Counting);
const Service = Capability.define("transport-loss", protocol);

const handlers = protocol.toLayer({
  echo: ({ value }) => Effect.succeed(value),
  counting: ({ count }) => Stream.fromEffectRepeat(Effect.succeed(1)).pipe(Stream.take(count)),
});

const failureOf = (exit: Exit.Exit<unknown, unknown>): SewedError | undefined => {
  if (Exit.isSuccess(exit)) return undefined;
  const error: unknown = Cause.squash(exit.cause);
  return error instanceof SewedError ? error : undefined;
};

interface Tap {
  /** Every packet's tag, in the order it crossed the wire, both directions. */
  readonly frames: string[];
  readonly live: Connection[];
  /** While true the owner's packets are recorded but withheld from the client. */
  hold: boolean;
  /**
   * The tag of the next `Request` whose own `send` should close the connection before the bytes
   * leave — a request "held before send": registered in `clientProtocol`'s own bookkeeping, its
   * `sent` flag still false, because the connection dies inside this very call.
   */
  closeOnSend: string | undefined;
  /**
   * The tag of the next `Request` whose own `send` should close the connection right AFTER the
   * bytes left — still nested inside the same `connection.send` call, before `clientProtocol`'s
   * own `Effect.tap` ever flips `sent` to true (T1/T5).
   */
  closeAfterSend: string | undefined;
  readonly release: () => void;
}

/**
 * One owner over a raw connection pair, mirroring `bulk.test.ts`'s own `tapped()` for a plain
 * (non-bulk) protocol: the tap is a `Connection` around the client end, so the client under test
 * is the real `Capability.client` over the real transport.
 */
const tapped = () =>
  Effect.gen(function* () {
    const frames: string[] = [];
    const live: Connection[] = [];
    const held: (() => void)[] = [];
    const tap: Tap = {
      frames,
      live,
      hold: false,
      closeOnSend: undefined,
      closeAfterSend: undefined,
      release: () => {
        for (const deliver of held.splice(0)) deliver();
      },
    };
    const services = yield* Layer.build(handlers);
    const runtime = yield* server(protocol, { ownerId: "transport-loss" }).pipe(
      Effect.provideContext(services),
    );
    const owner = makeOwner(
      "transport-loss",
      protocol,
      {
        connect: scopedConnection(() => {
          const [client, accepted] = pair();
          runtime.accept(accepted);
          const connection: Connection = {
            send: (message) => {
              const packet = decodeClient(message);
              frames.push(packet._tag);
              if (
                packet._tag === "Request" &&
                tap.closeOnSend !== undefined &&
                packet.tag === tap.closeOnSend
              ) {
                tap.closeOnSend = undefined;
                client.close();
              }
              client.send(message);
              if (
                packet._tag === "Request" &&
                tap.closeAfterSend !== undefined &&
                packet.tag === tap.closeAfterSend
              ) {
                tap.closeAfterSend = undefined;
                client.close();
              }
            },
            subscribe: (receive, close) =>
              client.subscribe((message) => {
                frames.push(decodeServer(message)._tag);
                if (tap.hold) held.push(() => receive(message));
                else receive(message);
              }, close),
            close: () => client.close(),
          };
          live.push(connection);
          return connection;
        }),
      },
      {},
    );
    return { tap, owner };
  });

const overTap = <A, E>(use: (tap: Tap) => Effect.Effect<A, E, typeof Service | Scope.Scope>) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const { tap, owner } = yield* tapped();
        return yield* use(tap).pipe(
          Effect.provide(Capability.client(Service)),
          Effect.provide(Binding.layer([Binding.to(Service.slot, owner)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );

test("an ordinary request whose connection dies as it is being sent answers Closed, reason transport/closed-before-send", async () => {
  const exit = await overTap((tap) =>
    Effect.gen(function* () {
      const service = yield* Service;
      tap.closeOnSend = "echo";
      return yield* service.echo({ value: "hello" });
    }),
  );
  assert.ok(Exit.isFailure(exit), "the request should not have succeeded");
  const error = failureOf(exit);
  assert.equal(error?.code, "Closed", String(error));
  assert.equal(error?.message, "Connection closed before the request was sent");
  assert.equal(error?.reason, "transport/closed-before-send");
});

test("an ordinary request that was sent, whose answer is withheld, answers Unknown once the connection is lost", async () => {
  const exit = await overTap((tap) =>
    Effect.gen(function* () {
      const service = yield* Service;
      tap.hold = true;
      const call = yield* service.echo({ value: "hello" }).pipe(Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(
          () => tap.frames.includes("Exit"),
          "the owner's answer to arrive and be withheld",
        ),
      );
      tap.live[0]?.close();
      return yield* Fiber.await(call);
    }),
  );
  assert.ok(Exit.isSuccess(exit), "the test program itself failed");
  const failed = exit.value;
  assert.ok(Exit.isFailure(failed), "the request should not have succeeded");
  const error = failureOf(failed);
  assert.equal(error?.code, "Unknown", String(error));
  assert.equal(
    error?.message,
    "Connection lost after the request was sent; whether it was handled is unknown",
  );
  assert.equal(error?.reason, "transport/lost-after-send");
});

test("a stream in flight when the connection is lost answers Unknown", async () => {
  const exit = await overTap((tap) =>
    Effect.gen(function* () {
      const service = yield* Service;
      tap.hold = true;
      const seen: number[] = [];
      const call = yield* service.counting({ count: 1000 }).pipe(
        Stream.runForEach((value) => Effect.sync(() => seen.push(value))),
        Effect.forkScoped,
      );
      yield* Effect.promise(() =>
        waitUntil(() => tap.frames.includes("Chunk"), "the first chunk to arrive and be withheld"),
      );
      tap.live[0]?.close();
      const result = yield* Fiber.await(call);
      return { result, seen };
    }),
  );
  assert.ok(Exit.isSuccess(exit), "the test program itself failed");
  const { result, seen } = exit.value;
  assert.ok(Exit.isFailure(result), "the stream should not have completed");
  const error = failureOf(result);
  assert.equal(error?.code, "Unknown", String(error));
  assert.equal(error?.reason, "transport/lost-after-send");
  // The withheld chunk never reached the observer: only the connection's own loss did.
  assert.deepEqual(seen, []);
});

test("after the loss the shared client is evicted, and the next call reconnects over a fresh connection", async () => {
  const exit = await overTap((tap) =>
    Effect.gen(function* () {
      const service = yield* Service;
      tap.closeOnSend = "echo";
      const first = yield* Effect.exit(service.echo({ value: "one" }));
      assert.ok(Exit.isFailure(first));
      assert.equal(tap.live.length, 1, "one connection was opened for the failed call");
      const second = yield* service.echo({ value: "two" });
      assert.equal(second, "two");
      assert.equal(tap.live.length, 2, "the next call opened a fresh connection, not the dead one");
      return { first, second };
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
});

test("a first request on a fresh shared client, lost right after its bytes left in the same turn, still answers typed Closed", async () => {
  // Reproduces the final review's T1 sequence exactly: nothing has used this shared client
  // before, so `RpcClient.make`'s own run fiber has not registered a `write` callback yet when
  // the connection dies — still inside the same synchronous `connection.send` call the request's
  // bytes just crossed. Before `openClient`'s post-`RpcClient.make` yield, that combination left
  // the caller with a bare `Cause([Interrupt])` instead of a typed answer.
  const exit = await overTap((tap) =>
    Effect.gen(function* () {
      const service = yield* Service;
      tap.closeAfterSend = "echo";
      const failed = yield* Effect.exit(service.echo({ value: "hello" }));
      const again = yield* service.echo({ value: "again" });
      return { failed, again, live: tap.live.length };
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
  const { failed, again, live } = exit.value;
  assert.ok(Exit.isFailure(failed), "the first call should not have succeeded");
  const error = failureOf(failed);
  // The transport's own `sent` flag has not flipped yet when this loss reaches `fail`: the close
  // happens synchronously, nested inside this same `connection.send` call, strictly before the
  // `Effect.tap` that flips it ever runs (T5) — so this answers Closed, not Unknown, even though
  // the bytes already left over this in-process `pair()` connection. What T1 fixes is that this
  // is a typed `SewedError` at all, rather than a bare interruption.
  assert.equal(error?.code, "Closed", String(error));
  assert.equal(error?.reason, "transport/closed-before-send");
  assert.equal(again, "again");
  assert.equal(live, 2, "the next call reconnected over a fresh connection");
});

test("a follow-up call made inside the failed caller's own continuation reconnects instead of finding the dead client", async () => {
  // Reproduces the final review's T2 sequence: `write`'s resume can run the suspended caller's
  // own continuation inline, nested in `fail`'s own call stack — so a follow-up call that
  // continuation makes runs before `fail` returns. Before `onFailure` ran ahead of the delivery
  // loops, that follow-up still found the doomed shared client and failed `Closed` instead of
  // reconnecting.
  const exit = await overTap((tap) =>
    Effect.gen(function* () {
      const service = yield* Service;
      tap.hold = true;
      const call = yield* service.echo({ value: "hello" }).pipe(
        Effect.exit,
        Effect.flatMap((first) =>
          Effect.map(Effect.exit(service.echo({ value: "again" })), (again) => ({
            first,
            again,
            liveAtFollowUp: tap.live.length,
          })),
        ),
        Effect.forkScoped,
      );
      yield* Effect.promise(() =>
        waitUntil(
          () => tap.frames.includes("Exit"),
          "the owner's answer to arrive and be withheld",
        ),
      );
      tap.hold = false;
      tap.live[0]?.close();
      const result = yield* Fiber.join(call);
      return { ...result, liveAtEnd: tap.live.length };
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
  const { first, again, liveAtFollowUp, liveAtEnd } = exit.value;
  const firstError = failureOf(first);
  assert.equal(firstError?.code, "Unknown", String(firstError));
  assert.ok(Exit.isSuccess(again), `the follow-up should have reconnected, got ${String(again)}`);
  assert.equal(
    liveAtFollowUp,
    2,
    "the follow-up already saw a fresh connection while still inside the failed call's own continuation",
  );
  assert.equal(liveAtEnd, 2);
});
