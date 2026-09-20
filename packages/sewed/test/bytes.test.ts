import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Schema } from "effect";
import * as Binary from "../lib/Binary.js";
import { decodeBinary, encodeBinary } from "../lib/internal/BinaryWire.js";
import { here, isBytes } from "../lib/internal/Bytes.js";
import { decodeClient } from "../lib/internal/Transport.js";

/** The one envelope shape a bulk client sends bytes in, narrowed for the assertions below. */
const requestPart = (message: unknown) => {
  const decoded = decodeClient(message, "binary");
  assert.equal(decoded._tag, "RequestPart");
  if (decoded._tag !== "RequestPart") throw new Error("unreachable");
  return decoded;
};

/**
 * A `Uint8Array` another realm made. `node:vm` is the cheapest realm to make one in; the realm a
 * consumer actually meets is the one a test environment installs over the global — vitest's jsdom
 * hands its own `TextEncoder`, whose output fails `instanceof Uint8Array` in exactly this way.
 */
const otherRealm = <A>(expression: string): A => runInNewContext(expression) as A;

test("isBytes recognizes bytes by what they are, from any realm", () => {
  assert.equal(isBytes(new Uint8Array([1, 2, 3, 4])), true);
  assert.equal(isBytes(Buffer.from([1, 2, 3, 4])), true, "a Node Buffer is a Uint8Array");
  assert.equal(isBytes(otherRealm("new Uint8Array([1,2,3,4])")), true);
  assert.equal(
    isBytes(new Uint8Array([1, 2, 3, 4, 5, 6]).subarray(2, 5)),
    true,
    "a view with a non-zero byteOffset is bytes",
  );
  assert.equal(isBytes(otherRealm("new Uint8Array([1,2,3,4,5,6]).subarray(2,5)")), true);
});

test("isBytes refuses what only looks like bytes", () => {
  assert.equal(isBytes(otherRealm("new Uint8ClampedArray([1,2,3,4])")), false);
  assert.equal(isBytes(otherRealm("new DataView(new ArrayBuffer(4))")), false);
  assert.equal(isBytes(new Uint8ClampedArray([1, 2, 3, 4])), false);
  assert.equal(isBytes(new DataView(new ArrayBuffer(4))), false);
  assert.equal(isBytes({ byteLength: 4 }), false);
  assert.equal(
    isBytes({ byteLength: 4, [Symbol.toStringTag]: "Uint8Array" }),
    false,
    "a spoofed tag has no typed-array slot, so ArrayBuffer.isView refuses it",
  );
  assert.equal(
    isBytes(new Proxy(new Uint8Array([1, 2, 3, 4]), {})),
    false,
    "a Proxy carries none of its target's internal slots",
  );
  assert.equal(isBytes(null), false);
  assert.equal(isBytes(undefined), false);
  assert.equal(isBytes("bytes"), false);
  assert.equal(isBytes(new ArrayBuffer(4)), false, "a buffer is not a view over one");
});

test("here re-views another realm's bytes without copying them", () => {
  const foreign = otherRealm<Uint8Array>("new Uint8Array([1,2,3,4])");
  assert.equal(foreign instanceof Uint8Array, false, "the premise: the input is not from here");
  const viewed = here(foreign);
  assert.equal(viewed instanceof Uint8Array, true);
  assert.deepEqual([...viewed], [1, 2, 3, 4]);
  viewed[0] = 99;
  assert.equal(foreign[0], 99, "the view shares the input's memory");
  foreign[1] = 77;
  assert.equal(viewed[1], 77, "and the input shares the view's");
});

test("here keeps a sub-view's window and returns this realm's bytes unchanged", () => {
  const foreign = otherRealm<Uint8Array>("new Uint8Array([1,2,3,4,5,6,7,8]).subarray(2,6)");
  const viewed = here(foreign);
  assert.equal(viewed.byteOffset, 2);
  assert.equal(viewed.byteLength, 4);
  assert.deepEqual([...viewed], [3, 4, 5, 6]);
  const own = new Uint8Array([1, 2, 3]);
  assert.equal(here(own), own, "bytes this realm made are handed back, not re-wrapped");
  const ownSub = new Uint8Array([1, 2, 3, 4, 5, 6]).subarray(1, 4);
  assert.equal(here(ownSub), ownSub);
});

test("Binary.Bytes accepts another realm's bytes and re-views them", () => {
  const foreign = otherRealm<Uint8Array>("new Uint8Array([1,2,3,4])");
  const decoded = Schema.decodeUnknownSync(Binary.Bytes)(foreign);
  assert.equal(decoded instanceof Uint8Array, true);
  assert.deepEqual([...decoded], [1, 2, 3, 4]);
  const encoded = Schema.encodeUnknownSync(Binary.Bytes)(foreign);
  assert.equal(encoded instanceof Uint8Array, true);
  assert.deepEqual([...encoded], [1, 2, 3, 4]);
});

test("Binary.Bytes still refuses what is not bytes", () => {
  assert.throws(() => Schema.decodeUnknownSync(Binary.Bytes)("1234"));
  assert.throws(() =>
    Schema.decodeUnknownSync(Binary.Bytes)(otherRealm("new DataView(new ArrayBuffer(4))")),
  );
  assert.throws(() => Schema.decodeUnknownSync(Binary.Bytes)({ byteLength: 4 }));
});

/**
 * `de 00 01` is a one-entry map, `a5 62 79 74 65 73` the key `bytes`, `c4 04` a four-byte `bin`,
 * then the bytes. Without the re-view MessagePack dispatches on `instanceof` too and writes the
 * field itself as a map of indices — `de 00 04 a1 30 01 …`, four times the size, and no longer
 * bytes on the far side.
 */
const packedField = "de0001a56279746573c40401020304";

test("a Binary.Bytes field the schema encoded reaches MessagePack as bin", () => {
  const foreign = otherRealm<Uint8Array>("new Uint8Array([1,2,3,4])");
  const field = Schema.encodeUnknownSync(Binary.Bytes)(foreign);
  const packet = encodeBinary({ bytes: field });
  assert.equal(Buffer.from(packet).toString("hex"), packedField);
  assert.deepEqual(
    [...packet],
    [...encodeBinary({ bytes: new Uint8Array([1, 2, 3, 4]) })],
    "a field from another realm packs exactly as one this realm made",
  );
  const decoded = decodeBinary(packet) as { bytes: Uint8Array };
  assert.equal(isBytes(decoded.bytes), true);
  assert.deepEqual([...decoded.bytes], [1, 2, 3, 4]);
});

test("a packet another realm holds is still a packet this transport reads", () => {
  const packet = encodeBinary({
    _tag: "RequestPart",
    id: "1",
    tag: "ingest",
    bytes: new Uint8Array([1, 2, 3, 4]),
    final: true,
  });
  const toOtherRealm = otherRealm<(values: readonly number[]) => Uint8Array>(
    "(values) => Uint8Array.from(values)",
  );
  const foreignPacket = toOtherRealm([...packet]);
  assert.equal(
    foreignPacket instanceof Uint8Array,
    false,
    "the premise: the packet is not from here",
  );
  const decoded = requestPart(foreignPacket);
  assert.equal(isBytes(decoded.bytes), true);
  assert.deepEqual([...decoded.bytes], [1, 2, 3, 4]);
});

test("a RequestPart whose bytes came from another realm decodes to bytes from this one", () => {
  const foreign = otherRealm<Uint8Array>("new Uint8Array([1,2,3,4])");
  const part = requestPart(
    encodeBinary({
      _tag: "RequestPart",
      id: "1",
      tag: "ingest",
      bytes: Schema.encodeUnknownSync(Binary.Bytes)(foreign),
      final: true,
    }),
  );
  assert.equal(part.bytes instanceof Uint8Array, true);
  assert.deepEqual([...part.bytes], [1, 2, 3, 4]);
});
