import { decodeBinary, encodeBinary } from "./BinaryWire.ts";
import { here, isBytes } from "./Bytes.ts";
import type { Connection, Wire } from "./Transport.ts";

/**
 * Which messages a test corrupts on purpose, by the operation's tag. A corrupted message still
 * parses and still names its request, so the call fails exactly as a genuinely undecodable one
 * does and every other call on the connection continues.
 */
export interface Tamper {
  /**
   * Corrupts the answer to each request on an operation this selects, owner to client: its `Exit`,
   * its first stream value, or its first bulk-answer part. The handler ran; the call fails
   * `Protocol` with `reason: "transport/undecodable-answer"`.
   */
  readonly answer?: (tag: string) => boolean;
  /**
   * Corrupts each request on an operation this selects, client to owner, or a bulk request's
   * first part. The handler does not run; the call fails `Protocol` with
   * `reason: "transport/undecodable-request"`.
   */
  readonly request?: (tag: string) => boolean;
}

type Envelope = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Envelope => typeof value === "object" && value !== null;

/** A message as the transport reads it, or `undefined` for one this door leaves alone. */
const read = (message: unknown): Envelope | undefined => {
  let value: unknown;
  try {
    if (isBytes(message)) value = decodeBinary(here(message));
    else if (typeof message === "string") value = JSON.parse(message);
  } catch {
    return undefined;
  }
  return isRecord(value) ? value : undefined;
};

const idOf = (value: unknown): string | undefined =>
  typeof value === "string" || typeof value === "number" ? String(value) : undefined;

/**
 * The same MessagePack value under a header that is not its one encoding. An envelope is a plain
 * object, which msgpackr always packs as a map16; the fixmap spelling of the same map parses to
 * the same value, two bytes shorter, and fails the canonical check.
 */
const noncanonical = (bytes: Uint8Array): Uint8Array => {
  const count = bytes[2];
  if (bytes[0] !== 0xde || bytes[1] !== 0 || count === undefined || count >= 16)
    throw new TypeError("Testing's tamper expected an envelope packed as a map16");
  const copy = new Uint8Array(bytes.byteLength - 2);
  copy[0] = 0x80 | count;
  copy.set(bytes.subarray(3), 1);
  return copy;
};

/**
 * `message` made undecodable, still naming its request. A binary packet is rewritten as
 * `noncanonical` spells it; a part carries the start of its whole packet, so that start is
 * rewritten inside it. The JSON protocol has no canonical form, so a JSON message keeps only its
 * tag and the id it names, and fails its envelope instead.
 */
const corrupt = (message: unknown, value: Envelope, idKey: "id" | "requestId"): Wire => {
  if (typeof message === "string")
    return JSON.stringify({ _tag: value._tag, [idKey]: value[idKey] });
  if (isBytes(value.bytes)) return encodeBinary({ ...value, bytes: noncanonical(value.bytes) });
  if (isBytes(message)) return noncanonical(message);
  throw new TypeError("Testing's tamper cannot corrupt this message");
};

/** `connection` with the messages `tamper` selects corrupted on their way through. */
export const tampered =
  (tamper: Tamper) =>
  (connection: Connection): Connection => {
    // The tag of each request that left and has not yet had its answer's first message, by id.
    const pending = new Map<string, string>();
    // The bulk requests whose first part has left, so their later parts pass untouched.
    const started = new Set<string>();
    const outgoing = (message: Wire): Wire => {
      const value = read(message);
      const id = idOf(value?.id);
      if (value === undefined || id === undefined || typeof value.tag !== "string") return message;
      if (value._tag === "RequestPart") {
        const first = !started.has(id);
        if (value.final === true) started.delete(id);
        else started.add(id);
        if (!first) return message;
      } else if (value._tag !== "Request") return message;
      if (tamper.request?.(value.tag) === true) return corrupt(message, value, "id");
      pending.set(id, value.tag);
      return message;
    };
    const incoming = (message: unknown): unknown => {
      const value = read(message);
      const id = idOf(value?.requestId);
      if (value === undefined || id === undefined) return message;
      if (value._tag !== "Exit" && value._tag !== "Chunk" && value._tag !== "AnswerPart")
        return message;
      const tag = pending.get(id);
      if (tag === undefined) return message;
      pending.delete(id);
      return tamper.answer?.(tag) === true ? corrupt(message, value, "requestId") : message;
    };
    return {
      send: (message) => connection.send(outgoing(message)),
      subscribe: (receive, close) =>
        connection.subscribe((message) => receive(incoming(message)), close),
      close: () => connection.close(),
    };
  };
