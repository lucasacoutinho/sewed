import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Scope } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, Capability, Diagnostics, SewedError } from "../lib/index.js";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import * as Testing from "../lib/Testing.js";
import * as Bulk from "../lib/internal/Bulk.js";
import {
  concat,
  decodeClient,
  decodeServer,
  encode,
  maxMessageBytes,
  minPartBytes,
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
/** Answers only once the test opens its gate: a request still running beside a bulk answer. */
const Slow = Rpc.make("slow", {
  payload: { value: Schema.String },
  success: Schema.String,
  error: SewedError,
});
const protocolWith = (maxBytes: number) =>
  Binary.protocol(RpcGroup.make(Binary.bulkAnswer(Big, { maxBytes }), Small, Slow));
type Protocol = ReturnType<typeof protocolWith>;
const makeAnswers = (maxBytes: number) => Capability.define("bulk-answer", protocolWith(maxBytes));
type AnswersCapability = ReturnType<typeof makeAnswers>;

const handlers = (protocol: Protocol, gate: Deferred.Deferred<void>) =>
  protocol.toLayer({
    big: ({ count, size }) => Effect.succeed(items(count, size)),
    small: ({ value }) => Effect.succeed(value),
    slow: ({ value }) => Deferred.await(gate).pipe(Effect.as(value)),
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
  /** Opens `slow`'s gate. */
  readonly open: () => void;
  /** Closes the owner's own scope, as its runtime shutting down would. */
  readonly closeOwner: Effect.Effect<void>;
  /** Runs as each owner packet is recorded, before the client receives it. */
  onFrame: (tag: string) => void;
  readonly diagnostics: Effect.Success<ReturnType<typeof Diagnostics.make>>;
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
    const gate = Deferred.makeUnsafe<void>();
    const ownerScope = yield* Scope.make();
    yield* Effect.addFinalizer(() => Scope.close(ownerScope, Exit.void));
    const diagnostics = yield* Diagnostics.make();
    const tap: Tap = {
      frames,
      answerParts,
      live,
      hold: false,
      release: () => {
        for (const deliver of held.splice(0)) deliver();
      },
      open: () => Deferred.doneUnsafe(gate, Effect.void),
      closeOwner: Scope.close(ownerScope, Exit.void),
      onFrame: () => {},
      diagnostics,
    };
    const services = yield* Layer.build(handlers(protocol, gate));
    const runtime = yield* server(protocol, { ownerId: "bulk-answer" }).pipe(
      Effect.provideContext(services),
      Effect.provide(diagnostics.layer),
      Scope.provide(ownerScope),
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
                tap.onFrame(packet._tag);
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
  use: (
    tap: Tap,
    Answers: AnswersCapability,
  ) => Effect.Effect<A, E, AnswersCapability | Scope.Scope>,
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
  const exit = await overTap(wire, (_tap, Answers) =>
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
    const exit = await overTap(wire - 1, (_tap, Answers) =>
      Effect.gen(function* () {
        const client = yield* Answers;
        return yield* Effect.exit(client.big({ count, size }));
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const result = exit.value;
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
    const result = exit.value;
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

test(
  "an owner closing mid-answer finishes promptly and sends no further part",
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
        // The first part stays withheld, so the owner is waiting on its acknowledgment when its
        // own scope closes.
        const closed = yield* tap.closeOwner.pipe(Effect.timeoutOption("3 seconds"));
        const parts = bulkFrames(tap.frames).length;
        const result = yield* Fiber.join(call).pipe(Effect.timeoutOption("3 seconds"));
        return { closed, parts, result };
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const value = Exit.isSuccess(exit) ? exit.value : undefined;
    assert.ok(Option.isSome(value?.closed ?? Option.none()), "the owner's scope did not close");
    assert.equal(value?.parts, 1, "the owner sent a part after it began closing");
    const result = value?.result;
    assert.ok(result !== undefined && Option.isSome(result), "the call never answered");
    const error = Option.isSome(result) ? failureOf(result.value) : undefined;
    assert.equal(error?.code, "Unknown", String(error));
    assert.equal(error?.reason, "transport/lost-after-send");
  },
);

/** The frames after the caller's own `Interrupt` left, both directions. */
const afterInterrupt = (frames: readonly string[]) => frames.slice(frames.indexOf("Interrupt") + 1);

test(
  "a caller that cancels a large answer mid-parts leaves the connection to other requests",
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
        // A second request whose handler is still running when the first is cancelled.
        const slow = yield* client.slow({ value: "slow" }).pipe(Effect.exit, Effect.forkScoped);
        yield* Effect.promise(() =>
          waitUntil(
            () => tap.frames.filter((tag) => tag === "Request").length === 2,
            "the second request to leave",
          ),
        );
        yield* Fiber.interrupt(big);
        // The withheld part now arrives, as a transport that was merely slow would deliver it,
        // for a request the client no longer tracks.
        tap.hold = false;
        tap.release();
        tap.open();
        const slowExit = yield* Fiber.join(slow).pipe(Effect.timeoutOption("3 seconds"));
        const later = yield* client
          .small({ value: "later" })
          .pipe(Effect.timeoutOption("3 seconds"));
        return { slowExit, later, frames: [...tap.frames], connections: tap.live.length };
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const value = Exit.isSuccess(exit) ? exit.value : undefined;
    assert.deepEqual(value?.slowExit, Option.some(Exit.succeed("slow")));
    assert.deepEqual(value?.later, Option.some("later"));
    assert.equal(value?.connections, 1, "the cancelled answer cost the shared connection");
    const after = afterInterrupt(value?.frames ?? []);
    assert.ok(value?.frames.includes("Interrupt"), "the cancellation never reached the owner");
    assert.deepEqual(bulkFrames(after), [], "a part left, or was acknowledged, after the cancel");
  },
);

test(
  "a caller that gives up between two parts stops the owner there, and no other call notices",
  { timeout: 8000 },
  async () => {
    const exit = await overTap(generous, (tap, Answers) =>
      Effect.gen(function* () {
        const client = yield* Answers;
        const slow = yield* client.slow({ value: "slow" }).pipe(Effect.exit, Effect.forkScoped);
        const big = yield* client.big({ count: 20000, size: 70 }).pipe(Effect.forkScoped);
        // Nothing is withheld: the caller gives up as the third part reaches it.
        tap.onFrame = (tag) => {
          if (tag === "AnswerPart" && tap.answerParts.length === 3) big.interruptUnsafe();
        };
        const bigExit = yield* Fiber.await(big);
        tap.open();
        const slowExit = yield* Fiber.join(slow).pipe(Effect.timeoutOption("3 seconds"));
        const later = yield* client
          .small({ value: "later" })
          .pipe(Effect.timeoutOption("3 seconds"));
        return { bigExit, slowExit, later, frames: [...tap.frames], connections: tap.live.length };
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const value = Exit.isSuccess(exit) ? exit.value : undefined;
    assert.ok(
      value !== undefined &&
        Exit.isFailure(value.bigExit) &&
        Cause.hasInterrupts(value.bigExit.cause),
      `the cancelled call answered: ${String(value?.bigExit)}`,
    );
    assert.deepEqual(value?.slowExit, Option.some(Exit.succeed("slow")));
    assert.deepEqual(value?.later, Option.some("later"));
    assert.equal(value?.connections, 1, "the cancelled answer cost the shared connection");
    assert.deepEqual(bulkFrames(afterInterrupt(value?.frames ?? [])), []);
  },
);

test(
  "a bulk answer's request stays open until its last part leaves, or its caller gives up",
  { timeout: 8000 },
  async () => {
    const exit = await overTap(generous, (tap, Answers) =>
      Effect.gen(function* () {
        const client = yield* Answers;
        const openRequests = Effect.map(tap.diagnostics.snapshot, (snapshot) =>
          snapshot.requests.map((request) => request.procedure),
        );
        const endings = Effect.map(tap.diagnostics.snapshot, (snapshot) =>
          snapshot.events.flatMap(({ event }) =>
            event._tag === "RequestEnded" ? [event.outcome] : [],
          ),
        );
        tap.hold = true;
        const whole = yield* client.big({ count: 8000, size: 70 }).pipe(Effect.forkScoped);
        yield* Effect.promise(() =>
          waitUntil(() => tap.frames.includes("AnswerPart"), "the first answer part to arrive"),
        );
        const midAnswer = yield* openRequests;
        tap.hold = false;
        tap.release();
        yield* Fiber.join(whole);
        const afterWhole = yield* endings;
        tap.hold = true;
        const parts = tap.answerParts.length;
        const abandoned = yield* client.big({ count: 8000, size: 70 }).pipe(Effect.forkScoped);
        yield* Effect.promise(() =>
          waitUntil(() => tap.answerParts.length > parts, "the second answer's first part"),
        );
        yield* Fiber.interrupt(abandoned);
        tap.hold = false;
        tap.release();
        const afterAbandoned = yield* endings;
        return { midAnswer, afterWhole, afterAbandoned, open: yield* openRequests };
      }),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const value = Exit.isSuccess(exit) ? exit.value : undefined;
    assert.deepEqual(value?.midAnswer, ["big"]);
    assert.deepEqual(value?.afterWhole, ["success"]);
    assert.deepEqual(value?.afterAbandoned, ["success", "interrupted"]);
    assert.deepEqual(value?.open, []);
  },
);

type FakePart = {
  readonly bytes: Uint8Array;
  readonly final: boolean;
  readonly requestId?: string | number;
};

/**
 * A fake owner that answers `big` with whatever parts a scenario dictates, pacing them on the
 * client's acknowledgments as a real owner does, and answers `small` honestly. What the client
 * does with a part no honest owner sends is the question.
 */
const fakeOwner = (scenario: (requestId: string | number) => FakePart[]) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const protocol = protocolWith(generous);
        const Answers = Capability.define("bulk-answer-fake", protocol);
        const seen = { connects: 0, acks: 0 };
        const owner = makeOwner(
          "bulk-answer-fake",
          protocol,
          {
            connect: scopedConnection(() => {
              seen.connects++;
              let receive: (message: unknown) => void = () => {};
              let queue: FakePart[] = [];
              let current: string | number = 0;
              const next = () => {
                const part = queue.shift();
                if (part === undefined) return;
                receive(
                  encode(
                    {
                      _tag: "AnswerPart",
                      requestId: part.requestId ?? current,
                      bytes: part.bytes,
                      final: part.final,
                    },
                    "binary",
                  ),
                );
                // A final part asks for no acknowledgment; whatever follows it is sent anyway.
                if (part.final) setImmediate(next);
              };
              const connection: Connection = {
                send: (message) => {
                  const packet = decodeClient(message, "binary");
                  if (packet._tag === "Request" && packet.tag === "big") {
                    current = packet.id;
                    queue = scenario(packet.id);
                    setImmediate(next);
                  }
                  if (packet._tag === "Request" && packet.tag === "small") {
                    const value = Schema.decodeUnknownSync(Schema.Struct({ value: Schema.String }))(
                      packet.payload,
                    ).value;
                    receive(
                      encode(
                        { _tag: "Exit", requestId: packet.id, exit: { _tag: "Success", value } },
                        "binary",
                      ),
                    );
                  }
                  if (packet._tag === "Ack") {
                    seen.acks++;
                    setImmediate(next);
                  }
                },
                subscribe: (deliver) => {
                  receive = deliver;
                  return () => {};
                },
                close: () => {},
              };
              return connection;
            }),
          },
          {},
        );
        return yield* Effect.gen(function* () {
          const client = yield* Answers;
          const big = yield* Effect.exit(client.big({ count: 0, size: 0 })).pipe(
            Effect.timeoutOption("3 seconds"),
          );
          const small = yield* client
            .small({ value: "ok" })
            .pipe(Effect.timeoutOption("3 seconds"));
          return { big, small, ...seen };
        }).pipe(
          Effect.provide(Capability.client(Answers)),
          Effect.provide(Binding.layer([Binding.to(Answers.slot, owner)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );

const answer = items(1000, 20);
/** The real `Exit` packet for `answer`, in two parts that respect the owner's floor. */
const honestParts = (requestId: string | number): FakePart[] => {
  const packet = encode(
    { _tag: "Exit", requestId, exit: { _tag: "Success", value: answer } },
    "binary",
  );
  assert.ok(packet.byteLength > minPartBytes, "the answer must outgrow one part");
  return [
    { bytes: packet.subarray(0, minPartBytes), final: false },
    { bytes: packet.subarray(minPartBytes), final: true },
  ];
};

test(
  "an answer part for a request the client no longer tracks is dropped unacknowledged",
  {
    timeout: 8000,
  },
  async () => {
    const exit = await fakeOwner((requestId) => [
      { requestId: "gone", bytes: new Uint8Array(minPartBytes), final: true },
      ...honestParts(requestId),
    ]);
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const value = Exit.isSuccess(exit) ? exit.value : undefined;
    assert.deepEqual(value?.big, Option.some(Exit.succeed(answer)));
    assert.equal(value?.acks, 1);
    assert.equal(value?.connects, 1);
    assert.deepEqual(value?.small, Option.some("ok"));
  },
);

test(
  "an answer part after the final one is dropped unacknowledged",
  {
    timeout: 8000,
  },
  async () => {
    const exit = await fakeOwner((requestId) => [
      ...honestParts(requestId),
      { bytes: new Uint8Array(minPartBytes), final: false },
    ]);
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const value = Exit.isSuccess(exit) ? exit.value : undefined;
    assert.deepEqual(value?.big, Option.some(Exit.succeed(answer)));
    assert.equal(value?.acks, 1, "the part after the final one was acknowledged");
    assert.equal(value?.connects, 1);
  },
);

test(
  "a non-final answer part under the floor ends the connection, the refusal kept as the cause",
  { timeout: 8000 },
  async () => {
    const exit = await fakeOwner((requestId) => [
      ...Array.from({ length: 1000 }, () => ({ bytes: new Uint8Array(1), final: false })),
      ...honestParts(requestId),
    ]);
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const value = Exit.isSuccess(exit) ? exit.value : undefined;
    const big = value?.big;
    assert.ok(big !== undefined && Option.isSome(big), "the call never answered");
    const error = Option.isSome(big) ? failureOf(big.value) : undefined;
    assert.equal(error?.code, "Unknown", String(error));
    assert.equal(error?.reason, "transport/lost-after-send");
    // The refusal crosses as its encoded fields, the only form the caller's decode admits.
    assert.deepEqual(error?.cause, {
      _tag: "SewedError",
      code: "Protocol",
      message: "Invalid bulk answer part",
    });
    assert.equal(value?.acks, 0, "a part under the floor was acknowledged");
    // The next call reconnects.
    assert.deepEqual(value?.small, Option.some("ok"));
    assert.equal(value?.connects, 2);
  },
);

test(
  "an answer over the envelope on an operation whose error schema cannot carry SewedError fails Protocol",
  { timeout: 8000 },
  async () => {
    const Bare = Rpc.make("bare", { payload: { size: Schema.Number }, success: Schema.String });
    const BareWide = Rpc.make("bareWide", {
      payload: { size: Schema.Number },
      success: Schema.String,
    });
    const protocol = Binary.protocol(
      RpcGroup.make(Bare, Binary.bulkAnswer(BareWide, { maxBytes: 1024 })),
    );
    const Slot = Binding.slot("bulk-answer-no-error", protocol);
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function* () {
          const services = yield* Layer.build(
            protocol.toLayer({
              bare: ({ size }) => Effect.succeed("x".repeat(size)),
              bareWide: ({ size }) => Effect.succeed("x".repeat(size)),
            }),
          );
          const runtime = yield* server(protocol, { ownerId: "no-error" }).pipe(
            Effect.provideContext(services),
          );
          const owner = makeOwner(
            "no-error",
            protocol,
            {
              connect: scopedConnection(() => {
                const [client, accepted] = pair();
                runtime.accept(accepted);
                return client;
              }),
            },
            {},
          );
          return yield* Effect.gen(function* () {
            const client = yield* Slot();
            return {
              bare: yield* Effect.exit(client.bare({ size: maxMessageBytes })),
              wide: yield* Effect.exit(client.bareWide({ size: 2048 })),
              after: yield* client.bare({ size: 2 }),
            };
          }).pipe(
            Effect.provide(Binding.layer([Binding.to(Slot, owner)])),
            Effect.provide(Testing.main),
          );
        }),
      ),
    );
    assert.ok(Exit.isSuccess(exit), `the test program itself failed: ${String(exit)}`);
    const value = Exit.isSuccess(exit) ? exit.value : undefined;
    // The typed refusal the owner substitutes cannot decode as this operation's error, so the
    // caller reads the decode failure as Protocol, typed, and the connection stays usable.
    for (const [label, result] of [
      ["bare", value?.bare],
      ["bareWide", value?.wide],
    ] as const) {
      const error = result === undefined ? undefined : failureOf(result);
      assert.equal(error?.code, "Protocol", `${label}: ${String(error)}`);
      assert.match(error?.message ?? "", new RegExp(`^${label}: Expected never`));
    }
    assert.equal(value?.after, "xx");
  },
);
