import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Exit, Fiber, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binary, Binding, Capability, SewedError } from "../lib/index.js";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import * as Testing from "../lib/Testing.js";
import * as Bulk from "../lib/internal/Bulk.js";
import {
  decodeClient,
  decodeServer,
  encode,
  maxMessageBytes,
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

const run = <A, E>(effect: Effect.Effect<A, E, typeof Attachments>, received: Uint8Array[] = []) =>
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
  /** The request identity of each `RequestPart`, in the order the parts were sent. */
  readonly senders: string[];
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
    const senders: string[] = [];
    const live: Connection[] = [];
    const held: (() => void)[] = [];
    const tap: Tap = {
      frames,
      senders,
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
              if (packet._tag === "RequestPart") senders.push(String(packet.id));
              client.send(message);
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

const overTap = <A, E>(
  received: Uint8Array[],
  use: (tap: Tap) => Effect.Effect<A, E, typeof Attachments>,
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
  const failed = Exit.isSuccess(exit) ? exit.value : Exit.void;
  assert.ok(Exit.isFailure(failed), "the interrupted request should not have succeeded");
  const error = failureOf(failed);
  assert.equal(error?.code, "Closed");
  assert.equal(error?.message, "Connection closed before the bulk request was delivered");
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
      [part({ id: 1, tag: "small", bytes: new Uint8Array(8), final: false })],
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
        part({ id: 1, tag: "ingest", bytes: new Uint8Array(8), final: false }),
        part({ id: 2, tag: "ingest", bytes: new Uint8Array(8), final: false }),
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
  // The control: a part the declaration allows is answered, and the connection stays open.
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* rawOwner(tight, handlers([]));
        owner.client.send(part({ id: 1, tag: "ingest", bytes: new Uint8Array(8), final: false }));
        yield* Effect.promise(() =>
          waitUntil(() => owner.answers.includes("PartAck"), "the part to be acknowledged"),
        );
        assert.equal(owner.closed(), false);
      }),
    ),
  );
});

test("interrupting the caller between parts drops the assembly", async () => {
  const received: Uint8Array[] = [];
  const content = pattern(600 * 1024, 7);
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
      return yield* attachments.ingest({ command: "add", content });
    }),
  );
  assert.deepEqual(exit, Exit.succeed({ id: String(600 * 1024), sum: checksum(content) }));
  assert.deepEqual(received, [content]);
});

test("two bulk calls on one connection are serialized and both arrive intact", async () => {
  const received: Uint8Array[] = [];
  const first = pattern(600 * 1024, 13);
  const second = pattern(600 * 1024, 19);
  const senders: string[] = [];
  const exit = await overTap(received, (tap) =>
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      const results = yield* Effect.all(
        [
          attachments.ingest({ command: "add", content: first }),
          attachments.ingest({ command: "add", content: second }),
        ],
        { concurrency: "unbounded" },
      );
      senders.push(...tap.senders);
      return results;
    }),
  );
  assert.deepEqual(
    exit,
    Exit.succeed([
      { id: String(first.byteLength), sum: checksum(first) },
      { id: String(second.byteLength), sum: checksum(second) },
    ]),
  );
  assert.equal(received.length, 2);
  assert.deepEqual(
    received.map((bytes) => checksum(bytes)).sort(),
    [checksum(first), checksum(second)].sort(),
  );
  // One assembly per connection: every part of one request is sent before the other starts.
  const runs = senders.filter((id, index) => id !== senders[index - 1]);
  assert.equal(runs.length, 2, senders.join(","));
  assert.equal(new Set(senders).size, 2);
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
