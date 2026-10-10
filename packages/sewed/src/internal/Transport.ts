import { Schema } from "effect";
import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError";
import type {
  FromClientEncoded,
  FromServerEncoded,
  ResponseChunkEncoded,
} from "effect/rpc/RpcMessage";
import { SewedError } from "../SewedError.ts";
import type { Encoding } from "./Encoding.ts";
import * as BinaryWire from "./BinaryWire.ts";
import { Bytes, here, isBytes } from "./Bytes.ts";

export const maxMessageBytes = 256 * 1024;
/**
 * The smallest a non-final bulk part may be. The owner's allowance counts bytes, which bounds how
 * much one assembly holds but not how many parts it holds: a peer sending empty parts passes a
 * byte count forever. A floor on a non-final part bounds the count instead, so an assembly holds
 * at most `ceil((maxBytes + maxMessageBytes) / minPartBytes) + 1` parts — about 800 for a 12 MiB
 * bound. The final part is the tail and may be any size from one byte up.
 *
 * The floor never bites an honest client: a slice starts at half an envelope, 131072 bytes, and is
 * halved only when a part that size does not fit one envelope, which would need more than 128 KiB
 * of overhead from a request id and a tag.
 */
export const minPartBytes = 16 * 1024;
export const maxPendingMessages = 128;
export const maxRequestsPerConnection = 64;
const utf8 = new TextEncoder();
const limitError = (bytes: number) =>
  new SewedError({ code: "Limit", message: `RPC messages are limited to ${bytes} bytes` });

export type Wire = string | Uint8Array;

/** The measure `encode` applies: a packet's bytes, or the UTF-8 bytes of JSON text. */
export const sizeOf = (wire: Wire): number =>
  typeof wire === "string" ? utf8.encode(wire).byteLength : wire.byteLength;

/** Rejoins a bulk request's parts into the one packet its client encoded. */
export const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/**
 * The slice to try after one that did not fit an envelope, or `undefined` when there is none
 * left. Halving stops at `minPartBytes` because that is the floor the owner enforces on a
 * non-final part, and the clamp is what keeps a halving that would step past the floor from
 * landing under it — a part the owner would refuse for being too small is worse than none.
 * Answering `undefined` at the floor is what ends the attempt in a `Protocol` failure instead of
 * a loop that narrows forever.
 */
export const narrower = (slice: number): number | undefined =>
  slice > minPartBytes ? Math.max(minPartBytes, Math.floor(slice / 2)) : undefined;

/**
 * The bytes a declared operation's bulk field carries, or `undefined` when the field holds
 * anything else. Over a `Binary.protocol` a `Binary.Bytes` field reaches the wire as the byte
 * array it is; a JSON codec would have turned it into base64 text by now, which is the case this
 * returning `undefined` reports.
 *
 * Asking `isBytes` rather than `instanceof` is belt-and-braces here, not load-bearing: both callers
 * are already past a point where the bytes are this realm's. The client reads a payload the codec
 * encoded, and `Binary.Bytes` re-viewed the field on the way through; the owner reads what
 * MessagePack produced, in the realm it runs in. It asks the transport's question anyway, so that
 * no caller has to know which of those two it is.
 */
export const bulkField = (payload: unknown, field: string): Uint8Array | undefined => {
  if (!isRecord(payload)) return undefined;
  const value = payload[field];
  return isBytes(value) ? value : undefined;
};

export interface Connection {
  readonly send: (message: Wire) => void;
  readonly subscribe: (
    receive: (message: unknown) => void,
    close: (reason: SewedError) => void,
  ) => () => void;
  readonly close: () => void;
}

const requestId = Schema.Union([Schema.String, Schema.Finite]);
const request = Schema.TaggedStruct("Request", {
  id: requestId,
  tag: Schema.String,
  payload: Schema.Unknown,
  headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  isNotification: Schema.optionalKey(Schema.Literal(true)),
  traceId: Schema.optionalKey(Schema.String),
  spanId: Schema.optionalKey(Schema.String),
  sampled: Schema.optionalKey(Schema.Boolean),
});
/**
 * One slice of a request too large for a single envelope, on an operation that declared a bulk
 * bound. `bytes` is a slice of the encoded request's own MessagePack packet, so the owner
 * concatenates the slices and decodes the whole once, with no second codec. A bulk operation
 * belongs to a `Binary.protocol` — refused anywhere else where the slot is declared — so a part
 * carrying anything but bytes is not a packet this transport can have produced.
 */
const requestPart = Schema.TaggedStruct("RequestPart", {
  id: requestId,
  tag: Schema.String,
  bytes: Bytes,
  final: Schema.Boolean,
});
export type RequestPart = typeof requestPart.Type;
const clientEnvelope = Schema.Union([
  request,
  requestPart,
  Schema.TaggedStruct("Ack", { requestId }),
  Schema.TaggedStruct("Interrupt", { requestId }),
  Schema.TaggedStruct("Ping", {}),
  Schema.TaggedStruct("Eof", {}),
]);
const cause = Schema.Union([
  Schema.TaggedStruct("Fail", { error: Schema.Unknown }),
  Schema.TaggedStruct("Die", { defect: Schema.Unknown }),
  Schema.TaggedStruct("Interrupt", { fiberId: Schema.NullOr(Schema.Finite) }),
]);
/** The owner's answer to one `RequestPart`: the client may send the next slice. */
const partAck = Schema.TaggedStruct("PartAck", { requestId });
export type PartAck = typeof partAck.Type;
/**
 * One slice of an answer too large for a single envelope, on a unary operation that declared
 * `Binary.bulkAnswer` — the mirror of `RequestPart` in the other direction. `bytes` is a slice of
 * the owner's own encoded `Exit` packet, so the client concatenates the slices and decodes the
 * whole once, with no second codec. The client acknowledges every non-final part with the same
 * `Ack` envelope that already paces a stream's chunks, one in flight; the final part carries no
 * acknowledgment of its own, because the assembled `Exit` it completes ends the request. A
 * bulk-answer operation belongs to a `Binary.protocol` — refused anywhere else where the slot is
 * declared — so a part carrying anything but bytes is not a packet this transport can have
 * produced.
 */
const answerPart = Schema.TaggedStruct("AnswerPart", {
  requestId,
  bytes: Bytes,
  final: Schema.Boolean,
});
export type AnswerPart = typeof answerPart.Type;
const serverEnvelope = Schema.Union([
  partAck,
  answerPart,
  Schema.TaggedStruct("Exit", {
    requestId,
    exit: Schema.Union([
      Schema.TaggedStruct("Success", { value: Schema.Unknown }),
      Schema.TaggedStruct("Failure", { cause: Schema.Array(cause) }),
    ]),
  }),
  Schema.TaggedStruct("Chunk", { requestId, values: Schema.NonEmptyArray(Schema.Unknown) }),
  Schema.TaggedStruct("Defect", { defect: Schema.Unknown }),
  Schema.TaggedStruct("Pong", {}),
]);

export function encode(message: unknown, encoding?: "json", limit?: number): string;
export function encode(message: unknown, encoding: "binary", limit?: number): Uint8Array;
export function encode(message: unknown, encoding: Encoding, limit?: number): Wire;
export function encode(
  message: unknown,
  encoding: Encoding = "json",
  limit: number = maxMessageBytes,
): Wire {
  if (encoding === "binary") {
    const bytes = BinaryWire.encodeBinary(message);
    if (bytes.byteLength > limit) throw limitError(limit);
    return bytes;
  }
  const json = JSON.stringify(message);
  if (json === undefined || utf8.encode(json).byteLength > limit) throw limitError(limit);
  return json;
}

export function encodeChunks(
  chunk: ResponseChunkEncoded,
  encoding?: "json",
): Generator<{
  readonly message: string;
  readonly final: boolean;
}>;
export function encodeChunks(
  chunk: ResponseChunkEncoded,
  encoding: "binary",
): Generator<{
  readonly message: Uint8Array;
  readonly final: boolean;
}>;
export function encodeChunks(
  chunk: ResponseChunkEncoded,
  encoding: Encoding,
): Generator<{
  readonly message: Wire;
  readonly final: boolean;
}>;
export function* encodeChunks(
  chunk: ResponseChunkEncoded,
  encoding: Encoding = "json",
): Generator<{
  readonly message: Wire;
  readonly final: boolean;
}> {
  if (encoding === "binary") {
    const overhead = BinaryWire.sizeOfBinary({ ...chunk, values: [] }) - 1;
    let values: unknown[] = [];
    let bytes = 0;
    for (const value of chunk.values) {
      const size = BinaryWire.sizeOfBinary(value);
      const header = BinaryWire.arrayHeaderBytes(values.length + 1);
      if (values.length > 0 && overhead + header + bytes + size > maxMessageBytes) {
        yield { message: encode({ ...chunk, values }, encoding), final: false };
        values = [];
        bytes = 0;
      }
      if (overhead + 1 + size > maxMessageBytes) throw limitError(maxMessageBytes);
      values.push(value);
      bytes += size;
    }
    if (values.length === 0) throw new TypeError("An RPC chunk must contain a value");
    yield { message: encode({ ...chunk, values }, encoding), final: true };
    return;
  }
  const prefix = `{"_tag":"Chunk","requestId":${JSON.stringify(chunk.requestId)},"values":[`;
  const overhead = utf8.encode(prefix).byteLength + 2;
  let values: string[] = [];
  let bytes = overhead;
  for (const [index, value] of chunk.values.entries()) {
    // JSON calls an array value's toJSON with its original index.
    const field = JSON.stringify({ [index]: value });
    const json = field.slice(`{"${index}":`.length, -1) || "null";
    const size = utf8.encode(json).byteLength;
    if (overhead + size > maxMessageBytes) throw limitError(maxMessageBytes);
    if (bytes + size + (values.length === 0 ? 0 : 1) > maxMessageBytes) {
      yield { message: `${prefix}${values.join(",")}]}`, final: false };
      values = [];
      bytes = overhead;
    }
    bytes += size + (values.length === 0 ? 0 : 1);
    values.push(json);
  }
  yield { message: `${prefix}${values.join(",")}]}`, final: true };
}

/**
 * Slices a bulk answer's own encoded `Exit` packet into `AnswerPart` frames — the owner's mirror
 * of the client's own bulk-request `fragment`, but pure: sizing is the only concern here, and the
 * caller (`Runtime.ts`'s `send`) owns sending each frame and waiting for its acknowledgment. A
 * slice starts at half an envelope and is halved again on a `Limit`, down to the floor
 * `minPartBytes` enforces on the request side, since the client that will reassemble these parts
 * is the same one that floors a `RequestPart`'s own non-final size. A slice that does not fit one
 * envelope even at that floor rethrows the `Limit` it hit there — practically unreachable, since
 * an `AnswerPart`'s own wrapper costs a few dozen bytes, nowhere near the floor.
 */
export function* answerParts(
  requestId: string | number,
  wire: Uint8Array,
  encoding: Encoding = "json",
): Generator<{ readonly message: Wire; readonly final: boolean }> {
  const total = wire.byteLength;
  let offset = 0;
  let slice = Math.floor(maxMessageBytes / 2);
  while (offset < total) {
    const end = Math.min(offset + slice, total);
    const final = end >= total;
    const part = { _tag: "AnswerPart", requestId, bytes: wire.subarray(offset, end), final };
    let message: Wire;
    try {
      message = encode(part, encoding);
    } catch (cause) {
      const narrowed =
        cause instanceof SewedError && cause.code === "Limit" ? narrower(slice) : undefined;
      if (narrowed === undefined) throw cause;
      slice = narrowed;
      continue;
    }
    offset = end;
    yield { message, final };
  }
}

// `limit` is the envelope limit for every packet but an assembled bulk request, which the owner
// decodes with the operation's declared bound in its place.
const parse = (message: unknown, encoding?: Encoding, limit: number = maxMessageBytes): unknown => {
  if (isBytes(message) && encoding !== "json") {
    if (message.byteLength > limit) throw limitError(limit);
    // The one place a whole packet enters the unpacker, and the only one that can be handed bytes
    // another realm made: a port hands over what its own realm deserialized.
    return BinaryWire.decodeBinary(here(message));
  }
  if (encoding === "binary")
    throw new SewedError({ code: "Protocol", message: "Expected a binary RPC message" });
  if (typeof message !== "string") {
    throw new SewedError({ code: "Protocol", message: "Expected a JSON RPC message" });
  }
  if (message.length > limit || utf8.encode(message).byteLength > limit) {
    throw new SewedError({ code: "Limit", message: "RPC message exceeds the byte limit" });
  }
  return JSON.parse(message);
};

/**
 * A packet that parsed but did not decode, and the request it names when it names one: the
 * request that fails, typed, while the connection carries on. A packet that does not parse at all
 * names nothing — no part of it can be read — and ends the connection as a broken or hostile peer.
 */
export class Undecodable extends TypeError {
  readonly requestId: string | number | undefined;
  constructor(requestId: string | number | undefined, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Undecodable RPC message", { cause });
    this.requestId = requestId;
  }
}

const idIn = (value: unknown, field: "id" | "requestId"): string | number | undefined => {
  if (!isRecord(value)) return undefined;
  const id = value[field];
  return typeof id === "string" || typeof id === "number" ? id : undefined;
};

/**
 * Parses a packet and decodes it as one envelope. A packet that parses but is not canonical, or
 * does not match the envelope, throws `Undecodable` with the request `named` reads from what it
 * parsed to; anything that did not parse throws as it always has.
 */
const decodeEnvelope = <A>(
  message: unknown,
  encoding: Encoding | undefined,
  limit: number | undefined,
  named: (value: unknown) => string | number | undefined,
  decode: (value: unknown) => A,
): A => {
  let value: unknown;
  try {
    value = parse(message, encoding, limit);
  } catch (cause) {
    if (cause instanceof BinaryWire.Noncanonical) throw new Undecodable(named(cause.parsed), cause);
    throw cause;
  }
  try {
    return decode(value);
  } catch (cause) {
    throw new Undecodable(named(value), cause);
  }
};

/**
 * Only a whole request, or an answer to one, is failed alone. A part of either, or a part's
 * acknowledgment, is one step of a transfer both ends are still pacing, and one that does not
 * decode is a hostile part like any other: it ends the connection, which is what retires the
 * assembly on both ends. The assembled whole is its own request's failure, where it is decoded.
 */
const requestNamed = (value: unknown) =>
  isRecord(value) && value._tag === "Request" ? idIn(value, "id") : undefined;
const answerNamed = (value: unknown) =>
  isRecord(value) && (value._tag === "Exit" || value._tag === "Chunk")
    ? idIn(value, "requestId")
    : undefined;

export const decodeClient = (
  message: unknown,
  encoding?: Encoding,
  limit?: number,
): FromClientEncoded | RequestPart => {
  const value = decodeEnvelope(
    message,
    encoding,
    limit,
    requestNamed,
    Schema.decodeUnknownSync(clientEnvelope),
  );
  return value._tag === "Request"
    ? { ...value, headers: value.headers.map(([name, value]): [string, string] => [name, value]) }
    : value;
};
export const decodeServer = (
  message: unknown,
  encoding?: Encoding,
  limit?: number,
): FromServerEncoded | PartAck | AnswerPart =>
  // RPC JSON codecs encode undefined cause fields as null. RpcMessage's hole types
  // describe pre-codec values; RpcClient decodes those holes with the method schema.
  decodeEnvelope(
    message,
    encoding,
    limit,
    answerNamed,
    Schema.decodeUnknownSync(serverEnvelope),
  ) as FromServerEncoded | PartAck | AnswerPart;

/**
 * What a relay asks of a packet before forwarding it: that it decodes, or that it names the
 * request it fails. The endpoint fails that one request and keeps the connection, so a relay that
 * refused the packet would end every call on the connection for what the endpoint confines to
 * one. A packet that names nothing throws, and the relay closes as it always has.
 */
export const relayable =
  (decode: (message: unknown) => unknown) =>
  (message: unknown): void => {
    try {
      decode(message);
    } catch (error) {
      if (error instanceof Undecodable && error.requestId !== undefined) return;
      throw error;
    }
  };

export const rpcError = (cause: unknown) =>
  new RpcClientError({
    reason: new RpcClientDefect({
      message: cause instanceof Error ? cause.message : "Transport failed",
      cause,
    }),
  });

/**
 * A synthetic `Exit` failure, in the exact wire shape a real owner's answer would carry: the
 * client's own `fail` typed-fails an in-flight request with it directly, and the owner's `send`
 * (`Runtime.ts`) reaches for the same shape when an `Exit` refuses the envelope after its
 * handler ran. This assumes the operation's own declared `error` schema admits `SewedError` —
 * true of every operation this library declares, but unenforced here: nothing stops a consumer's
 * own `Rpc.make` from omitting `error` entirely (or naming a schema that excludes `SewedError`),
 * and RpcClient then fails *this* synthetic exit's own decode instead of handing it to the
 * caller, so the caller sees `Protocol: <tag>: Expected never` for a loss after send, or the
 * plain rethrown `Closed` at the `connection.send` catch site below for one before send — never
 * this function's own `code`/`reason` (see `docs/transport.md`). `cause`, when given, is the
 * `SewedError` that actually triggered the failure (T7): the request's own reasoned message
 * stays the answer, with the trigger attached rather than dropped, for a caller that reads that
 * far. It travels as its encoded fields, `_tag`, `code`, `message` and `reason`: the caller's
 * decode admits only JSON values in `cause`, and an error instance is not one, so attaching the
 * instance itself failed the whole answer as `Protocol: Expected JSON value`.
 */
export const failExit = (
  requestId: string | number,
  code: "Closed" | "Unknown" | "Protocol" | "Limit",
  message: string,
  reason: string,
  cause?: SewedError,
): FromServerEncoded => ({
  _tag: "Exit",
  requestId,
  exit: {
    _tag: "Failure",
    cause: [
      {
        _tag: "Fail",
        error: {
          _tag: "SewedError",
          code,
          message,
          reason,
          ...(cause === undefined
            ? {}
            : {
                cause: {
                  _tag: "SewedError",
                  code: cause.code,
                  message: cause.message,
                  ...(cause.reason === undefined ? {} : { reason: cause.reason }),
                },
              }),
        },
      },
    ],
  },
});

/** A request a client has sent, or is sending, and not yet had answered. */

export const pair = (): readonly [Connection, Connection] => {
  type Receiver = { receive: (message: unknown) => void; close: (reason: SewedError) => void };
  const receivers = new Map<number, Receiver>();
  const pending = new Map<number, Wire[]>([
    [0, []],
    [1, []],
  ]);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const reason = new SewedError({ code: "Closed", message: "Owner connection closed" });
    for (const receiver of receivers.values()) receiver.close(reason);
    receivers.clear();
    pending.clear();
  };
  const endpoint = (side: number): Connection => ({
    send(message) {
      if (closed) throw new SewedError({ code: "Closed", message: "Owner connection closed" });
      const receiver = receivers.get(1 - side);
      if (receiver) receiver.receive(message);
      else {
        const queue = pending.get(1 - side)!;
        if (queue.length >= maxPendingMessages) {
          close();
          throw new SewedError({ code: "Limit", message: "Connection queue is full" });
        }
        queue.push(message);
      }
    },
    subscribe(receive, onClose) {
      if (closed) onClose(new SewedError({ code: "Closed", message: "Owner connection closed" }));
      else {
        receivers.set(side, { receive, close: onClose });
        for (const message of pending.get(side)!) receive(message);
        pending.set(side, []);
      }
      return () => {
        receivers.delete(side);
      };
    },
    close,
  });
  return [endpoint(0), endpoint(1)];
};
