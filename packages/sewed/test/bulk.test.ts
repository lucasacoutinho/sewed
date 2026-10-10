import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Scope } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, Capability, SewedError } from "../lib/index.js";
import { makeBound, makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import { serveConnections } from "../lib/internal/BindingRelay.js";
import * as Testing from "../lib/Testing.js";
import * as Bulk from "../lib/internal/Bulk.js";
import { isBytes } from "../lib/internal/Bytes.js";
import {
  decodeClient,
  decodeServer,
  encode,
  maxMessageBytes,
  minPartBytes,
  narrower,
  pair,
  type Connection,
} from "../lib/internal/Transport.js";
import { waitUntil } from "./wait.ts";

const twelve = 12 * 1024 * 1024;
const Ingest = Rpc.make("ingest", {
  payload: { command: Schema.String, content: Binary.Bytes },
  success: Schema.Struct({ id: Schema.String, sum: Schema.Number }),
  error: SewedError,
});
const Small = Rpc.make("small", { payload: { content: Binary.Bytes }, success: Schema.Number });
// The bound is the field's own, exactly: a 12 MiB attachment declares 12 MiB, and the command
// and envelope beside it keep their ordinary 256 KiB.
const protocol = Binary.protocol(
  RpcGroup.make(Binary.bulk(Ingest, { field: "content", maxBytes: twelve }), Small),
);
const Attachments = Capability.define("attachments", protocol);

const checksum = (bytes: Uint8Array) => {
  let sum = 0;
  for (let index = 0; index < bytes.byteLength; index += 4093)
    sum = (sum + (bytes[index] ?? 0)) % 65521;
  return sum;
};
const pattern = (size: number, seed = 31) => {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index++) bytes[index] = (index * seed) % 251;
  return bytes;
};
const failureOf = (exit: Exit.Exit<unknown, unknown>): SewedError | undefined => {
  if (Exit.isSuccess(exit)) return undefined;
  const error: unknown = Cause.squash(exit.cause);
  return error instanceof SewedError ? error : undefined;
};

const handlers = (received: Uint8Array[]) =>
  protocol.toLayer({
    ingest: ({ content }) =>
      Effect.sync(() => {
        received.push(content);
        return { id: String(content.byteLength), sum: checksum(content) };
      }),
    small: ({ content }) => Effect.succeed(content.byteLength),
  });

const run = <A, E>(
  effect: Effect.Effect<A, E, typeof Attachments | Scope.Scope>,
  received: Uint8Array[] = [],
) =>
  Effect.runPromiseExit(
    Effect.scoped(
      effect.pipe(
        Effect.provide(
          Capability.client(Attachments).pipe(
            Layer.provide(Testing.layer(Attachments.slot, handlers(received))),
          ),
        ),
      ),
    ),
  );

interface Tap {
  /** Every packet's tag, in the order it crossed the wire, both directions. */
  readonly frames: string[];
  /** Each packet the client sent, tagged with the request it belongs to, in order. */
  readonly sent: string[];
  /** The request identity of each `RequestPart`, in the order the parts were sent. */
  readonly senders: string[];
  /** The request identity of each `Exit` the owner answered with. */
  readonly exits: string[];
  readonly live: Connection[];
  /** While true the owner's packets are recorded but withheld from the client. */
  hold: boolean;
  readonly release: () => void;
}

/**
 * One owner over a raw connection pair, with every packet's tag recorded as it crosses the wire.
 * The tap is a `Connection` around the client end, so the client under test is the real
 * `Capability.client` over the real transport.
 *
 * `hold` is what makes a test about the middle of a transfer deterministic. A `pair()` delivers
 * synchronously, so an unheld part acknowledgment resumes the sending fiber before the test's
 * next turn and the whole request is already delivered by the time the test looks. Withholding
 * the owner's packets leaves the client genuinely suspended on the part it just sent.
 */
const tapped = (received: Uint8Array[]) =>
  Effect.gen(function* () {
    const frames: string[] = [];
    const sent: string[] = [];
    const senders: string[] = [];
    const exits: string[] = [];
    const live: Connection[] = [];
    const held: (() => void)[] = [];
    const tap: Tap = {
      frames,
      sent,
      senders,
      exits,
      live,
      hold: false,
      release: () => {
        for (const deliver of held.splice(0)) deliver();
      },
    };
    const services = yield* Layer.build(handlers(received));
    const runtime = yield* server(protocol, { ownerId: "attachments" }).pipe(
      Effect.provideContext(services),
    );
    const owner = makeOwner(
      "attachments",
      protocol,
      {
        connect: scopedConnection(() => {
          const [client, accepted] = pair();
          runtime.accept(accepted);
          const connection: Connection = {
            send: (message) => {
              const packet = decodeClient(message);
              frames.push(packet._tag);
              sent.push(
                packet._tag === "RequestPart" || packet._tag === "Request"
                  ? `${packet._tag}(${String(packet.id)})`
                  : packet._tag === "Interrupt" || packet._tag === "Ack"
                    ? `${packet._tag}(${String(packet.requestId)})`
                    : packet._tag,
              );
              if (packet._tag === "RequestPart") senders.push(String(packet.id));
              client.send(message);
            },
            subscribe: (receive, close) =>
              client.subscribe((message) => {
                const packet = decodeServer(message);
                frames.push(packet._tag);
                if (packet._tag === "Exit") exits.push(String(packet.requestId));
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

const overTap = <A, E>(
  received: Uint8Array[],
  use: (tap: Tap) => Effect.Effect<A, E, typeof Attachments | Scope.Scope>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const { tap, owner } = yield* tapped(received);
        return yield* use(tap).pipe(
          Effect.provide(Capability.client(Attachments)),
          Effect.provide(Binding.layer([Binding.to(Attachments.slot, owner)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );

/** A raw owner with no client: the test hand-builds the packets a hostile peer would send. */
const rawOwner = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  layer: Layer.Layer<Rpc.ToHandler<Rpcs>>,
) =>
  Effect.gen(function* () {
    const services = yield* Layer.build(layer);
    const runtime = yield* server(group).pipe(Effect.provideContext(services));
    const [client, accepted] = pair();
    runtime.accept(accepted);
    let closed = false;
    const answers: string[] = [];
    const unsubscribe = client.subscribe(
      (message) => {
        answers.push(decodeServer(message)._tag);
      },
      () => {
        closed = true;
      },
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        unsubscribe();
        client.close();
      }),
    );
    return { client, answers, closed: () => closed };
  });

const bulkFrames = (frames: string[]) =>
  frames.filter((tag) => tag === "RequestPart" || tag === "PartAck");

test("a field of exactly the bound reaches the handler intact through a bulk operation", async () => {
  const content = pattern(twelve);
  const received: Uint8Array[] = [];
  const exit = await run(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.ingest({ command: "add", content });
    }),
    received,
  );
  assert.deepEqual(exit, Exit.succeed({ id: String(twelve), sum: checksum(content) }));
  assert.equal(received.length, 1);
  assert.equal(received[0]?.byteLength, twelve);
  assert.deepEqual(received[0], content);
});

test("one byte over the bound fails Limit before anything is sent, and the handler never runs", async () => {
  const received: Uint8Array[] = [];
  const sent: string[] = [];
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      const result = yield* attachments.ingest({
        command: "add",
        content: new Uint8Array(twelve + 1),
      });
      sent.push(...tap.frames);
      return result;
    }),
  );
  assert.ok(Exit.isFailure(exit));
  const error = failureOf(exit);
  assert.equal(error?.code, "Limit");
  assert.equal(error?.message, `content exceeds the operation's bulk bound of ${twelve} bytes`);
  assert.equal(received.length, 0);
  assert.deepEqual(sent, []);
});

test("a request whose other fields exceed an envelope fails Limit beside its bulk field", async () => {
  const received: Uint8Array[] = [];
  const exit = await run(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.ingest({
        command: "x".repeat(300 * 1024),
        content: new Uint8Array(1),
      });
    }),
    received,
  );
  assert.ok(Exit.isFailure(exit));
  const error = failureOf(exit);
  assert.equal(error?.code, "Limit");
  assert.equal(error?.message, "The request beside its bulk field exceeds the envelope limit");
  assert.equal(received.length, 0);
});

test("an undeclared operation keeps the envelope limit", async () => {
  const exit = await run(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.small({ content: new Uint8Array(maxMessageBytes) });
    }),
  );
  assert.ok(Exit.isFailure(exit));
  const error = failureOf(exit);
  assert.equal(error?.code, "Limit");
  assert.match(error?.message ?? "", /262144/);
});

test("a request under the envelope limit on a bulk operation is sent whole", async () => {
  const received: Uint8Array[] = [];
  const content = pattern(1024);
  const seen: string[] = [];
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      const result = yield* attachments.ingest({ command: "add", content });
      seen.push(...tap.frames);
      return result;
    }),
  );
  assert.deepEqual(exit, Exit.succeed({ id: "1024", sum: checksum(content) }));
  assert.deepEqual(bulkFrames(seen), []);
  assert.equal(seen.filter((tag) => tag === "Request").length, 1);
  assert.deepEqual(received, [content]);
});

test("parts are acknowledged one at a time, and a lost connection fails Closed before delivery", async () => {
  const received: Uint8Array[] = [];
  const content = pattern(600 * 1024);
  const seen: string[] = [];
  const delivered = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      const result = yield* attachments.ingest({ command: "add", content });
      seen.push(...tap.frames);
      return result;
    }),
  );
  assert.deepEqual(delivered, Exit.succeed({ id: String(600 * 1024), sum: checksum(content) }));
  const parts = bulkFrames(seen);
  assert.ok(parts.length >= 5, `expected several parts, saw ${parts.length}`);
  // The shape of a transfer: each part but the last is answered, and the last is not, because
  // the request's own response ends it. This alternation alone does not prove the client waits —
  // a `pair()` answers synchronously, so the frames would interleave this way either way. That
  // the client really suspends is what the two `hold` tests below and in the interrupt test
  // prove: they act while it is stopped between two parts, which a client that did not wait
  // would never be.
  assert.deepEqual(
    parts,
    parts.map((_, index) => (index % 2 === 0 ? "RequestPart" : "PartAck")),
  );
  assert.equal(parts.at(-1), "RequestPart");

  const lost: Uint8Array[] = [];
  const exit = await overTap(lost, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      tap.hold = true;
      const call = yield* attachments
        .ingest({ command: "add", content: pattern(600 * 1024, 17) })
        .pipe(Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(() => tap.frames.includes("PartAck"), "the first part to be acknowledged"),
      );
      const [connection] = tap.live;
      connection?.close();
      return yield* Fiber.await(call);
    }),
  );
  assert.ok(Exit.isSuccess(exit), "the test program itself failed");
  const failed = exit.value;
  assert.ok(Exit.isFailure(failed), "the interrupted request should not have succeeded");
  const error = failureOf(failed);
  assert.equal(error?.code, "Closed");
  assert.equal(error?.message, "Connection closed before the bulk request was delivered");
  assert.equal(error?.reason, "transport/closed-before-send");
  assert.equal(lost.length, 0);
});

test("a hostile part — undeclared tag, over the bound, second assembly — closes the connection", async () => {
  const tight = Binary.protocol(
    RpcGroup.make(Binary.bulk(Ingest, { field: "content", maxBytes: 4096 }), Small),
  );
  const part = (fields: {
    readonly id: string | number;
    readonly tag: string;
    readonly bytes: string | Uint8Array;
    readonly final: boolean;
  }) => encode({ _tag: "RequestPart", ...fields }, "binary");
  const ingest = (payload: { readonly command: string; readonly content: unknown }) =>
    encode(
      { _tag: "Request", id: 1, tag: "ingest", payload, headers: [] },
      "binary",
      4096 + maxMessageBytes,
    );
  const slices = (whole: Uint8Array) => {
    const size = Math.floor(maxMessageBytes / 2);
    const out: Uint8Array[] = [];
    for (let offset = 0; offset < whole.byteLength; offset += size) {
      const end = Math.min(offset + size, whole.byteLength);
      out.push(
        part({
          id: 1,
          tag: "ingest",
          bytes: whole.subarray(offset, end),
          final: end >= whole.byteLength,
        }),
      );
    }
    return out;
  };
  const hostile: readonly (readonly [string, readonly Uint8Array[]])[] = [
    [
      "a part for an operation that declared no bound",
      [part({ id: 1, tag: "small", bytes: new Uint8Array(minPartBytes), final: false })],
    ],
    [
      // The allowance counts bytes, so an empty part passes it however many times it is sent.
      // What bounds the number of parts one assembly holds is the floor, not the byte count.
      "an empty non-final part",
      [part({ id: 1, tag: "ingest", bytes: new Uint8Array(0), final: false })],
    ],
    [
      // A final part may be the tail, any size from one byte up — but not none of them.
      "an empty final part",
      [part({ id: 1, tag: "ingest", bytes: new Uint8Array(0), final: true })],
    ],
    [
      "a non-final part one byte under the floor",
      [part({ id: 1, tag: "ingest", bytes: new Uint8Array(minPartBytes - 1), final: false })],
    ],
    [
      "parts that pass the buffer together",
      [
        part({ id: 1, tag: "ingest", bytes: new Uint8Array(140 * 1024), final: false }),
        part({ id: 1, tag: "ingest", bytes: new Uint8Array(140 * 1024), final: false }),
      ],
    ],
    [
      "a second assembly on one connection",
      [
        part({ id: 1, tag: "ingest", bytes: new Uint8Array(minPartBytes), final: false }),
        part({ id: 2, tag: "ingest", bytes: new Uint8Array(minPartBytes), final: false }),
      ],
    ],
    [
      "text where a part carries bytes",
      [part({ id: 1, tag: "ingest", bytes: "not bytes", final: false })],
    ],
    [
      "a final part that does not decode to its own request",
      [part({ id: 1, tag: "ingest", bytes: encode({ _tag: "Ping" }, "binary"), final: true })],
    ],
    [
      // Within the buffer the owner allows, so only the field's own bound refuses it.
      "an assembled field past the bound",
      [
        part({
          id: 1,
          tag: "ingest",
          bytes: ingest({ command: "add", content: new Uint8Array(4097) }),
          final: true,
        }),
      ],
    ],
    [
      "an assembled field that is not bytes",
      [
        part({
          id: 1,
          tag: "ingest",
          bytes: ingest({ command: "add", content: "text" }),
          final: true,
        }),
      ],
    ],
    [
      // The field is tiny and the whole fits the owner's buffer, but what rides beside it is
      // past an envelope, which an honest client would have refused before sending.
      "an assembled request whose other fields pass an envelope",
      slices(ingest({ command: "x".repeat(263_000), content: new Uint8Array(8) })),
    ],
    [
      // A request small enough to arrive whole takes the ordinary path, which applies the same
      // bound: the shorter path is not a way past the declaration.
      "a whole request whose field is past the bound",
      [ingest({ command: "add", content: new Uint8Array(4097) })],
    ],
    ["a whole request whose field is not bytes", [ingest({ command: "add", content: "text" })]],
  ];
  for (const [name, packets] of hostile) {
    const received: Uint8Array[] = [];
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const owner = yield* rawOwner(tight, handlers(received));
          for (const packet of packets) {
            try {
              owner.client.send(packet);
            } catch {
              // The connection this packet was refused on is already closed.
            }
          }
          yield* Effect.promise(() => waitUntil(owner.closed, `${name} to close the connection`));
          assert.equal(received.length, 0, name);
        }),
      ),
    );
  }
  // The control: a non-final part of exactly the floor is answered, the connection stays open,
  // and the final part after it delivers the request to the handler. The floor refuses a part
  // that is too small, not a transfer that is honestly sliced.
  const content = pattern(4096, 23);
  const whole = ingest({ command: "x".repeat(30_000), content });
  assert.ok(whole.byteLength > minPartBytes, `control packet is ${whole.byteLength} bytes`);
  const accepted: Uint8Array[] = [];
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* rawOwner(tight, handlers(accepted));
        owner.client.send(
          part({ id: 1, tag: "ingest", bytes: whole.subarray(0, minPartBytes), final: false }),
        );
        yield* Effect.promise(() =>
          waitUntil(() => owner.answers.includes("PartAck"), "the part to be acknowledged"),
        );
        assert.equal(owner.closed(), false);
        owner.client.send(
          part({ id: 1, tag: "ingest", bytes: whole.subarray(minPartBytes), final: true }),
        );
        yield* Effect.promise(() =>
          waitUntil(() => accepted.length === 1, "the assembled request to reach the handler"),
        );
        assert.equal(owner.closed(), false);
        assert.deepEqual(accepted[0], content);
      }),
    ),
  );
});

test("interrupting the caller between parts drops the assembly", async () => {
  const received: Uint8Array[] = [];
  const content = pattern(600 * 1024, 7);
  let exits: string[] = [];
  let delivered: string | undefined;
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      tap.hold = true;
      const call = yield* attachments
        .ingest({ command: "abandon", content: pattern(600 * 1024, 11) })
        .pipe(Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(() => tap.frames.includes("PartAck"), "the first part to be acknowledged"),
      );
      yield* Fiber.interrupt(call);
      tap.hold = false;
      tap.release();
      const result = yield* attachments.ingest({ command: "add", content });
      exits = [...tap.exits];
      delivered = tap.senders.at(-1);
      return result;
    }),
  );
  assert.deepEqual(exit, Exit.succeed({ id: String(600 * 1024), sum: checksum(content) }));
  assert.deepEqual(received, [content]);
  // The dropped assembly never became a request, so the owner answers nothing for its identity:
  // the only Exit on the wire belongs to the second call.
  assert.deepEqual(exits, [delivered]);
});

test("a second bulk call sends no part while the first is suspended between two parts", async () => {
  const received: Uint8Array[] = [];
  const first = pattern(600 * 1024, 13);
  const second = pattern(600 * 1024, 19);
  let sendersWhileHeld: string[] = [];
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      tap.hold = true;
      const a = yield* attachments
        .ingest({ command: "add", content: first })
        .pipe(Effect.exit, Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(() => tap.frames.includes("PartAck"), "the first part to be acknowledged"),
      );
      // The first transfer is now genuinely suspended: its acknowledgment is withheld. The
      // second call starts here and must find the gate taken.
      const b = yield* attachments
        .ingest({ command: "add", content: second })
        .pipe(Effect.exit, Effect.forkScoped);
      // A negative assertion — that the second call put nothing on the wire — has no positive
      // condition to wait for, so it takes a short bounded wait. Under load it can pass falsely;
      // it cannot fail falsely.
      yield* Effect.sleep("50 millis");
      sendersWhileHeld = [...tap.senders];
      tap.hold = false;
      tap.release();
      return [yield* Fiber.join(a), yield* Fiber.join(b)] as const;
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(failureOf(exit))}`);
  const [a, b] = exit.value;
  // The gate, not the scheduler: only one request has parts on the wire while the first is held.
  // On a real port an ungated second request's first part would reach the owner mid-assembly and
  // the owner would disconnect an honest client.
  assert.equal(
    new Set(sendersWhileHeld).size,
    1,
    `senders while held: ${sendersWhileHeld.join(",")}`,
  );
  assert.ok(Exit.isSuccess(a), `first: ${String(failureOf(a))}`);
  assert.ok(Exit.isSuccess(b), `second: ${String(failureOf(b))}`);
  assert.deepEqual(a, Exit.succeed({ id: String(first.byteLength), sum: checksum(first) }));
  assert.deepEqual(b, Exit.succeed({ id: String(second.byteLength), sum: checksum(second) }));
  assert.equal(received.length, 2);
  assert.deepEqual(
    received.map((bytes) => checksum(bytes)).sort(),
    [checksum(first), checksum(second)].sort(),
  );
});

test("ordinary requests cross a connection while a bulk transfer is suspended", async () => {
  const received: Uint8Array[] = [];
  const big = pattern(600 * 1024, 11);
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      tap.hold = true;
      const bulk = yield* attachments
        .ingest({ command: "add", content: big })
        .pipe(Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(() => tap.frames.includes("PartAck"), "the first part to be acknowledged"),
      );
      // Only that one acknowledgment stays withheld; everything after it is let through, so the
      // transfer is stopped between two parts while the connection is otherwise live.
      tap.hold = false;
      const small = yield* attachments
        .small({ content: new Uint8Array(10) })
        .pipe(Effect.timeoutOption("5 seconds"));
      const whole = yield* attachments
        .ingest({ command: "w", content: new Uint8Array(64) })
        .pipe(Effect.timeoutOption("5 seconds"));
      const partsWhileHeld = tap.senders.length;
      tap.release();
      return { small, whole, partsWhileHeld, done: yield* Fiber.join(bulk) };
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(failureOf(exit))}`);
  const result = Exit.isSuccess(exit) ? exit.value : undefined;
  // Only a bulk send takes the permit: an ordinary call and a declared call small enough to go
  // whole both answer while the transfer is stopped, and the transfer then finishes intact.
  assert.deepEqual(result?.small, Option.some(10));
  assert.deepEqual(result?.whole, Option.some({ id: "64", sum: 0 }));
  assert.equal(result?.partsWhileHeld, 1);
  assert.deepEqual(result?.done, { id: String(big.byteLength), sum: checksum(big) });
  assert.equal(received.length, 2);
});

test("a bulk request still waiting on the gate fails Closed, having sent nothing", async () => {
  const received: Uint8Array[] = [];
  let sendersBefore: string[] = [];
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      tap.hold = true;
      const a = yield* attachments
        .ingest({ command: "a", content: pattern(600 * 1024, 11) })
        .pipe(Effect.exit, Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(() => tap.frames.includes("PartAck"), "the first part to be acknowledged"),
      );
      const b = yield* attachments
        .ingest({ command: "b", content: pattern(600 * 1024, 13) })
        .pipe(Effect.exit, Effect.forkScoped);
      // The second call has sent nothing and cannot, so there is no positive condition marking
      // that it is waiting on the gate; the bounded wait below is the negative assertion's.
      yield* Effect.sleep("50 millis");
      sendersBefore = [...tap.senders];
      tap.live[0]?.close();
      return [yield* Fiber.join(a), yield* Fiber.join(b)] as const;
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(failureOf(exit))}`);
  const [a, b] = exit.value;
  assert.equal(
    new Set(sendersBefore).size,
    1,
    `senders before the loss: ${sendersBefore.join(",")}`,
  );
  // Both were undelivered: one suspended between parts, the other still queued behind it with no
  // byte of its own on the wire. A request that never reached the owner says so, rather than
  // resolving as a bare interruption that says nothing about whether the handler ran.
  for (const [name, result] of [
    ["suspended between parts", a],
    ["waiting on the gate", b],
  ] as const) {
    assert.ok(Exit.isFailure(result), `${name} should not have succeeded`);
    const error = failureOf(result);
    assert.equal(error?.code, "Closed", `${name}: ${String(error)}`);
    assert.equal(error?.message, "Connection closed before the bulk request was delivered", name);
    assert.equal(error?.reason, "transport/closed-before-send", name);
  }
  assert.equal(received.length, 0);
});

test("an interrupted transfer's Interrupt reaches the owner before the next request's first part", async () => {
  const received: Uint8Array[] = [];
  const second = pattern(600 * 1024, 19);
  let sent: string[] = [];
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      tap.hold = true;
      const a = yield* attachments
        .ingest({ command: "abandon", content: pattern(600 * 1024, 11) })
        .pipe(Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(() => tap.frames.includes("PartAck"), "the first part to be acknowledged"),
      );
      const b = yield* attachments
        .ingest({ command: "add", content: second })
        .pipe(Effect.exit, Effect.forkScoped);
      // The second call is queued on the gate; it has nothing to announce, so this bounded wait
      // is what gives it the chance to have gone first if the gate did not hold it.
      yield* Effect.sleep("50 millis");
      tap.hold = false;
      yield* Fiber.interrupt(a);
      tap.release();
      const result = yield* Fiber.join(b);
      sent = [...tap.sent];
      return result;
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(failureOf(exit))}`);
  const result = exit.value;
  assert.ok(Exit.isSuccess(result), `second: ${String(failureOf(result))}`);
  assert.deepEqual(result, Exit.succeed({ id: String(second.byteLength), sum: checksum(second) }));
  assert.equal(received.length, 1);
  // The owner keeps one assembly per connection, so the order of these three packets is the
  // whole reason the second request is accepted: the abandoned assembly is dropped before the
  // next request's first part arrives.
  const parts = sent.filter(
    (frame) => frame.startsWith("RequestPart") || frame.startsWith("Interrupt"),
  );
  const abandoned = parts[0]?.slice("RequestPart".length);
  const accepted = parts[2]?.slice("RequestPart".length);
  assert.ok(
    abandoned !== undefined && accepted !== undefined && abandoned !== accepted,
    sent.join(" "),
  );
  assert.deepEqual(
    parts.slice(0, 3),
    [`RequestPart${abandoned}`, `Interrupt${abandoned}`, `RequestPart${accepted}`],
    sent.join(" "),
  );
  assert.ok(
    parts.slice(3).every((frame) => frame === `RequestPart${accepted}`),
    sent.join(" "),
  );
});

test("a bulk request reaches its owner through a relay whose target connects late", async () => {
  const received: Uint8Array[] = [];
  const content = pattern(twelve, 5);
  let sentBeforeConnect = 0;
  let parts = 0;
  let connected = false;
  const exit = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(handlers(received));
        const runtime = yield* server(protocol, { ownerId: "attachments" }).pipe(
          Effect.provideContext(services),
        );
        const ready = yield* Deferred.make<void>();
        const serve = yield* serveConnections([
          makeBound(Attachments.slot, "attachments", {
            connect: Deferred.await(ready).pipe(
              Effect.andThen(
                scopedConnection(() => {
                  const [client, accepted] = pair();
                  runtime.accept(accepted);
                  connected = true;
                  return client;
                }),
              ),
            ),
          }),
        ]);
        const owner = makeOwner(
          "attachments",
          protocol,
          {
            connect: scopedConnection(() => {
              const [client, relayEnd] = pair();
              const refused = serve(Attachments.slot.key, relayEnd);
              if (refused !== undefined) throw refused;
              return {
                send: (message) => {
                  if (decodeClient(message)._tag === "RequestPart") parts++;
                  if (!connected) sentBeforeConnect++;
                  client.send(message);
                },
                subscribe: client.subscribe,
                close: client.close,
              };
            }),
          },
          {},
        );
        return yield* Effect.gen(function* () {
          const attachments = yield* Attachments;
          const call = yield* attachments
            .ingest({ command: "add", content })
            .pipe(Effect.forkScoped);
          yield* Effect.promise(() =>
            waitUntil(() => sentBeforeConnect > 0, "the first part to reach the relay"),
          );
          // The relay has nothing to forward to yet, so nothing can answer the part the client is
          // now suspended on. That it sends no second part has no positive condition to wait for,
          // so this is a short bounded wait: it can pass falsely under load, not fail falsely.
          yield* Effect.sleep("100 millis");
          const heldBack = sentBeforeConnect;
          yield* Deferred.succeed(ready, undefined);
          return { result: yield* Fiber.join(call), heldBack };
        }).pipe(
          Effect.provide(Capability.client(Attachments)),
          Effect.provide(Binding.layer([Binding.to(Attachments.slot, owner)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );
  assert.ok(Exit.isSuccess(exit), `the relay round trip failed: ${String(failureOf(exit))}`);
  const outcome = Exit.isSuccess(exit) ? exit.value : undefined;
  // One part in flight: the relay's pre-connect buffer never holds more than the packet the
  // client is waiting on, whatever the bound is.
  assert.equal(outcome?.heldBack, 1);
  assert.deepEqual(outcome?.result, { id: String(twelve), sum: checksum(content) });
  assert.ok(parts > 90, `expected a 12 MiB request to be many parts, saw ${parts}`);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], content);
});

test("a bulk operation outside a Binary.protocol is refused where its slot is declared", () => {
  const Upload = Rpc.make("upload", {
    payload: { content: Schema.Uint8Array },
    success: Schema.Number,
  });
  const text = RpcGroup.make(Binary.bulk(Upload, { field: "content", maxBytes: 1024 }));
  const refusal = (error: unknown) =>
    error instanceof SewedError &&
    error.code === "Protocol" &&
    error.message === "A bulk operation needs a Binary.protocol: upload";
  assert.throws(() => Binding.slot("json-bulk", text), refusal);
  assert.throws(() => Capability.define("json-bulk", text), refusal);
  // The same group in a Binary.protocol is fine; only the encoding was wrong.
  assert.equal(Binding.slot("binary-bulk", Binary.protocol(text)).key, "sewed/binding/binary-bulk");
});

test("Binary.bulk refuses a bound that is not a positive integer of at most 64 MiB", () => {
  for (const maxBytes of [0, -1, 1.5, Bulk.maxBulkBytes + 1, Number.NaN]) {
    assert.throws(
      () => Binary.bulk(Ingest, { field: "content", maxBytes }),
      (error: unknown) => error instanceof SewedError && error.code === "Protocol",
      String(maxBytes),
    );
  }
  assert.equal(Bulk.maxBulkBytes, 64 * 1024 * 1024);
  assert.deepEqual(
    [...Bulk.boundsOf(protocol)],
    [["ingest", { field: "content", maxBytes: twelve }]],
  );
  assert.deepEqual([...Bulk.boundsOf(RpcGroup.make(Small))], []);
});

/**
 * A view another realm made over memory this one allocated. That is the shape a consumer's bytes
 * actually arrive in: a test environment installs its own `Uint8Array` over the global, and a
 * `TextEncoder` or a DOM API from that environment answers with a view its realm made. The bytes
 * are the same bytes; only the constructor that stamped them differs.
 */
const fromAnotherRealm = (bytes: Uint8Array): Uint8Array => {
  const foreign: unknown = runInNewContext("new Uint8Array(buffer, offset, length)", {
    buffer: bytes.buffer,
    offset: bytes.byteOffset,
    length: bytes.byteLength,
  });
  assert.ok(isBytes(foreign));
  assert.equal(foreign instanceof Uint8Array, false, "the premise: the view is not from here");
  return foreign;
};

test("a bulk field another realm made crosses in parts and arrives intact", async () => {
  const content = pattern(maxMessageBytes * 3);
  const received: Uint8Array[] = [];
  const seen: string[] = [];
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      const result = yield* attachments.ingest({
        command: "add",
        content: fromAnotherRealm(content),
      });
      seen.push(...tap.frames);
      return result;
    }),
  );
  assert.deepEqual(exit, Exit.succeed({ id: String(maxMessageBytes * 3), sum: checksum(content) }));
  assert.ok(bulkFrames(seen).length > 0, "a field this large leaves as parts");
  assert.deepEqual(received, [content]);
});

test("an owner handed a bulk field another realm made keeps the connection", async () => {
  const received: Uint8Array[] = [];
  const content = pattern(maxMessageBytes * 3);
  const exit = await run(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      yield* attachments.ingest({ command: "add", content: fromAnotherRealm(content) });
      // A disconnected owner answers nothing, so a second call on the same client is what says
      // the first was admitted rather than refused as an invalid bulk request.
      return yield* attachments.small({ content: fromAnotherRealm(pattern(64)) });
    }),
    received,
  );
  assert.deepEqual(exit, Exit.succeed(64));
  assert.deepEqual(received, [content]);
});

test("a slice narrows by halves and stops at the floor the owner enforces", () => {
  assert.equal(narrower(maxMessageBytes), maxMessageBytes / 2);
  let slice: number | undefined = Math.floor(maxMessageBytes / 2);
  const tried = [slice];
  while ((slice = narrower(slice)) !== undefined) tried.push(slice);
  assert.deepEqual(tried, [131072, 65536, 32768, minPartBytes]);
  // The clamp is what keeps a halving that would step past the floor from landing under it, and
  // answering `undefined` at the floor is what ends the attempt in a Protocol failure.
  assert.equal(narrower(minPartBytes + 1), minPartBytes);
  assert.equal(narrower(minPartBytes * 2 - 1), minPartBytes);
  assert.equal(narrower(minPartBytes), undefined);
  assert.equal(narrower(minPartBytes - 1), undefined);
  assert.equal(narrower(1), undefined);
});

test("the in-process path applies no bound", async () => {
  const layer = Capability.fromHandlers(Attachments, (implement) =>
    implement({
      ingest: ({ content }) => Effect.succeed({ id: "x", sum: checksum(content) }),
      small: ({ content }) => Effect.succeed(content.byteLength),
    }),
  );
  const size = await Effect.runPromise(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.small({ content: new Uint8Array(maxMessageBytes * 2) });
    }).pipe(Effect.provide(layer)),
  );
  assert.equal(size, maxMessageBytes * 2);
  const whole = await Effect.runPromise(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.ingest({ command: "add", content: new Uint8Array(twelve + 1) });
    }).pipe(Effect.provide(layer)),
  );
  assert.equal(whole.id, "x");
});

// Z4: a bulk send's last part is delivered to an in-process owner synchronously, inside the very
// `connection.send` call `fragment`'s part loop makes — but the fiber racing that send
// (`Effect.raceFirst` against a lost-connection `Deferred`) does not learn it won that quickly: a
// connection lost in the gap between the two could still reach `fail` first, which used to answer
// `Closed`/`transport/closed-before-send` for a request whose bytes had already, provably, left.
// `tap.release()` resumes a withheld `PartAck` synchronously (`pair()` delivers inline), which is
// what lets a test land a connection loss inside that exact gap: releasing the final part's own
// ack, then closing the connection with no `yield*` in between, puts the loss as early as this
// suite can put it relative to the send it is racing.
test("closing the connection the instant the final part's ack is released still answers Unknown, not Closed", async () => {
  const received: Uint8Array[] = [];
  // Three parts at the default 128 KiB slice (two acknowledged, non-final; the third, final):
  // sized so the second acknowledged part's release drives `fragment` straight through the third.
  const content = pattern(300 * 1024, 23);
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      tap.hold = true;
      const call = yield* attachments
        .ingest({ command: "add", content })
        .pipe(Effect.exit, Effect.forkScoped);
      const acknowledgments = () => tap.frames.filter((frame) => frame === "PartAck").length;
      yield* Effect.promise(() =>
        waitUntil(() => acknowledgments() >= 1, "the first part to be acknowledged"),
      );
      tap.release();
      yield* Effect.promise(() =>
        waitUntil(() => acknowledgments() >= 2, "the second part to be acknowledged"),
      );
      const sendersBeforeTheFinalPart = tap.senders.length;
      // Releasing this second ack resumes the send fiber inline and drives it through the third
      // (final) part's own `connection.send` — proven below by `senders` growing by one more,
      // still inside this same synchronous step, before `close()` is even reached.
      tap.release();
      const sendersAfterTheFinalPart = tap.senders.length;
      tap.live[0]?.close();
      return {
        result: yield* Fiber.join(call),
        sendersBeforeTheFinalPart,
        sendersAfterTheFinalPart,
      };
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(failureOf(exit))}`);
  const outcome = Exit.isSuccess(exit) ? exit.value : undefined;
  assert.equal(outcome?.sendersAfterTheFinalPart, (outcome?.sendersBeforeTheFinalPart ?? 0) + 1);
  const error = outcome === undefined ? undefined : failureOf(outcome.result);
  assert.equal(
    error?.code,
    "Unknown",
    `answered ${String(error)} for a request whose last part left`,
  );
  assert.equal(error?.reason, "transport/lost-after-send");
});

test("closing the connection right after an earlier, non-final part's ack still answers Closed", async () => {
  const received: Uint8Array[] = [];
  const content = pattern(300 * 1024, 23);
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      tap.hold = true;
      const call = yield* attachments
        .ingest({ command: "add", content })
        .pipe(Effect.exit, Effect.forkScoped);
      yield* Effect.promise(() =>
        waitUntil(() => tap.frames.includes("PartAck"), "the first part to be acknowledged"),
      );
      // Releasing only the first part's ack, then closing at once, lands the loss between two
      // non-final parts — the same span the existing "still waiting on the gate" test covers for a
      // send stuck before its first ack, kept here for the boundary right next to it.
      tap.release();
      tap.live[0]?.close();
      return yield* Fiber.join(call);
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(failureOf(exit))}`);
  const result = exit.value;
  assert.ok(Exit.isFailure(result), "an earlier part's own loss should not have succeeded");
  const error = failureOf(result);
  assert.equal(error?.code, "Closed");
  assert.equal(error?.reason, "transport/closed-before-send");
  assert.equal(received.length, 0);
});
