import { RpcSerialization } from "effect/unstable/rpc";
import { addExtension, Packr, RESET_BUFFER_MODE, Unpackr } from "msgpackr";

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

/**
 * A packet that parsed as one MessagePack value but is not the one encoding of any value this
 * wire accepts. `parsed` is what the ordinary decode made of it: a peer's word, not a value to
 * use, kept so a transport can read which request the packet names and fail that request alone.
 */
export class Noncanonical extends TypeError {
  readonly parsed: unknown;
  constructor(parsed: unknown, options?: ErrorOptions) {
    super("Noncanonical or incomplete binary RPC packet", options);
    this.parsed = parsed;
  }
}

export const codecFor = RpcSerialization.json.codecFor;

/**
 * A string UTF-8 cannot carry: it holds a lone surrogate, which `JSON.parse` accepts. msgpackr
 * writes a short one's code units raw, a packet no decoder accepts, and a long one through the
 * UTF-8 encoder, which turns the surrogate into U+FFFD without a word. Such a string, value or map
 * key, travels as one extension whose payload is its UTF-16 code units, little-endian, and decodes
 * to the identical string.
 */
class IllFormed {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
}

/** The extension type code, one msgpackr does not use for its own extensions. */
export const utf16Type = 0x75;

const packUnits = (instance: unknown): Uint8Array => {
  if (!(instance instanceof IllFormed)) throw new TypeError("Expected an ill-formed string");
  const { value } = instance;
  const bytes = new Uint8Array(value.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index++)
    view.setUint16(index * 2, value.charCodeAt(index), true);
  return bytes;
};

/** Code units per `String.fromCharCode` call: well under any engine's argument limit. */
const unitsPerCall = 8192;

const unpackUnits = (bytes: Uint8Array): string => {
  if (bytes.byteLength % 2 !== 0) throw new TypeError("A UTF-16 string has an odd byte length");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let value = "";
  for (let offset = 0; offset < bytes.byteLength; offset += unitsPerCall * 2) {
    const end = Math.min(bytes.byteLength, offset + unitsPerCall * 2);
    const units: number[] = [];
    for (let at = offset; at < end; at += 2) units.push(view.getUint16(at, true));
    value += String.fromCharCode(...units);
  }
  return value;
};

// msgpackr keeps extensions in module state, shared by every packer and unpacker in this realm.
addExtension({ Class: IllFormed, type: utf16Type, pack: packUnits, unpack: unpackUnits });

/** An object msgpackr packs as a map of its own keys, and so one whose keys and values are walked. */
const isPlainObject = (value: object): value is Record<string, unknown> => {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Whether every string in `value`, map keys included, is one UTF-8 can carry. It allocates
 * nothing: it runs on every message, and almost every message passes.
 */
const wellFormed = (value: unknown): boolean => {
  if (typeof value === "string") return value.isWellFormed();
  if (typeof value !== "object" || value === null) return true;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) if (!wellFormed(value[index])) return false;
    return true;
  }
  if (!isPlainObject(value)) return true;
  for (const key in value) if (!key.isWellFormed() || !wellFormed(value[key])) return false;
  return true;
};

/**
 * `value` with each string UTF-8 cannot carry replaced by an `IllFormed`. An object with such a
 * key becomes a `Map`, the one shape whose keys msgpackr packs as values. It is a function of the
 * value alone, so a decoded value is carried the same way and re-encodes to the same bytes.
 */
const carried = (value: unknown): unknown => {
  if (typeof value === "string") return value.isWellFormed() ? value : new IllFormed(value);
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(carried);
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.every((key) => key.isWellFormed()))
    // `fromEntries` defines each key as an own property, so a `"__proto__"` key stays a key.
    return Object.fromEntries(keys.map((key) => [key, carried(value[key])]));
  return new Map(
    keys.map((key) => [key.isWellFormed() ? key : new IllFormed(key), carried(value[key])]),
  );
};

/**
 * The encoded size past which a message leaves the packer's shared arena instead of being copied
 * out of it. The arena is module state in msgpackr, shared by every `Packr`, and it only grows: it
 * is dropped at 1 GiB and no sooner, so one 12 MiB message would otherwise leave the process
 * holding a 48 MiB arena for the rest of its life.
 */
export const largeBytes = 1024 * 1024;
const empty = new Uint8Array(0);

/**
 * Packs a message and returns the packer's own view of it, valid until the next pack. Every pack
 * starts at the front of the arena rather than after the last one: each caller copies or compares
 * the view before packing again, so the arena is reused instead of filled, outgrown and dropped
 * for the collector — once per 128 KiB part of a bulk transfer. A message past `largeBytes` takes
 * the arena with it: the packer is handed an empty one, and allocates a fresh, ordinary one at its
 * next pack.
 */
const pack = (message: unknown): { readonly view: Uint8Array; readonly large: boolean } => {
  let view: Uint8Array;
  try {
    view = packr.pack(wellFormed(message) ? message : carried(message), RESET_BUFFER_MODE);
  } catch (cause) {
    // A pack that throws part-way (a value nested past the stack) may already have grown the
    // shared arena; detach it so the failure leaves nothing large behind.
    packr.useBuffer(empty);
    throw cause;
  }
  const large = view.byteLength > largeBytes;
  if (large) packr.useBuffer(empty);
  return { view, large };
};

export const encodeBinary = (message: unknown): Uint8Array => {
  const { view, large } = pack(message);
  // An ordinary packet is copied out of the arena, which the next pack writes over. A large one
  // already owns the arena it was written to, so it needs no copy.
  return large ? view : Uint8Array.from(view);
};

/** The byte length of the packer's shared arena, for a test that checks it stays ordinary. */
export const arenaBytes = (): number => packr.pack(null).buffer.byteLength;

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
  // Compared in place and dropped: the check needs no copy of its own. A value msgpackr can
  // decode but not re-encode (nested past the stack) is not the one encoding of anything.
  let canonical: Uint8Array;
  try {
    canonical = pack(message).view;
  } catch {
    return false;
  }
  // An indexed loop, not `some`: a bulk request's packet is megabytes, and calling a closure per
  // byte costs most of the decode — 61 of 68 ms on a 12 MiB packet, against 4.9 ms for this. The
  // comparison is the same one. This module runs in renderers too, so no `Buffer`.
  if (canonical.length !== bytes.length) return false;
  for (let index = 0; index < canonical.length; index++) {
    if (canonical[index] !== bytes[index]) return false;
  }
  return true;
};

const decodeExact = (bytes: Uint8Array): unknown => {
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
  let exact: unknown;
  try {
    exact = asObjects(mapUnpackr.unpack(bytes));
  } catch (cause) {
    throw new Noncanonical(message, { cause });
  }
  if (!encodesTo(exact, bytes)) throw new Noncanonical(message);
  return exact;
};

/**
 * A packet of one `nil`. msgpackr keeps a view of the last packet it decoded in module state until
 * it decodes another, so a large packet would stay reachable after everything else let it go;
 * decoding this in its place releases it.
 */
const nil = Uint8Array.of(0xc0);

export const decodeBinary = (bytes: Uint8Array): unknown => {
  // Decoded byte fields retain the packet's backing store. Compact native subviews and
  // snapshot shared storage before decoding so a small frame cannot pin an oversized buffer.
  const packet =
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
      ? bytes
      : Uint8Array.from(bytes);
  try {
    return decodeExact(packet);
  } finally {
    if (packet.byteLength > largeBytes) unpackr.unpack(nil);
  }
};
