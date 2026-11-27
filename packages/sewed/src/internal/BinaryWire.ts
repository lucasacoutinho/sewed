import { RpcSerialization } from "effect/rpc";
import { addExtension, Packr, RESET_BUFFER_MODE, Unpackr } from "msgpackr";

// Effect 4.0.0-rc.113 dropped its MessagePack serializer; this keeps the same wire format.
// Independent records let a relay validate a packet without retaining codec state.
const options = { useRecords: false } as const;
const packr = new Packr(options);
const unpackr = new Unpackr(options);
const compareBytes = typeof Buffer === "undefined" ? undefined : Buffer.compare;
const isUtf8Native: ((input: Uint8Array) => boolean) | undefined =
  typeof process !== "undefined" && typeof process.getBuiltinModule === "function"
    ? (
        process.getBuiltinModule("node:buffer") as
          | { readonly isUtf8?: (input: Uint8Array) => boolean }
          | undefined
      )?.isUtf8
    : undefined;
const hasNodeBuffer = typeof Buffer !== "undefined";
const floatScratch = new ArrayBuffer(8);
const floatBytes = new Uint8Array(floatScratch);
const floatView = new DataView(floatScratch);

const copyBytes = (view: Uint8Array): Uint8Array => {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
};
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
const pack = (message: unknown): Uint8Array => {
  let view: Uint8Array;
  try {
    view = packr.pack(wellFormed(message) ? message : carried(message), RESET_BUFFER_MODE);
  } catch (cause) {
    // A pack that throws part-way (a value nested past the stack) may already have grown the
    // shared arena; detach it so the failure leaves nothing large behind.
    packr.useBuffer(empty);
    throw cause;
  }
  if (view.byteLength > largeBytes) packr.useBuffer(empty);
  return view;
};

export const encodeBinary = (message: unknown): Uint8Array => {
  const view = pack(message);
  // An ordinary packet is copied out of the arena, which the next pack writes over. A large one
  // already owns the arena it was written to, so it needs no copy.
  return view.byteLength > largeBytes ? view : copyBytes(view);
};

export const sizeOfBinary = (message: unknown): number => pack(message).byteLength;

/** MessagePack fixarray, array16 and array32 length prefixes. */
export const arrayHeaderBytes = (length: number): number =>
  length < 16 ? 1 : length < 65536 ? 3 : 5;

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
    canonical = pack(message);
  } catch {
    return false;
  }
  if (canonical.length !== bytes.length) return false;
  if (compareBytes !== undefined) return compareBytes(canonical, bytes) === 0;
  const canonicalWords = new DataView(canonical.buffer, canonical.byteOffset, canonical.byteLength);
  const receivedWords = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const wordEnd = canonical.length - (canonical.length % 4);
  for (let index = 0; index < wordEnd; index += 4) {
    if (canonicalWords.getUint32(index, true) !== receivedWords.getUint32(index, true))
      return false;
  }
  for (let index = wordEnd; index < canonical.length; index++) {
    if (canonical[index] !== bytes[index]) return false;
  }
  return true;
};

/** RFC 3629 UTF-8 validity check for short byte slices where native validation is not worthwhile. */
const isValidUtf8Bytes = (bytes: Uint8Array, start: number, end: number): boolean => {
  let i = start;
  while (i < end) {
    const b0 = bytes[i]!;
    if (b0 < 0x80) {
      i++;
      continue;
    }
    if (b0 < 0xc2) return false;
    if (b0 < 0xe0) {
      if (i + 1 >= end || (bytes[i + 1]! & 0xc0) !== 0x80) return false;
      i += 2;
    } else if (b0 < 0xf0) {
      if (i + 2 >= end) return false;
      const b1 = bytes[i + 1]!;
      const b2 = bytes[i + 2]!;
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80) return false;
      if (b0 === 0xe0 && b1 < 0xa0) return false;
      if (b0 === 0xed && b1 >= 0xa0) return false;
      i += 3;
    } else if (b0 <= 0xf4) {
      if (i + 3 >= end) return false;
      const b1 = bytes[i + 1]!;
      const b2 = bytes[i + 2]!;
      const b3 = bytes[i + 3]!;
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) return false;
      if (b0 === 0xf0 && b1 < 0x90) return false;
      if (b0 === 0xf4 && b1 >= 0x90) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
};

/**
 * Sound fast-path canonicality check against `new Packr({ useRecords: false })`.
 *
 * Walks `bytes` in lockstep with the value `unpackr.unpack(bytes)` already produced. Every branch
 * returns `true` only when `pack(value)` is guaranteed to emit the exact same bytes (minimal
 * headers, map16 plain objects with keys in exact `Object.keys` order and no `"__proto__"` rename,
 * valid UTF-8 strings, exact binary lengths, finite non-int32 float64). Any value outside this
 * common subset (extensions, non-ASCII keys, `-0`, `NaN`, deep nesting, or any mismatch) returns
 * `false` so the caller falls back to `encodesTo` and `mapUnpackr`.
 */
const isCanonicalFast = (bytes: Uint8Array, root: unknown): boolean => {
  const end = bytes.byteLength;
  let offset = 0;

  const readStringSpan = (): number => {
    if (offset >= end) return -1;
    const tag = bytes[offset++]!;
    if ((tag & 0xe0) === 0xa0) return tag & 0x1f;
    if (tag === 0xd9) {
      if (offset >= end) return -1;
      const len = bytes[offset++]!;
      return len >= 0x20 ? len : -1;
    }
    if (tag === 0xda) {
      if (offset + 2 > end) return -1;
      const len = (bytes[offset]! << 8) | bytes[offset + 1]!;
      offset += 2;
      return len >= 0x100 ? len : -1;
    }
    if (tag === 0xdb) {
      if (offset + 4 > end) return -1;
      const len =
        ((bytes[offset]! << 24) |
          (bytes[offset + 1]! << 16) |
          (bytes[offset + 2]! << 8) |
          bytes[offset + 3]!) >>>
        0;
      offset += 4;
      return len >= 0x10000 ? len : -1;
    }
    return -1;
  };

  const check = (value: unknown, depth: number): boolean => {
    if (depth > 64 || offset >= end) return false;
    const tag = bytes[offset++]!;
    if (tag <= 0x7f) return value === tag;
    if (tag >= 0xe0) return value === tag - 256;
    if (tag >= 0xa0 && tag <= 0xbf) {
      const len = tag & 0x1f;
      if (typeof value !== "string" || offset + len > end) return false;
      if (!isValidUtf8Bytes(bytes, offset, offset + len)) return false;
      offset += len;
      return true;
    }
    if (tag >= 0x90 && tag <= 0x9f) {
      const len = tag & 0x0f;
      if (!Array.isArray(value) || value.length !== len) return false;
      for (let i = 0; i < len; i++) if (!check(value[i], depth + 1)) return false;
      return true;
    }
    switch (tag) {
      case 0xc0:
        return value === null;
      case 0xc2:
        return value === false;
      case 0xc3:
        return value === true;
      case 0xcc: {
        if (offset >= end) return false;
        const n = bytes[offset++]!;
        return n >= 0x80 && value === n;
      }
      case 0xcd: {
        if (offset + 2 > end) return false;
        const n = (bytes[offset]! << 8) | bytes[offset + 1]!;
        offset += 2;
        return n >= 0x100 && value === n;
      }
      case 0xce: {
        if (offset + 4 > end) return false;
        const n =
          ((bytes[offset]! << 24) |
            (bytes[offset + 1]! << 16) |
            (bytes[offset + 2]! << 8) |
            bytes[offset + 3]!) >>>
          0;
        offset += 4;
        return n >= 0x10000 && value === n;
      }
      case 0xd0: {
        if (offset >= end) return false;
        const n = (bytes[offset++]! << 24) >> 24;
        return n < -32 && value === n;
      }
      case 0xd1: {
        if (offset + 2 > end) return false;
        const n = (((bytes[offset]! << 8) | bytes[offset + 1]!) << 16) >> 16;
        offset += 2;
        return n < -128 && value === n;
      }
      case 0xd2: {
        if (offset + 4 > end) return false;
        const n =
          (bytes[offset]! << 24) |
          (bytes[offset + 1]! << 16) |
          (bytes[offset + 2]! << 8) |
          bytes[offset + 3]!;
        offset += 4;
        return n < -32768 && value === n;
      }
      case 0xcb: {
        if (offset + 8 > end || typeof value !== "number") return false;
        if (!Number.isFinite(value) || value >>> 0 === value || value >> 0 === value) return false;
        floatView.setFloat64(0, value, false);
        for (let i = 0; i < 8; i++) if (bytes[offset + i] !== floatBytes[i]) return false;
        offset += 8;
        return true;
      }
      case 0xd9:
      case 0xda:
      case 0xdb: {
        let len: number;
        if (tag === 0xd9) {
          if (offset >= end) return false;
          len = bytes[offset++]!;
          if (len < 0x20) return false;
        } else if (tag === 0xda) {
          if (offset + 2 > end) return false;
          len = (bytes[offset]! << 8) | bytes[offset + 1]!;
          offset += 2;
          if (len < 0x100) return false;
        } else {
          if (offset + 4 > end) return false;
          len =
            ((bytes[offset]! << 24) |
              (bytes[offset + 1]! << 16) |
              (bytes[offset + 2]! << 8) |
              bytes[offset + 3]!) >>>
            0;
          offset += 4;
          if (len < 0x10000) return false;
        }
        if (typeof value !== "string" || offset + len > end) return false;
        if (len <= 64) {
          if (!isValidUtf8Bytes(bytes, offset, offset + len)) return false;
        } else if (isUtf8Native !== undefined) {
          if (!isUtf8Native(bytes.subarray(offset, offset + len))) return false;
        } else if (!hasNodeBuffer) {
          // In browser realms msgpackr decodes strings > 64 bytes with TextDecoder("utf-8"),
          // which emits U+FFFD for any invalid UTF-8 byte sequence.
          if (value.indexOf("\ufffd") !== -1) return false;
        } else if (!isValidUtf8Bytes(bytes, offset, offset + len)) {
          return false;
        }
        offset += len;
        return true;
      }
      case 0xc4:
      case 0xc5:
      case 0xc6: {
        let len: number;
        if (tag === 0xc4) {
          if (offset >= end) return false;
          len = bytes[offset++]!;
        } else if (tag === 0xc5) {
          if (offset + 2 > end) return false;
          len = (bytes[offset]! << 8) | bytes[offset + 1]!;
          offset += 2;
          if (len < 0x100) return false;
        } else {
          if (offset + 4 > end) return false;
          len =
            ((bytes[offset]! << 24) |
              (bytes[offset + 1]! << 16) |
              (bytes[offset + 2]! << 8) |
              bytes[offset + 3]!) >>>
            0;
          offset += 4;
          if (len < 0x10000) return false;
        }
        if (!(value instanceof Uint8Array) || value.byteLength !== len || offset + len > end)
          return false;
        offset += len;
        return true;
      }
      case 0xdc:
      case 0xdd: {
        let len: number;
        if (tag === 0xdc) {
          if (offset + 2 > end) return false;
          len = (bytes[offset]! << 8) | bytes[offset + 1]!;
          offset += 2;
          if (len < 0x10) return false;
        } else {
          if (offset + 4 > end) return false;
          len =
            ((bytes[offset]! << 24) |
              (bytes[offset + 1]! << 16) |
              (bytes[offset + 2]! << 8) |
              bytes[offset + 3]!) >>>
            0;
          offset += 4;
          if (len < 0x10000) return false;
        }
        if (!Array.isArray(value) || value.length !== len) return false;
        for (let i = 0; i < len; i++) if (!check(value[i], depth + 1)) return false;
        return true;
      }
      case 0xde: {
        if (offset + 2 > end) return false;
        const count = (bytes[offset]! << 8) | bytes[offset + 1]!;
        offset += 2;
        if (
          typeof value !== "object" ||
          value === null ||
          Object.getPrototypeOf(value) !== Object.prototype ||
          value.constructor !== Object
        )
          return false;
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record);
        if (keys.length !== count) return false;
        for (let i = 0; i < count; i++) {
          const key = keys[i]!;
          const keyLen = readStringSpan();
          if (keyLen !== key.length || offset + keyLen > end) return false;
          for (let j = 0; j < keyLen; j++) {
            const byte = bytes[offset + j]!;
            if (byte >= 0x80 || byte !== key.charCodeAt(j)) return false;
          }
          offset += keyLen;
          if (!check(record[key], depth + 1)) return false;
        }
        return true;
      }
      default:
        return false;
    }
  };

  return check(root, 0) && offset === end;
};

const decodeExact = (bytes: Uint8Array): unknown => {
  let message: unknown;
  try {
    message = unpackr.unpack(bytes);
  } catch (cause) {
    throw new TypeError("Malformed binary RPC packet", { cause });
  }
  if (isCanonicalFast(bytes, message) || encodesTo(message, bytes)) return message;
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
      : copyBytes(bytes);
  try {
    return decodeExact(packet);
  } finally {
    if (packet.byteLength > largeBytes) unpackr.unpack(nil);
  }
};
