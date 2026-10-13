import assert from "node:assert/strict";
import { test } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { Deferred, Effect, Fiber, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Binary from "../lib/Binary.js";
import * as Binding from "../lib/PublicBinding.js";
import * as Capability from "../lib/Capability.js";
import * as Testing from "../lib/Testing.js";
import { SewedError } from "../lib/SewedError.js";
import {
  Noncanonical,
  arenaBytes,
  decodeBinary,
  encodeBinary,
  largeBytes,
  utf16Type,
} from "../lib/internal/BinaryWire.js";
import {
  decodeClient,
  decodeServer,
  encode,
  encodeChunks,
  maxMessageBytes,
} from "../lib/internal/Transport.js";

class Rejected extends Schema.TaggedError<Rejected>()("Rejected", { value: Schema.Finite }) {}

const protocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("echo", { payload: { bytes: Binary.Bytes }, success: Binary.Bytes }),
    Rpc.make("bytes", { success: Binary.Bytes, stream: true }),
    Rpc.make("reject", { error: Rejected, success: Schema.Void }),
  ),
);
const slot = Binding.slot("binary-test", protocol);

test("binary validation preserves word tails and rejects reordered numeric map keys", () => {
  for (let padding = 0; padding < 16; padding++) {
    const prefix = Array.from({ length: padding }, () => 0);
    const expected = [...prefix, { 1: 11, 2: 22 }];
    const canonical = encodeBinary(expected);
    const reordered = encodeBinary([
      ...prefix,
      new Map([
        ["2", 22],
        ["1", 11],
      ]),
    ]);
    for (let offset = 0; offset < 8; offset++) {
      const storage = new Uint8Array(offset + canonical.byteLength + 3).fill(0xff);
      storage.set(canonical, offset);
      assert.deepEqual(
        decodeBinary(storage.subarray(offset, offset + canonical.byteLength)),
        expected,
      );
      storage.set(reordered, offset);
      assert.throws(
        () => decodeBinary(storage.subarray(offset, offset + reordered.byteLength)),
        Noncanonical,
      );
    }
  }
});

test("binary RPC retains byte arrays, declared errors and bounded stream batches", async () => {
  const input = Uint8Array.from({ length: 64 * 1024 }, (_, index) => index % 251);
  const total = 12 * 1024 * 1024;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* slot();
        assert.deepEqual(Uint8Array.from(yield* client.echo({ bytes: input })), input);
        const error = yield* client.reject().pipe(Effect.flip);
        assert.ok(error instanceof Rejected);
        assert.equal(error.value, 42);
        const actual = yield* client.bytes().pipe(
          Stream.runFold(
            () => 0,
            (size, bytes) => {
              assert.ok(bytes instanceof Uint8Array);
              assert.ok(bytes.length <= Binary.chunkBytes);
              assert.equal(bytes[0], 17);
              assert.equal(bytes.at(-1), 17);
              return size + bytes.byteLength;
            },
          ),
        );
        assert.equal(actual, total);
        assert.equal((yield* client.echo({ bytes: input })).byteLength, input.byteLength);
      }).pipe(
        Effect.provide(
          Testing.layer(
            slot,
            protocol.toLayer({
              echo: ({ bytes }) => Effect.succeed(bytes),
              bytes: () => Binary.chunks(Stream.make(new Uint8Array(total).fill(17))),
              reject: () => Effect.fail(new Rejected({ value: 42 })),
            }),
          ),
        ),
      ),
    ),
  );
});

test("interrupting a binary consumer finalizes the producing stream", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const released = yield* Deferred.make<void>();
        const handlers = protocol.toLayer({
          echo: ({ bytes }) => Effect.succeed(bytes),
          reject: () => Effect.fail(new Rejected({ value: 1 })),
          bytes: () =>
            Stream.unwrap(
              Effect.gen(function* () {
                yield* Effect.addFinalizer(() => Deferred.succeed(released, undefined));
                return Stream.make(new Uint8Array([1, 2, 3])).pipe(Stream.concat(Stream.never));
              }),
            ),
        });
        yield* Effect.gen(function* () {
          const client = yield* slot();
          yield* client.bytes().pipe(Stream.take(1), Stream.runDrain);
          yield* Deferred.await(released).pipe(Effect.timeout("1 second"));
        }).pipe(Effect.provide(Testing.layer(slot, handlers)));
      }),
    ),
  );
});

test("binary envelopes reject malformed packets without corrupting later decoding", () => {
  const request = {
    _tag: "Request",
    id: "1",
    tag: "echo",
    payload: { bytes: new Uint8Array([1]) },
    headers: [],
  };
  const wire = encode(request, "binary");
  assert.ok(wire instanceof Uint8Array);
  assert.equal(decodeClient(wire, "binary")._tag, "Request");
  assert.throws(() => decodeClient(wire, "json"));
  assert.throws(() => decodeClient(encode(request), "binary"));
  const malformed = [
    new Uint8Array(),
    wire.subarray(0, wire.length - 1),
    new Uint8Array([...wire, 0xc0]),
    new Uint8Array([...wire, 0xc4]),
    new Uint8Array(maxMessageBytes + 1),
    // A short packet cannot reserve a 32-bit array, map, string or byte buffer.
    ...[0xdd, 0xdf, 0xdb, 0xc6].map((header) => new Uint8Array([header, 255, 255, 255, 255])),
  ];
  for (const packet of malformed) {
    assert.throws(() => decodeClient(packet, "binary"));
    assert.deepEqual(decodeClient(wire, "binary"), request);
  }
});

/**
 * Resolves with `read()` once it has held still for `turns` consecutive event-loop turns.
 *
 * Turns, not milliseconds: the producer below is driven by messages, so it can only advance when this
 * process actually runs. Under CPU contention fifty milliseconds of clock can be almost no CPU, and a
 * fixed sleep then sampled a producer that had not reached its plateau yet.
 */
const quiescent = async (read: () => number, turns = 200, limit = 200_000): Promise<number> => {
  let last = read();
  let still = 0;
  for (let spent = 0; still < turns; spent++) {
    if (spent > limit)
      throw new Error(`still changing after ${limit} event-loop turns, at ${last}`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const now = read();
    if (now === last) still++;
    else {
      last = now;
      still = 0;
    }
  }
  return last;
};

test("a stalled binary consumer stops production before the full source is buffered", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const first = yield* Deferred.make<void>();
        const blocked = yield* Deferred.make<void>();
        const finalized = yield* Deferred.make<void>();
        let produced = 0;
        const handlers = protocol.toLayer({
          echo: ({ bytes }) => Effect.succeed(bytes),
          reject: () => Effect.fail(new Rejected({ value: 1 })),
          bytes: () =>
            Stream.range(0, 4095).pipe(
              Stream.rechunk(1),
              Stream.map(() => {
                produced++;
                return new Uint8Array(Binary.chunkBytes);
              }),
              Stream.ensuring(Deferred.succeed(finalized, undefined)),
            ),
        });
        yield* Effect.gen(function* () {
          const client = yield* slot();
          const consumer = yield* client.bytes().pipe(
            Stream.runForEach(() =>
              Deferred.succeed(first, undefined).pipe(Effect.andThen(Deferred.await(blocked))),
            ),
            Effect.forkScoped,
          );
          yield* Deferred.await(first);
          const stalled = yield* Effect.promise(() => quiescent(() => produced));
          assert.ok(stalled > 0 && stalled < 128, `producer ran ahead by ${stalled} chunks`);
          assert.equal(yield* Effect.promise(() => quiescent(() => produced)), stalled);
          const independent = yield* client
            .echo({ bytes: new Uint8Array([9]) })
            .pipe(Effect.timeout("1 second"));
          assert.equal(independent[0], 9, "stalled stream blocked an independent RPC response");
          yield* Fiber.interrupt(consumer);
          yield* Deferred.await(finalized).pipe(Effect.timeout("1 second"));
        }).pipe(Effect.provide(Testing.layer(slot, handlers)));
      }),
    ),
  );
});

test("binary stream fragmentation preserves value order and owns queued packet bytes", () => {
  const values: readonly [Uint8Array, ...Uint8Array[]] = [
    new Uint8Array(Binary.chunkBytes),
    ...Array.from({ length: 10 }, (_, index) => new Uint8Array(Binary.chunkBytes).fill(index + 1)),
  ];
  const frames = [...encodeChunks({ _tag: "Chunk", requestId: "1", values }, "binary")];
  assert.equal(frames.length, 4);
  assert.equal(frames.at(-1)?.final, true);
  assert.ok(frames.slice(0, -1).every((frame) => !frame.final));
  const decoded = frames.flatMap<unknown>(({ message }) => {
    assert.ok(message instanceof Uint8Array);
    assert.ok(message.byteLength <= maxMessageBytes);
    const value = decodeServer(message, "binary");
    assert.equal(value._tag, "Chunk");
    return value._tag === "Chunk" ? value.values : [];
  });
  assert.equal(decoded.length, values.length);
  decoded.forEach((value, index) => {
    assert.ok(value instanceof Uint8Array);
    assert.deepEqual(Uint8Array.from(value), values[index]);
  });
});

test("binary batches account for array header growth at the exact envelope bound", () => {
  const base = { _tag: "Chunk", requestId: "bounds-\ud800" } as const;
  for (const count of [1, 15, 16, 65535, 65536]) {
    const tail = Array.from({ length: count - 1 }, () => null);
    const overhead =
      encode({ ...base, values: [new Uint8Array(65536), ...tail] }, "binary").byteLength - 65536;
    const values = [new Uint8Array(maxMessageBytes - overhead).fill(41), ...tail] as const;
    const frames = [...encodeChunks({ ...base, values }, "binary")];
    assert.equal(frames.length, 1);
    const exact = frames[0];
    assert.ok(exact !== undefined);
    assert.equal(exact.message.byteLength, maxMessageBytes);
    const decoded = decodeServer(exact.message, "binary");
    assert.equal(decoded._tag, "Chunk");
    if (decoded._tag === "Chunk") assert.deepEqual(decoded.values, values);

    const splitValues = [new Uint8Array(maxMessageBytes - overhead + 1).fill(42), ...tail] as const;
    if (count === 1) {
      const oversized = encodeChunks({ ...base, values: splitValues }, "binary");
      assert.throws(
        () => oversized.next(),
        (error: unknown) => error instanceof SewedError && error.code === "Limit",
      );
      continue;
    }
    const split = [...encodeChunks({ ...base, values: splitValues }, "binary")];
    assert.ok(split.length > 1);
    const restored = split.flatMap(({ message }) => {
      assert.ok(message.byteLength <= maxMessageBytes);
      const packet = decodeServer(message, "binary");
      assert.equal(packet._tag, "Chunk");
      return packet._tag === "Chunk" ? packet.values : [];
    });
    assert.deepEqual(restored, splitValues);
    assert.equal(split.at(-1)?.final, true);
    assert.ok(split.slice(0, -1).every(({ final }) => !final));
  }
});

/** A JSON value as `main` gets one from `JSON.parse`: `"__proto__"` is an own key, not a prototype. */
const withProto = () => JSON.parse('{"__proto__":{"x":1},"a":2}');

const assertOwnProto = (value: unknown) => {
  assert.ok(typeof value === "object" && value !== null);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.ok(Object.hasOwn(value, "__proto__"));
  assert.deepEqual(Object.keys(value), ["__proto__", "a"]);
  assert.deepEqual(Object.getOwnPropertyDescriptor(value, "__proto__"), {
    value: { x: 1 },
    writable: true,
    enumerable: true,
    configurable: true,
  });
  assert.equal(JSON.stringify(value), '{"__proto__":{"x":1},"a":2}');
};

test("a JSON __proto__ key round-trips the binary wire as an own key, nested and in arrays", () => {
  const nested = JSON.parse(
    '[{"__proto__":{"x":1},"a":2},{"b":{"__proto__":{"x":1},"a":2}},[{"__proto__":{"x":1},"a":2}]]',
  );
  const decoded = decodeBinary(encodeBinary(withProto()));
  assertOwnProto(decoded);
  const inArrays = decodeBinary(encodeBinary(nested));
  assert.ok(Array.isArray(inArrays));
  assertOwnProto(inArrays[0]);
  assertOwnProto(inArrays[1].b);
  assertOwnProto(inArrays[2][0]);
  assert.equal(JSON.stringify(inArrays), JSON.stringify(nested));
  // The same value inside an envelope, decoded where the client decodes an answer.
  const exit = decodeServer(
    encode(
      { _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: withProto() } },
      "binary",
    ),
    "binary",
  );
  assert.ok(exit._tag === "Exit" && exit.exit._tag === "Success");
  assertOwnProto(exit.exit.value);
  // No prototype was set anywhere along the way.
  assert.equal(Reflect.get({}, "x"), undefined);
  // A map keyed by anything but strings is no JSON value, and is refused rather than coerced.
  assert.throws(() => decodeBinary(encodeBinary(new Map([[1, 2]]))), /Noncanonical|not a string/);
  assert.throws(() => decodeBinary(encodeBinary({ a: new Map([[true, 2]]) })));
});

const JsonShaped = Schema.Struct({ index: Schema.Finite, data: Schema.Unknown });
const Bulk = Rpc.make("bulk", { success: Schema.Array(JsonShaped) });
const jsonShapedGroup = <B extends Rpc.Any>(bulk: B) =>
  RpcGroup.make(
    Rpc.make("unknown", { payload: { value: Schema.Unknown }, success: Schema.Unknown }),
    Rpc.make("record", { success: Schema.Record(Schema.String, Schema.Unknown) }),
    Rpc.make("struct", { success: Schema.Struct({ data: Schema.Unknown }) }),
    bulk,
    Rpc.make("slow", { success: Schema.String }),
  );
const jsonShapedBinary = Binary.protocol(
  jsonShapedGroup(Binary.bulkAnswer(Bulk, { maxBytes: 4 * 1024 * 1024 })),
);
// The control: the JSON protocol, where `JSON.parse` has always produced the own key. Its "bulk"
// answer is an ordinary one, so it stays under one envelope.
const jsonShapedJson = jsonShapedGroup(Bulk);

for (const [name, protocol, count] of [
  ["a Binary.protocol", jsonShapedBinary, 20_000],
  ["the JSON protocol", jsonShapedJson, 100],
] as const) {
  const capability = Capability.define("json-shaped-roundtrip", protocol);
  test(`an answer and a bulk answer carrying a JSON __proto__ key arrive intact over ${name}`, async () => {
    // On the binary protocol, enough rows that the bulk answer leaves in parts, each carrying the key.
    const rows = Array.from({ length: count }, (_, index) => ({ index, data: withProto() }));
    const handlers = capability.protocol.toLayer({
      unknown: ({ value }) => Effect.succeed(value),
      record: () => Effect.succeed(withProto()),
      struct: () => Effect.succeed({ data: withProto() }),
      bulk: () => Effect.succeed(rows),
      slow: () => Effect.succeed("beside"),
    });
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const operations = yield* capability;
          const [unknown, record, struct, bulk, beside] = yield* Effect.all(
            [
              operations.unknown({ value: withProto() }),
              operations.record(),
              operations.struct(),
              operations.bulk(),
              operations.slow(),
            ],
            { concurrency: "unbounded" },
          );
          return { unknown, record, struct, bulk, beside };
        }).pipe(Effect.provide(Testing.client(capability, handlers))),
      ),
    );
    assertOwnProto(result.unknown);
    assertOwnProto(result.record);
    assertOwnProto(result.struct.data);
    assert.equal(result.bulk.length, rows.length);
    for (const row of [result.bulk[0], result.bulk.at(-1)]) assertOwnProto(row?.data);
    assert.equal(JSON.stringify(result.bulk), JSON.stringify(rows));
    assert.equal(result.beside, "beside");
  });
}

/** Strings UTF-8 cannot carry: each holds a lone surrogate, short and past msgpackr's 64-unit path. */
const illFormed = {
  shortHigh: "a\ud800b",
  shortLow: "\udc00",
  longHigh: `${"x".repeat(200)}\ud83d`,
  longLow: `\udfff${"é".repeat(199)}`,
} as const;

const unitsOf = (value: string) => Array.from(value, (_, index) => value.charCodeAt(index));

/** The same string: `===`, and the same UTF-16 code units, one by one. */
const assertSameString = (actual: unknown, expected: string) => {
  assert.equal(typeof actual, "string");
  assert.ok(actual === expected, "the string changed on the way");
  assert.deepEqual(unitsOf(String(actual)), unitsOf(expected));
};

/** A value holding every ill-formed string, as a value and as a key, nested in objects and arrays. */
const withLoneSurrogates = () => ({
  ...illFormed,
  keys: Object.fromEntries(Object.values(illFormed).map((key, index) => [key, index])),
  nested: [{ deeper: [illFormed.shortHigh, { [illFormed.longLow]: illFormed.longHigh }] }],
  well: "a well-formed 😀 string",
});

const assertLoneSurrogates = (value: unknown) => {
  const expected = withLoneSurrogates();
  assert.ok(typeof value === "object" && value !== null);
  for (const [name, string] of Object.entries(illFormed))
    assertSameString(Reflect.get(value, name), string);
  const keys: unknown = Reflect.get(value, "keys");
  assert.ok(typeof keys === "object" && keys !== null);
  const actualKeys = Object.keys(keys);
  assert.equal(actualKeys.length, Object.keys(expected.keys).length);
  Object.keys(expected.keys).forEach((key, index) => assertSameString(actualKeys[index], key));
  // `JSON.stringify` escapes a lone surrogate, so equal output means equal code units throughout.
  assert.equal(JSON.stringify(value), JSON.stringify(expected));
};

test("a string with a lone surrogate round-trips the binary wire exactly, short and long, value and key", () => {
  const packet = encodeBinary(withLoneSurrogates());
  const decoded = decodeBinary(packet);
  assertLoneSurrogates(decoded);
  // Canonical: what was decoded encodes to the very same bytes.
  assert.deepEqual([...encodeBinary(decoded)], [...packet]);
  for (const string of Object.values(illFormed)) {
    assertSameString(decodeBinary(encodeBinary(string)), string);
    const decodedArray = decodeBinary(encodeBinary([string]));
    assert.ok(Array.isArray(decodedArray));
    assertSameString(decodedArray[0], string);
  }
  // Inside an envelope, decoded where the client decodes an answer.
  const exit = decodeServer(
    encode(
      { _tag: "Exit", requestId: "1", exit: { _tag: "Success", value: withLoneSurrogates() } },
      "binary",
    ),
    "binary",
  );
  assert.ok(exit._tag === "Exit" && exit.exit._tag === "Success");
  assertLoneSurrogates(exit.exit.value);
});

test("only a string UTF-8 cannot carry travels as UTF-16, and only whole code units", () => {
  // "ab" as UTF-16: a well-formed string has one encoding, and this is not it.
  assert.throws(
    () => decodeBinary(Uint8Array.of(0xd6, utf16Type, 0x61, 0, 0x62, 0)),
    (error) => error instanceof Noncanonical,
  );
  // Three bytes are no whole number of code units.
  assert.throws(() => decodeBinary(Uint8Array.of(0xc7, 3, utf16Type, 0, 0xd8, 0)), TypeError);
  // The lone surrogate itself decodes, the same bytes it was sent as.
  const packet = Uint8Array.of(0xd5, utf16Type, 0, 0xd8);
  assertSameString(decodeBinary(packet), "\ud800");
  assert.deepEqual([...encodeBinary("\ud800")], [...packet]);
});

for (const [name, protocol, count] of [
  ["a Binary.protocol", jsonShapedBinary, 1_000],
  ["the JSON protocol", jsonShapedJson, 20],
] as const) {
  const capability = Capability.define("json-shaped-roundtrip", protocol);
  test(`an answer and a bulk answer carrying lone surrogates arrive exactly over ${name}`, async () => {
    // On the binary protocol, enough rows that the bulk answer leaves in parts.
    const rows = Array.from({ length: count }, (_, index) => ({
      index,
      data: withLoneSurrogates(),
    }));
    const handlers = capability.protocol.toLayer({
      unknown: ({ value }) => Effect.succeed(value),
      record: () => Effect.succeed(withLoneSurrogates()),
      struct: () => Effect.succeed({ data: withLoneSurrogates() }),
      bulk: () => Effect.succeed(rows),
      slow: () => Effect.succeed(illFormed.shortLow),
    });
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const operations = yield* capability;
          const [unknown, record, struct, bulk, beside] = yield* Effect.all(
            [
              operations.unknown({ value: withLoneSurrogates() }),
              operations.record(),
              operations.struct(),
              operations.bulk(),
              operations.slow(),
            ],
            { concurrency: "unbounded" },
          );
          return { unknown, record, struct, bulk, beside };
        }).pipe(Effect.provide(Testing.client(capability, handlers))),
      ),
    );
    assertLoneSurrogates(result.unknown);
    assertLoneSurrogates(result.record);
    assertLoneSurrogates(result.struct.data);
    assert.equal(result.bulk.length, rows.length);
    for (const row of [result.bulk[0], result.bulk.at(-1)]) assertLoneSurrogates(row?.data);
    assert.equal(JSON.stringify(result.bulk), JSON.stringify(rows));
    assertSameString(result.beside, illFormed.shortLow);
  });
}

/** What the packer's arena grows to for messages that fit one envelope: four times the message. */
const ordinaryArena = 4 * maxMessageBytes + 4096;

test("a large packet owns its bytes, and the packer's shared arena stays ordinary", () => {
  const large = encodeBinary({ bytes: new Uint8Array(12 * 1024 * 1024).fill(5) });
  assert.ok(large.byteLength > largeBytes);
  const expected = Uint8Array.from(large);
  assert.ok(arenaBytes() <= ordinaryArena, `the arena kept ${arenaBytes()} bytes`);
  // Later packs, large and small, write elsewhere.
  encodeBinary({ bytes: new Uint8Array(3 * 1024 * 1024).fill(6) });
  encodeBinary({ small: "value" });
  assert.ok(Buffer.from(large).equals(expected), "a later pack overwrote a large packet");
  // The receiver's canonical re-encode leaves the arena ordinary too.
  const decoded = decodeBinary(large);
  assert.ok(typeof decoded === "object" && decoded !== null);
  assert.ok(arenaBytes() <= ordinaryArena, `the arena kept ${arenaBytes()} bytes after decoding`);
});

const Large = Capability.define(
  "large-binary",
  Binary.protocol(
    RpcGroup.make(
      Binary.bulkAnswer(Rpc.make("answer", { success: Binary.Bytes }), {
        maxBytes: 16 * 1024 * 1024,
      }),
      Binary.bulk(
        Rpc.make("request", { payload: { content: Binary.Bytes }, success: Schema.Finite }),
        {
          field: "content",
          maxBytes: 16 * 1024 * 1024,
        },
      ),
    ),
  ),
);

test("after a 12 MiB bulk request and bulk answer, both sides' packer arena is ordinary", async () => {
  const size = 12 * 1024 * 1024;
  const answer = new Uint8Array(size).fill(3);
  const content = new Uint8Array(size).fill(4);
  const [received, answered] = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const calls = yield* Large;
        const received = yield* calls.request({ content });
        const answered = yield* calls.answer();
        return [received, answered] as const;
      }).pipe(
        Effect.provide(
          Testing.client(
            Large,
            Large.protocol.toLayer({
              answer: () => Effect.succeed(answer),
              request: ({ content }) => Effect.succeed(content.byteLength),
            }),
          ),
        ),
      ),
    ),
  );
  assert.equal(received, size);
  assert.equal(answered.byteLength, size);
  assert.equal(answered[size - 1], 3);
  // One process holds both sides here, and one arena serves them both.
  assert.ok(arenaBytes() <= ordinaryArena, `the arena kept ${arenaBytes()} bytes`);
});

test("nothing in the decoder keeps a large packet reachable once its value is dropped", async () => {
  setFlagsFromString("--expose-gc");
  const decodeAndDrop = () => {
    const packet = Uint8Array.from(
      encodeBinary({ bytes: new Uint8Array(4 * 1024 * 1024).fill(8) }),
    );
    const value = decodeBinary(packet);
    assert.ok(typeof value === "object" && value !== null);
    return new WeakRef(packet.buffer);
  };
  const reference = decodeAndDrop();
  // A WeakRef holds its target until the job that created it ends.
  await new Promise<void>((resolve) => setImmediate(resolve));
  runInNewContext("gc()");
  assert.equal(reference.deref(), undefined, "the decoded packet is still reachable");
});
