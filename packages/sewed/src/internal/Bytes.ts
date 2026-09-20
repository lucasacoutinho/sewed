import { Schema, SchemaTransformation } from "effect";

/**
 * Whether a value is a `Uint8Array`, from this realm or another. `instanceof` asks which realm
 * made it, which is the wrong question: under a test environment that swaps the global, the bytes
 * a packer returns and the bytes a schema expects come from different realms. `ArrayBuffer.isView`
 * reads the internal slot, so neither a spoofed tag nor a Proxy passes; a Node `Buffer` does.
 *
 * Measured on this repository's Node: about 62 ns a call when it accepts, against about 4 ns for
 * `instanceof`, because `Object.prototype.toString.call` allocates. A value that is not a view
 * never reaches that half and costs about 4 ns. That is a boundary price — once per packet, per
 * envelope, per declared field — and it does not belong in a loop over bytes or over parts.
 */
export const isBytes = (value: unknown): value is Uint8Array =>
  ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]";

/**
 * The same memory as a view this realm made; the input itself when this realm already made it.
 *
 * The parameter says `Uint8Array` and the check asks whether it is one, which reads like a
 * tautology and is the point: the type says what the bytes are, `instanceof` says which realm made
 * them, and only the second question can answer no here. Asking it of a widened binding is what
 * keeps the other branch's parameter typed rather than narrowed to `never`.
 */
export const here = (bytes: Uint8Array): Uint8Array => {
  const made: unknown = bytes;
  return made instanceof Uint8Array
    ? made
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
};

/**
 * Bytes, recognized by what they are and handed on as bytes this realm made.
 *
 * The declaration is Effect's `Schema.Uint8Array` with one substitution: its predicate is
 * `instanceOf(globalThis.Uint8Array)`, and this one is `isBytes`. `toCodecJson` returning
 * `undefined` is what keeps the structural RPC codec from lowering a byte field to base64, so
 * MessagePack sees the array itself.
 *
 * The transformation on top is where `here` lives. MessagePack dispatches on `instanceof` as well,
 * and packs a `Uint8Array` from another realm as a map of indices — silently, at four times the
 * size, and no longer bytes on the far side. Every byte field a protocol declares passes through
 * this encode on its way to the packer, so re-viewing it here closes that class at one place
 * instead of walking whole messages. For bytes this realm made the view is the input itself, so an
 * ordinary send allocates nothing.
 */
const declaration = Schema.declare<Uint8Array>(isBytes, {
  expected: "Uint8Array",
  toCodecJson: () => undefined,
});

export const Bytes = declaration.pipe(
  Schema.decodeTo(declaration, SchemaTransformation.transform({ decode: here, encode: here })),
);
