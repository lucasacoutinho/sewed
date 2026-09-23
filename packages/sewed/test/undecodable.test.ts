import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binary, Binding, Capability, SewedError } from "../lib/index.js";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import * as Testing from "../lib/Testing.js";
import { encodeBinary } from "../lib/internal/BinaryWire.js";
import {
  decodeClient,
  decodeServer,
  maxMessageBytes,
  pair,
  type Connection,
  type Wire,
} from "../lib/internal/Transport.js";
import { waitUntil } from "./wait.ts";

/**
 * One message that fails to decode fails the one call it names, typed, and leaves the connection
 * and every other call on it alone. The RPC codecs refuse to encode a value that is not JSON, so
 * the undecodable message is made on the wire: `poison` rewrites the marker string wherever a
 * packet carries it — a fixstr — as the same string one character shorter under a `str8` header.
 * The packet keeps its length, still parses, still names its request, and is no longer the one
 * encoding of its value, which is what the canonical check refuses.
 */
const marker = "__MARK__";
/** A map keyed by a number: no JSON value, so no packet carrying one is canonical. */
const numberKeyed = () => new Map([[1, 2]]);
const fixstr = Uint8Array.from([0xa0 | marker.length, ...new TextEncoder().encode(marker)]);
const str8 = Uint8Array.from([
  0xd9,
  marker.length - 1,
  ...new TextEncoder().encode(marker.slice(1)),
]);
const poison = (message: Wire, poisoned: { count: number }): Wire => {
  if (typeof message === "string") return message;
  const at = Buffer.from(message.buffer, message.byteOffset, message.byteLength).indexOf(fixstr);
  if (at < 0) return message;
  const copy = Uint8Array.from(message);
  copy.set(str8, at);
  poisoned.count++;
  return copy;
};

const protocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("echo", {
      payload: { value: Schema.Unknown },
      success: Schema.Unknown,
      error: SewedError,
    }),
    Rpc.make("answer", { success: Schema.Unknown, error: SewedError }),
    Rpc.make("slow", {
      payload: { value: Schema.String },
      success: Schema.String,
      error: SewedError,
    }),
    Rpc.make("values", { success: Schema.Unknown, error: SewedError, stream: true }),
    Binary.bulkAnswer(
      Rpc.make("big", { success: Schema.Array(Schema.Unknown), error: SewedError }),
      { maxBytes: 4 * 1024 * 1024 },
    ),
    Binary.bulk(
      Rpc.make("upload", {
        payload: { content: Binary.Bytes, extra: Schema.Unknown },
        success: Schema.Number,
        error: SewedError,
      }),
      { field: "content", maxBytes: 4 * 1024 * 1024 },
    ),
  ),
);
const Calls = Capability.define("undecodable", protocol);

interface Tap {
  /** Every connection the client opened. */
  readonly live: Connection[];
  /** Opens `slow`'s gate. */
  readonly open: () => void;
  /** Resolves when the owner finalizes `values`' stream. */
  readonly streamEnded: Deferred.Deferred<void>;
  /** How many packets `poison` rewrote, either direction. */
  readonly poisoned: { count: number };
  /** The tags of the requests the client has sent, in order. */
  readonly requests: string[];
  /** Replaces an owner packet before the client receives it; `poison` by default. */
  answer: (message: Wire) => Wire;
}

const failureOf = (exit: Exit.Exit<unknown, unknown>): SewedError | undefined => {
  if (Exit.isSuccess(exit)) return undefined;
  const error: unknown = Cause.squash(exit.cause);
  return error instanceof SewedError ? error : undefined;
};

const overTap = <A, E>(use: (tap: Tap) => Effect.Effect<A, E, typeof Calls>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const live: Connection[] = [];
        const gate = Deferred.makeUnsafe<void>();
        const streamEnded = Deferred.makeUnsafe<void>();
        const poisoned = { count: 0 };
        const requests: string[] = [];
        const tap: Tap = {
          live,
          open: () => Deferred.doneUnsafe(gate, Effect.void),
          streamEnded,
          poisoned,
          requests,
          answer: (message) => poison(message, poisoned),
        };
        const services = yield* Layer.build(
          protocol.toLayer({
            echo: ({ value }) => Effect.succeed(value),
            answer: () => Effect.succeed(marker),
            slow: ({ value }) => Deferred.await(gate).pipe(Effect.as(value)),
            values: () =>
              Stream.make<unknown[]>(1, marker, 3).pipe(
                Stream.rechunk(1),
                Stream.concat(Stream.never),
                Stream.ensuring(Deferred.succeed(streamEnded, undefined)),
              ),
            big: () =>
              Effect.succeed([
                ...Array.from({ length: 20_000 }, (_, index) => ({ index, text: "x".repeat(20) })),
                marker,
              ]),
            upload: ({ content }) => Effect.succeed(content.byteLength),
          }),
        );
        const runtime = yield* server(protocol, { ownerId: "undecodable" }).pipe(
          Effect.provideContext(services),
        );
        const owner = makeOwner(
          "undecodable",
          protocol,
          {
            connect: scopedConnection(() => {
              const [client, accepted] = pair();
              runtime.accept(accepted);
              const connection: Connection = {
                send: (message) => {
                  // A packet a test hand-built to be undecodable is sent all the same.
                  const packet = Effect.runSync(
                    Effect.option(Effect.try(() => decodeClient(message, "binary"))),
                  );
                  if (packet._tag === "Some" && packet.value._tag === "Request")
                    requests.push(packet.value.tag);
                  client.send(poison(message, poisoned));
                },
                subscribe: (receive, close) =>
                  client.subscribe((message) => receive(tap.answer(message)), close),
                close: () => client.close(),
              };
              live.push(connection);
              return connection;
            }),
          },
          {},
        );
        return yield* use(tap).pipe(
          Effect.provide(Capability.client(Calls)),
          Effect.provide(Binding.layer([Binding.to(Calls.slot, owner)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );

/** Runs `bad` while `slow` is in flight on the same connection, and finishes `slow` after it. */
const alongside = (
  tap: Tap,
  bad: Effect.Effect<unknown, unknown, typeof Calls>,
): Effect.Effect<
  { readonly bad: Exit.Exit<unknown, unknown>; readonly slow: Exit.Exit<string, unknown> },
  never,
  typeof Calls
> =>
  Effect.gen(function* () {
    const calls = yield* Calls;
    const slow = yield* calls.slow({ value: "beside" }).pipe(Effect.exit, Effect.forkScoped);
    const failed = yield* Effect.exit(bad);
    tap.open();
    return { bad: failed, slow: yield* Fiber.join(slow) };
  });

const assertOneCallFailed = (
  tap: Tap,
  result: { readonly bad: Exit.Exit<unknown, unknown>; readonly slow: Exit.Exit<string, unknown> },
  reason: string,
  poisoned = 1,
) => {
  const error = failureOf(result.bad);
  assert.equal(error?.code, "Protocol", String(error));
  assert.equal(error?.reason, reason);
  assert.ok(Exit.isSuccess(result.slow), `the call beside it failed: ${String(result.slow)}`);
  assert.equal(Exit.isSuccess(result.slow) ? result.slow.value : undefined, "beside");
  assert.equal(tap.live.length, 1, "the connection was replaced");
  assert.equal(
    tap.poisoned.count,
    poisoned,
    "the marker was not rewritten as many times as expected",
  );
};

test("an answer that fails the canonical check fails its own call, and a concurrent call succeeds", async () => {
  await overTap((tap) =>
    Effect.gen(function* () {
      const calls = yield* Calls;
      const result = yield* alongside(tap, calls.answer());
      assertOneCallFailed(tap, result, "transport/undecodable-answer");
      // The connection still carries new calls.
      assert.deepEqual(yield* calls.echo({ value: { a: 1 } }), { a: 1 });
      assert.equal(tap.live.length, 1);
    }),
  );
});

test("an answer that parses but fails the envelope schema fails its own call", async () => {
  await overTap((tap) =>
    Effect.gen(function* () {
      const calls = yield* Calls;
      tap.answer = (message) => {
        const packet = decodeServer(message, "binary");
        return packet._tag === "Exit" && packet.exit._tag === "Success" && packet.exit.value === "x"
          ? encodeBinary({ _tag: "Exit", requestId: packet.requestId, exit: { _tag: "Bogus" } })
          : message;
      };
      const result = yield* alongside(tap, calls.echo({ value: "x" }));
      assertOneCallFailed(tap, result, "transport/undecodable-answer", 0);
    }),
  );
});

test("an undecodable stream value fails its stream, and the owner stops producing", async () => {
  await overTap((tap) =>
    Effect.gen(function* () {
      const calls = yield* Calls;
      const received: unknown[] = [];
      const result = yield* alongside(
        tap,
        calls.values().pipe(Stream.runForEach((value) => Effect.sync(() => received.push(value)))),
      );
      assertOneCallFailed(tap, result, "transport/undecodable-answer");
      assert.deepEqual(received, [1]);
      yield* Deferred.await(tap.streamEnded).pipe(Effect.timeout("5 seconds"));
    }),
  );
});

test("a bulk answer whose assembled packet fails to decode fails its own call", async () => {
  await overTap((tap) =>
    Effect.gen(function* () {
      const calls = yield* Calls;
      const result = yield* alongside(tap, calls.big());
      assertOneCallFailed(tap, result, "transport/undecodable-answer");
      assert.equal(yield* calls.echo({ value: 7 }), 7);
    }),
  );
});

test("a request the owner cannot decode fails its own call typed, the handler not run", async () => {
  await overTap((tap) =>
    Effect.gen(function* () {
      const calls = yield* Calls;
      const result = yield* alongside(tap, calls.echo({ value: marker }));
      assertOneCallFailed(tap, result, "transport/undecodable-request");
      assert.equal(yield* calls.echo({ value: "after" }), "after");
    }),
  );
});

test("an assembled bulk request the owner cannot decode fails its own call typed", async () => {
  await overTap((tap) =>
    Effect.gen(function* () {
      const calls = yield* Calls;
      const content = new Uint8Array(1024 * 1024).fill(3);
      const result = yield* alongside(tap, calls.upload({ content, extra: marker }));
      assertOneCallFailed(tap, result, "transport/undecodable-request");
      assert.equal(yield* calls.upload({ content, extra: null }), content.byteLength);
    }),
  );
});

test("a packet that cannot be attributed still fails the connection", async () => {
  for (const [label, packet] of [
    ["malformed", () => new Uint8Array([0xc1])],
    [
      "naming no tracked request",
      () =>
        encodeBinary({
          _tag: "Exit",
          requestId: "untracked",
          exit: { _tag: "Success", value: numberKeyed() },
        }),
    ],
  ] as const) {
    await overTap((tap) =>
      Effect.gen(function* () {
        const calls = yield* Calls;
        const slow = yield* calls.slow({ value: "beside" }).pipe(Effect.exit, Effect.forkScoped);
        yield* Effect.promise(() =>
          waitUntil(() => tap.requests.includes("slow"), "slow to be sent"),
        );
        let sent = false;
        tap.answer = (message) => {
          if (sent) return message;
          sent = true;
          return packet();
        };
        // An ordinary answer carries the substituted packet in its place.
        yield* calls.echo({ value: 1 }).pipe(Effect.exit);
        const error = failureOf(yield* Fiber.join(slow));
        assert.equal(error?.code, "Unknown", `${label}: ${String(error)}`);
        assert.equal(error?.reason, "transport/lost-after-send", label);
      }),
    );
  }
});

test("a request packet naming no request id still closes its connection", async () => {
  await overTap((tap) =>
    Effect.gen(function* () {
      const calls = yield* Calls;
      const slow = yield* calls.slow({ value: "beside" }).pipe(Effect.exit, Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(() => tap.requests.includes("slow"), "slow to be sent"),
      );
      tap.live[0]?.send(
        encodeBinary({
          _tag: "Request",
          id: { nested: true },
          tag: "echo",
          payload: numberKeyed(),
        }),
      );
      const error = failureOf(yield* Fiber.join(slow));
      assert.equal(error?.code, "Unknown", String(error));
      assert.equal(error?.reason, "transport/lost-after-send");
      // The packet the test sent really was one the owner cannot decode.
      assert.throws(() =>
        decodeClient(
          encodeBinary({ _tag: "Request", id: { nested: true }, tag: "echo", payload: 1 }),
          "binary",
        ),
      );
    }),
  );
});

test("over the JSON protocol too, a message that parses but does not decode fails its own call", async () => {
  const json = RpcGroup.make(
    Rpc.make("echo", {
      payload: { value: Schema.Unknown },
      success: Schema.Unknown,
      error: SewedError,
    }),
    Rpc.make("slow", {
      payload: { value: Schema.String },
      success: Schema.String,
      error: SewedError,
    }),
  );
  const Json = Capability.define("undecodable-json", json);
  const gate = Deferred.makeUnsafe<void>();
  const live: Connection[] = [];
  // The answer to `echo("answer")` loses its exit; the request `echo("request")` loses its
  // headers. Both still parse as JSON and name their request.
  const rewrite = (message: Wire, field: "exit" | "headers", value: string): Wire => {
    if (typeof message !== "string" || !message.includes(`"${value}"`)) return message;
    const parsed: unknown = JSON.parse(message);
    return typeof parsed === "object" && parsed !== null
      ? JSON.stringify({ ...parsed, [field]: "bogus" })
      : message;
  };
  const exits = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(
          json.toLayer({
            echo: ({ value }) => Effect.succeed(value),
            slow: ({ value }) => Deferred.await(gate).pipe(Effect.as(value)),
          }),
        );
        const runtime = yield* server(json, { ownerId: "undecodable-json" }).pipe(
          Effect.provideContext(services),
        );
        const owner = makeOwner(
          "undecodable-json",
          json,
          {
            connect: scopedConnection(() => {
              const [client, accepted] = pair();
              runtime.accept(accepted);
              const connection: Connection = {
                send: (message) => client.send(rewrite(message, "headers", "request")),
                subscribe: (receive, close) =>
                  client.subscribe((message) => receive(rewrite(message, "exit", "answer")), close),
                close: () => client.close(),
              };
              live.push(connection);
              return connection;
            }),
          },
          {},
        );
        return yield* Effect.gen(function* () {
          const calls = yield* Json;
          const slow = yield* calls.slow({ value: "beside" }).pipe(Effect.exit, Effect.forkScoped);
          const answer = yield* Effect.exit(calls.echo({ value: "answer" }));
          const request = yield* Effect.exit(calls.echo({ value: "request" }));
          Deferred.doneUnsafe(gate, Effect.void);
          return { answer, request, slow: yield* Fiber.join(slow) };
        }).pipe(
          Effect.provide(Capability.client(Json)),
          Effect.provide(Binding.layer([Binding.to(Json.slot, owner)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );
  assert.equal(failureOf(exits.answer)?.reason, "transport/undecodable-answer");
  assert.equal(failureOf(exits.request)?.reason, "transport/undecodable-request");
  assert.equal(failureOf(exits.request)?.code, "Protocol");
  assert.ok(Exit.isSuccess(exits.slow), String(exits.slow));
  assert.equal(live.length, 1);
});

test("an undecodable request whose refusal cannot fit one message closes only its own connection", async () => {
  // The refusal names the peer's own request id, so a peer can make it too large to send; the
  // owner must end that connection, never throw out of its handler, and keep serving the rest.
  const protocol = Binary.protocol(
    RpcGroup.make(
      Rpc.make("echo", {
        payload: { value: Schema.Unknown },
        success: Schema.Unknown,
        error: SewedError,
      }),
    ),
  );
  const scope = Effect.runSync(Scope.make());
  const runtime = await Effect.runPromise(
    Effect.gen(function* () {
      const services = yield* Layer.build(
        protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) }),
      );
      return yield* server(protocol, { ownerId: "big-id" }).pipe(Effect.provideContext(services));
    }).pipe(Scope.provide(scope)),
  );
  let length = maxMessageBytes - 40;
  const build = () =>
    encodeBinary({ _tag: "Request", id: "i".repeat(length), tag: 5, payload: {}, headers: [] });
  let packet = build();
  while (packet.byteLength > maxMessageBytes) {
    length -= 1;
    packet = build();
  }
  const [hostile, hostileEnd] = pair();
  let hostileClosed = false;
  hostile.subscribe(
    () => {},
    () => {
      hostileClosed = true;
    },
  );
  runtime.accept(hostileEnd);
  assert.doesNotThrow(() => hostile.send(packet));
  await waitUntil(() => hostileClosed, "the hostile connection to close");

  const [honest, honestEnd] = pair();
  const answers: unknown[] = [];
  honest.subscribe(
    (message) => answers.push(decodeServer(message, "binary")),
    () => {},
  );
  runtime.accept(honestEnd);
  honest.send(
    encodeBinary({ _tag: "Request", id: "ok", tag: "echo", payload: { value: 1 }, headers: [] }),
  );
  await waitUntil(() => answers.length > 0, "the owner to answer another connection");
  await Effect.runPromise(Scope.close(scope, Exit.void));
});
