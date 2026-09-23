import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Exit, Fiber, Layer, Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binary, Binding, Capability, SewedError } from "../lib/index.js";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import * as Testing from "../lib/Testing.js";
import * as Bulk from "../lib/internal/Bulk.js";
import {
  concat,
  decodeClient,
  decodeServer,
  maxMessageBytes,
  pair,
  type Connection,
} from "../lib/internal/Transport.js";
import { waitUntil } from "./wait.ts";

/**
 * `Binary.bulkAnswer` is `Binary.bulk` in the other direction: a JSON-shaped success value (an
 * array of small objects, not raw bytes) large enough to need more than one envelope, on a unary
 * operation in a `Binary.protocol`.
 */
const Item = Schema.Struct({ index: Schema.Number, value: Schema.String });
const items = (count: number, size: number) =>
  Array.from({ length: count }, (_, index) => ({ index, value: "x".repeat(size) }));
const Big = Rpc.make("big", {
  payload: { count: Schema.Number, size: Schema.Number },
  success: Schema.Array(Item),
  error: SewedError,
});
const Small = Rpc.make("small", {
  payload: { value: Schema.String },
  success: Schema.String,
  error: SewedError,
});
const protocolWith = (maxBytes: number) =>
  Binary.protocol(RpcGroup.make(Binary.bulkAnswer(Big, { maxBytes }), Small));
type Protocol = ReturnType<typeof protocolWith>;
const makeAnswers = (maxBytes: number) => Capability.define("bulk-answer", protocolWith(maxBytes));
type AnswersCapability = ReturnType<typeof makeAnswers>;

const handlers = (protocol: Protocol) =>
  protocol.toLayer({
    big: ({ count, size }) => Effect.succeed(items(count, size)),
    small: ({ value }) => Effect.succeed(value),
  });

const failureOf = (exit: Exit.Exit<unknown, unknown>): SewedError | undefined => {
  if (Exit.isSuccess(exit)) return undefined;
  const error: unknown = Cause.squash(exit.cause);
  return error instanceof SewedError ? error : undefined;
};

interface Tap {
  /** Every packet's tag, in the order it crossed the wire, both directions. */
  readonly frames: string[];
  /** Each `AnswerPart`'s own bytes, in order, for a test that measures the whole packet. */
  readonly answerParts: Uint8Array[];
  readonly live: Connection[];
  /** While true the owner's packets are recorded but withheld from the client. */
  hold: boolean;
  readonly release: () => void;
}

/** `AnswerPart`/`Ack` frames alone, in the order they crossed the wire, either direction. */
const bulkFrames = (frames: readonly string[]) =>
  frames.filter((tag) => tag === "AnswerPart" || tag === "Ack");

/**
 * One owner over a raw connection pair, mirroring `bulk.test.ts`'s own `tapped()` for the answer
 * direction: the tap is a `Connection` around the client end, so the client under test is the
 * real `Capability.client` over the real transport.
 */
const tapped = (protocol: Protocol) =>
  Effect.gen(function* () {
    const frames: string[] = [];
    const answerParts: Uint8Array[] = [];
    const live: Connection[] = [];
    const held: (() => void)[] = [];
    const tap: Tap = {
      frames,
      answerParts,
      live,
      hold: false,
      release: () => {
        for (const deliver of held.splice(0)) deliver();
      },
    };
    const services = yield* Layer.build(handlers(protocol));
    const runtime = yield* server(protocol, { ownerId: "bulk-answer" }).pipe(
      Effect.provideContext(services),
    );
    const owner = makeOwner(
      "bulk-answer",
      protocol,
      {
        connect: scopedConnection(() => {
          const [client, accepted] = pair();
          runtime.accept(accepted);
          const connection: Connection = {
            send: (message) => {
              const packet = decodeClient(message);
              frames.push(packet._tag);
              client.send(message);
            },
            subscribe: (receive, close) =>
              client.subscribe((message) => {
                const packet = decodeServer(message);
                frames.push(packet._tag);
                if (packet._tag === "AnswerPart") answerParts.push(packet.bytes);
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
  maxBytes: number,
  use: (tap: Tap, Answers: AnswersCapability) => Effect.Effect<A, E, AnswersCapability>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const protocol = protocolWith(maxBytes);
        const Answers = Capability.define("bulk-answer", protocol);
        const { tap, owner } = yield* tapped(protocol);
        return yield* use(tap, Answers).pipe(
          Effect.provide(Capability.client(Answers)),
          Effect.provide(Binding.layer([Binding.to(Answers.slot, owner)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );

/** A generous bound: large enough that a call is never refused, only ever fragmented. */
const generous = 8 * 1024 * 1024;

/**
 * The exact byte length of the owner's own encoded `Exit` packet for `big({ count, size })`,
 * measured by reassembling the `AnswerPart`s a generous bound still fragments it into. `wire` is
 * ground truth for the two boundary tests below: the same call, over a connection whose declared
 * bound is exactly that measurement or one less.
 */
const calibrate = async (count: number, size: number) => {
  const exit = await overTap(generous, (tap, Answers) =>
    Effect.gen(function* () {
      const client = yield* Answers;
      const result = yield* client.big({ count, size });
      return { result, wire: concat(tap.answerParts).byteLength };
    }),
  );
  assert.ok(Exit.isSuccess(exit), `calibration call failed: ${String(exit)}`);
  return Exit.isSuccess(exit) ? exit.value : { result: [], wire: 0 };
};

test("an answer of exactly maxBytes arrives intact and equal", { timeout: 8000 }, async () => {
  const count = 5000;
  const size = 60;
  const { result: expected, wire } = await calibrate(count, size);
  assert.ok(
    wire > maxMessageBytes,
    `expected the calibration answer to need fragmenting, was ${wire}`,
  );
  const exit = await overTap(wire, (tap, Answers) =>
    Effect.gen(function* () {
      const client = yield* Answers;
      return yield* client.big({ count, size });
    }),
  );
  assert.ok(Exit.isSuccess(exit), `the exact-bound call failed: ${String(failureOf(exit))}`);
  assert.deepEqual(Exit.isSuccess(exit) ? exit.value : undefined, expected);
});

test(
  "one byte over the bound fails typed Unknown, reason transport/answer-over-limit",
  { timeout: 8000 },
  async () => {
    const count = 5000;
    const size = 60;
    const { wire } = await calibrate(count, size);
    const exit = await overTap(wire - 1, (tap, Answers) =>
      Effect.gen(function* () {
        const client = yield* Answers;
        return yield* Effect.exit(client.big({ count, size }));
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const result = Exit.isSuccess(exit) ? exit.value : Exit.void;
    const error = failureOf(result);
    assert.equal(error?.code, "Unknown", String(error));
    assert.equal(error?.reason, "transport/answer-over-limit");
  },
);

test(
  "acknowledgments pace the parts, and the owner never has two in flight",
  { timeout: 8000 },
  async () => {
    const seen: string[] = [];
    const exit = await overTap(generous, (tap, Answers) =>
      Effect.gen(function* () {
        const client = yield* Answers;
        const result = yield* client.big({ count: 8000, size: 70 });
        seen.push(...tap.frames);
        return result;
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the call itself failed: ${String(exit)}`);
    const parts = bulkFrames(seen);
    assert.ok(parts.length >= 5, `expected several parts, saw ${parts.length}`);
    // Strict alternation is what an owner that never has two parts in flight produces: each part
    // but the last is acknowledged before the next is sent, and the last is not, because the
    // request's own answer — the client's own decode of the assembled whole — ends it.
    assert.deepEqual(
      parts,
      parts.map((_, index) => (index % 2 === 0 ? "AnswerPart" : "Ack")),
    );
    assert.equal(parts.at(-1), "AnswerPart");
  },
);

test(
  "a connection lost between answer parts fails Unknown, reason transport/lost-after-send",
  { timeout: 8000 },
  async () => {
    const exit = await overTap(generous, (tap, Answers) =>
      Effect.gen(function* () {
        const client = yield* Answers;
        tap.hold = true;
        const call = yield* client
          .big({ count: 8000, size: 70 })
          .pipe(Effect.exit, Effect.forkScoped);
        yield* Effect.promise(() =>
          waitUntil(() => tap.frames.includes("AnswerPart"), "the first answer part to arrive"),
        );
        tap.live[0]?.close();
        return yield* Fiber.join(call);
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const result = Exit.isSuccess(exit) ? exit.value : Exit.void;
    assert.ok(Exit.isFailure(result), "the request should not have succeeded");
    const error = failureOf(result);
    assert.equal(error?.code, "Unknown", String(error));
    assert.equal(error?.reason, "transport/lost-after-send");
  },
);

test(
  "ordinary calls on the same connection are not delayed by a bulk answer in flight",
  { timeout: 8000 },
  async () => {
    const exit = await overTap(generous, (tap, Answers) =>
      Effect.gen(function* () {
        const client = yield* Answers;
        tap.hold = true;
        const big = yield* client.big({ count: 8000, size: 70 }).pipe(Effect.forkScoped);
        yield* Effect.promise(() =>
          waitUntil(() => tap.frames.includes("AnswerPart"), "the first answer part to arrive"),
        );
        // Only that first part stays withheld; everything after it is let through, so the
        // transfer is stopped between two parts while the connection is otherwise live.
        tap.hold = false;
        const small = yield* client.small({ value: "hi" }).pipe(Effect.timeoutOption("5 seconds"));
        const partsWhileHeld = bulkFrames(tap.frames).length;
        tap.release();
        return { small, partsWhileHeld, big: yield* Fiber.join(big) };
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const result = Exit.isSuccess(exit) ? exit.value : undefined;
    assert.deepEqual(result?.small, Option.some("hi"));
    assert.equal(result?.partsWhileHeld, 1);
    assert.equal(result?.big.length, 8000);
  },
);

test("a bulk answer outside a Binary.protocol is refused where its slot is declared", () => {
  const Wide = Rpc.make("wide", { success: Schema.String });
  const json = RpcGroup.make(Binary.bulkAnswer(Wide, { maxBytes: 1024 }));
  const refusal = (error: unknown) =>
    error instanceof SewedError &&
    error.code === "Protocol" &&
    error.message === "A bulk answer needs a Binary.protocol: wide";
  assert.throws(() => Binding.slot("json-bulk-answer", json), refusal);
  assert.throws(() => Capability.define("json-bulk-answer", json), refusal);
  // The same group in a Binary.protocol is fine; only the encoding was wrong.
  assert.equal(
    Binding.slot("binary-bulk-answer", Binary.protocol(json)).key,
    "sewed/binding/binary-bulk-answer",
  );
});

test("a stream-shaped operation is refused at Binary.bulkAnswer's own annotation", () => {
  const Feed = Rpc.make("feed", { success: Schema.String, stream: true });
  assert.throws(
    () => Binary.bulkAnswer(Feed, { maxBytes: 1024 }),
    (error: unknown) =>
      error instanceof SewedError &&
      error.code === "Protocol" &&
      error.message === "Binary.bulkAnswer needs a unary operation: feed",
  );
});

test("Binary.bulkAnswer refuses a bound that is not a positive integer of at most 64 MiB", () => {
  for (const maxBytes of [0, -1, 1.5, Bulk.maxBulkBytes + 1, Number.NaN]) {
    assert.throws(
      () => Binary.bulkAnswer(Small, { maxBytes }),
      (error: unknown) => error instanceof SewedError && error.code === "Protocol",
      String(maxBytes),
    );
  }
});
