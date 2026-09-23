import { RpcSerialization } from "effect/unstable/rpc";
import { Packr, Unpackr } from "msgpackr";

// Effect 4.0.0-rc.113 dropped its MessagePack serializer; this keeps the same wire format.
// Independent records let a relay validate a packet without retaining codec state.
const options = { useRecords: false } as const;
const packr = new Packr(options);
const unpackr = new Unpackr(options);
/**
 * The same format with every map left a `Map`. msgpackr's object mode renames a `"__proto__"` key
 * to `"__proto_"` rather than set a prototype, so a value `JSON.parse` produced — where that key
 * is an ordinary own key — does not survive it. Maps keep every key as it was sent.
 */
const mapUnpackr = new Unpackr({ ...options, mapsAsObjects: false });

const noncanonical = "Noncanonical or incomplete binary RPC packet";

export const codecFor = RpcSerialization.json.codecFor;

export const encodeBinary = (message: unknown): Uint8Array => {
  // The packer returns a view into a reusable arena. Queued packets own their bytes.
  return Uint8Array.from(packr.pack(message));
};

const isMap = (value: unknown): value is ReadonlyMap<unknown, unknown> => value instanceof Map;

/**
 * A decoded value with each map rebuilt as the plain object `JSON.parse` would have made: every
 * key an own, enumerable, writable, configurable property, `"__proto__"` included, and the
 * prototype never set. A key that is not a string is refused: no JSON-shaped value has one, and
 * coercing it would decode a different value from the one that was sent.
 */
const asObjects = (value: unknown): unknown => {
  if (isMap(value)) {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      if (typeof key !== "string") throw new TypeError("A binary RPC map key is not a string");
      Object.defineProperty(object, key, {
        value: asObjects(entry),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return object;
  }
  if (Array.isArray(value)) return value.map((entry: unknown) => asObjects(entry));
  return value;
};

/** Whether `message` encodes to exactly `bytes`: the packet is the one encoding of its value. */
const encodesTo = (message: unknown, bytes: Uint8Array): boolean => {
  const canonical = encodeBinary(message);
  // An indexed loop, not `some`: a bulk request's packet is megabytes, and calling a closure per
  // byte costs most of the decode — 61 of 68 ms on a 12 MiB packet, against 4.9 ms for this. The
  // comparison is the same one. This module runs in renderers too, so no `Buffer`.
  if (canonical.length !== bytes.length) return false;
  for (let index = 0; index < canonical.length; index++) {
    if (canonical[index] !== bytes[index]) return false;
  }
  return true;
};

export const decodeBinary = (bytes: Uint8Array): unknown => {
  let messages: unknown[];
  try {
    messages = unpackr.unpackMultiple(bytes);
  } catch (cause) {
    throw new TypeError("Malformed binary RPC packet", { cause });
  }
  if (messages.length !== 1) throw new TypeError("Expected one binary RPC message");
  const message: unknown = messages[0];
  if (encodesTo(message, bytes)) return message;
  // The ordinary decode renamed a key, or the packet is not canonical. Only here, off the
  // ordinary path, is the packet decoded again with its keys kept exactly as sent; a value that
  // still does not encode to the same bytes is refused.
  const exact = asObjects(mapUnpackr.unpack(bytes));
  if (!encodesTo(exact, bytes)) throw new TypeError(noncanonical);
  return exact;
};
