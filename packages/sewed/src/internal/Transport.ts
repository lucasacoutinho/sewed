import { Cause, Deferred, Effect, Queue, Schema, Scope, Semaphore } from "effect";
import type { Fiber } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { RpcClientDefect, RpcClientError } from "effect/unstable/rpc/RpcClientError";
import type {
  FromClientEncoded,
  FromServerEncoded,
  ResponseChunkEncoded,
} from "effect/unstable/rpc/RpcMessage";
import { SewedError } from "../SewedError.ts";
import type { Encoding } from "./Encoding.ts";
import * as BinaryWire from "./BinaryWire.ts";
import * as QueueDiagnostics from "./QueueDiagnostics.ts";

export const maxMessageBytes = 256 * 1024;
export const maxPendingMessages = 128;
export const maxRequestsPerConnection = 64;
const utf8 = new TextEncoder();
const limitError = (bytes: number) =>
  new SewedError({ code: "Limit", message: `RPC messages are limited to ${bytes} bytes` });

export type Wire = string | Uint8Array;

/** The measure `encode` applies: a packet's bytes, or the UTF-8 bytes of JSON text. */
export const sizeOf = (wire: Wire): number =>
  typeof wire === "string" ? utf8.encode(wire).byteLength : wire.byteLength;

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
};

/**
 * Rejoins a bulk request's parts into the packet its client encoded. Every part's runtime type
 * was checked against the connection's encoding as it arrived, so a JSON assembly holds only
 * text and a binary assembly only byte arrays.
 */
export const join = (parts: readonly Wire[], encoding: Encoding): Wire =>
  encoding === "json"
    ? parts.join("")
    : concat(parts.filter((part): part is Uint8Array => typeof part !== "string"));

// A slice is taken in the units the wire is indexed by: UTF-16 code units for JSON text, bytes
// for a packet.
const units = (wire: Wire): number => (typeof wire === "string" ? wire.length : wire.byteLength);
const cut = (wire: Wire, start: number, end: number): Wire =>
  typeof wire === "string" ? wire.slice(start, end) : wire.subarray(start, end);
// The join restores a surrogate pair split across two slices, but each half would count its own
// replacement character against the bound the owner is tallying. Moving the cut back one unit
// keeps the owner's tally equal to the whole packet's size.
const aligned = (wire: Wire, start: number, end: number): number =>
  typeof wire === "string" &&
  end - 1 > start &&
  end < wire.length &&
  (wire.charCodeAt(end - 1) & 0xfc00) === 0xd800
    ? end - 1
    : end;

export interface Connection {
  readonly send: (message: Wire) => void;
  readonly subscribe: (
    receive: (message: unknown) => void,
    close: (reason: SewedError) => void,
  ) => () => void;
  readonly close: () => void;
}

const requestId = Schema.Union([Schema.String, Schema.Number]);
const request = Schema.Struct({
  _tag: Schema.Literal("Request"),
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
 * bound. `bytes` is the encoded request's own wire form — JSON text or MessagePack bytes — so the
 * owner concatenates the slices and decodes the whole once, with no second codec.
 */
const requestPart = Schema.Struct({
  _tag: Schema.Literal("RequestPart"),
  id: requestId,
  tag: Schema.String,
  bytes: Schema.Union([Schema.String, Schema.Uint8Array]),
  final: Schema.Boolean,
});
export type RequestPart = typeof requestPart.Type;
const clientEnvelope = Schema.Union([
  request,
  requestPart,
  Schema.Struct({ _tag: Schema.Literal("Ack"), requestId }),
  Schema.Struct({ _tag: Schema.Literal("Interrupt"), requestId }),
  Schema.Struct({ _tag: Schema.Literal("Ping") }),
  Schema.Struct({ _tag: Schema.Literal("Eof") }),
]);
const cause = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Fail"), error: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.Literal("Die"), defect: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.Literal("Interrupt"), fiberId: Schema.NullOr(Schema.Number) }),
]);
/** The owner's answer to one `RequestPart`: the client may send the next slice. */
const partAck = Schema.Struct({
  _tag: Schema.Literal("PartAck"),
  requestId,
});
export type PartAck = typeof partAck.Type;
const serverEnvelope = Schema.Union([
  partAck,
  Schema.Struct({
    _tag: Schema.Literal("Exit"),
    requestId,
    exit: Schema.Union([
      Schema.Struct({ _tag: Schema.Literal("Success"), value: Schema.Unknown }),
      Schema.Struct({ _tag: Schema.Literal("Failure"), cause: Schema.Array(cause) }),
    ]),
  }),
  Schema.Struct({
    _tag: Schema.Literal("Chunk"),
    requestId,
    values: Schema.NonEmptyArray(Schema.Unknown),
  }),
  Schema.Struct({ _tag: Schema.Literal("Defect"), defect: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.Literal("Pong") }),
]);

export function encode(message: unknown, encoding?: "json", limit?: number): string;
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

export function encodeChunks(chunk: ResponseChunkEncoded): Generator<{
  readonly message: string;
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
    let values: unknown[] = [];
    let message: Wire | undefined;
    for (const value of chunk.values) {
      const next = [...values, value];
      try {
        message = encode({ ...chunk, values: next }, encoding);
        values = next;
      } catch (error) {
        if (!(error instanceof SewedError) || error.code !== "Limit" || message === undefined)
          throw error;
        yield { message, final: false };
        values = [value];
        message = encode({ ...chunk, values }, encoding);
      }
    }
    if (message === undefined) throw new TypeError("An RPC chunk must contain a value");
    yield { message, final: true };
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

// `limit` is the envelope limit for every packet but an assembled bulk request, which the owner
// decodes with the operation's declared bound in its place.
const parse = (message: unknown, encoding?: Encoding, limit: number = maxMessageBytes): unknown => {
  if (message instanceof Uint8Array && encoding !== "json") {
    if (message.byteLength > limit) throw limitError(limit);
    return BinaryWire.decodeBinary(message);
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

export const decodeClient = (
  message: unknown,
  encoding?: Encoding,
  limit?: number,
): FromClientEncoded | RequestPart => {
  const value = Schema.decodeUnknownSync(clientEnvelope)(parse(message, encoding, limit));
  return value._tag === "Request"
    ? { ...value, headers: value.headers.map(([name, value]): [string, string] => [name, value]) }
    : value;
};
export const decodeServer = (
  message: unknown,
  encoding?: Encoding,
  limit?: number,
): FromServerEncoded | PartAck =>
  // RPC JSON codecs encode undefined cause fields as null. RpcMessage's hole types
  // describe pre-codec values; RpcClient decodes those holes with the method schema.
  Schema.decodeUnknownSync(serverEnvelope)(parse(message, encoding, limit)) as
    | FromServerEncoded
    | PartAck;

export const rpcError = (cause: unknown) =>
  new RpcClientError({
    reason: new RpcClientDefect({
      message: cause instanceof Error ? cause.message : "Transport failed",
      cause,
    }),
  });

export const clientProtocol = (
  connection: Connection,
  encoding: Encoding = "json",
  bounds: ReadonlyMap<string, number> = new Map(),
  onFailure?: () => void,
) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (write) {
      const scope = yield* Scope.fork(yield* Effect.scope);
      // One bulk request crosses a connection at a time, so its owner holds one assembly and the
      // memory a connection costs is bounded by the largest declared bound. Only a bulk send
      // takes the permit: an ordinary request is sent between two parts without waiting.
      const gate = Semaphore.makeUnsafe(1);
      const partAcks = new Map<string, Deferred.Deferred<void, RpcClientError>>();
      const inbox = yield* Queue.bounded<FromServerEncoded, RpcClientError>(maxPendingMessages);
      const recipients = new Set<number>();
      const requests = new Map<
        string,
        {
          readonly queue: Queue.Queue<FromServerEncoded>;
          readonly fiber: Fiber.Fiber<void>;
        }
      >();
      yield* QueueDiagnostics.observe(
        () =>
          Queue.sizeUnsafe(inbox) +
          [...requests.values()].reduce(
            (total, request) => total + Queue.sizeUnsafe(request.queue),
            0,
          ),
        maxPendingMessages + maxRequestsPerConnection * 2,
        { kind: "rpc-client", activeRequests: () => requests.size },
      );
      let failure: RpcClientError | undefined;
      const interrupt = (key: string) => {
        const request = requests.get(key);
        requests.delete(key);
        request?.fiber.interruptUnsafe();
      };
      const fail = (cause: unknown) => {
        const first = failure === undefined;
        const reported = failure ?? rpcError(cause);
        failure = reported;
        // A request waiting for a part acknowledgment was not delivered, so its handler cannot
        // have run, and it fails with that fact rather than with the general transport failure,
        // which says nothing about whether the owner saw the request. It is told before anything
        // else: the listener a lost connection notifies drops this client and closes its scope,
        // and the interruption that follows carries no answer at all.
        if (partAcks.size > 0) {
          const undelivered = rpcError(
            new SewedError({
              code: "Closed",
              message: "Connection closed before the bulk request was delivered",
            }),
          );
          for (const [key, acknowledged] of partAcks) {
            partAcks.delete(key);
            Deferred.doneUnsafe(acknowledged, Effect.fail(undelivered));
          }
        }
        if (first) onFailure?.();
        for (const key of requests.keys()) interrupt(key);
        Queue.failCauseUnsafe(inbox, Cause.fail(reported));
      };
      const unsubscribe = connection.subscribe((message) => {
        try {
          const decoded = decodeServer(message, encoding);
          if (decoded._tag === "PartAck") {
            const acknowledged = partAcks.get(String(decoded.requestId));
            if (acknowledged !== undefined) Deferred.doneUnsafe(acknowledged, Effect.void);
            return;
          }
          if (!Queue.offerUnsafe(inbox, decoded)) {
            fail(new SewedError({ code: "Limit", message: "RPC response queue is full" }));
          }
        } catch (error) {
          fail(error);
        }
      }, fail);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          unsubscribe();
          for (const key of requests.keys()) interrupt(key);
          connection.close();
        }),
      );
      yield* Queue.take(inbox).pipe(
        Effect.flatMap((response) => {
          if (response._tag !== "Chunk" && response._tag !== "Exit")
            return Effect.forEach(recipients, (id) => write(id, response), { discard: true });
          return Effect.sync(() => {
            const request = requests.get(String(response.requestId));
            if (request && !Queue.offerUnsafe(request.queue, response))
              fail(
                new SewedError({ code: "Limit", message: "RPC request response queue is full" }),
              );
          });
        }),
        Effect.forever,
        Effect.catch((error) =>
          Effect.forEach(recipients, (id) => write(id, { _tag: "ClientProtocolError", error }), {
            discard: true,
          }),
        ),
        Effect.forkScoped,
      );
      // A request too large for one envelope leaves as slices of its own encoded packet, one in
      // flight, each answered by the owner's PartAck before the next is sent — the mirror of the
      // acknowledgment a split stream batch already waits for. A slice is sized by trying: half
      // the envelope limit, halved on a Limit, the way encodeChunks sizes a binary fragment.
      const fragment = (id: string | number, tag: string, wire: Wire) =>
        Effect.gen(function* () {
          const key = String(id);
          const total = units(wire);
          let offset = 0;
          let slice = Math.floor(maxMessageBytes / 2);
          while (offset < total) {
            const end = aligned(wire, offset, Math.min(offset + slice, total));
            const final = end >= total;
            const part = { _tag: "RequestPart", id, tag, bytes: cut(wire, offset, end), final };
            let frame: Wire;
            try {
              frame = encode(part, encoding);
            } catch (cause) {
              if (cause instanceof SewedError && cause.code === "Limit" && slice > 1) {
                slice = Math.floor(slice / 2);
                continue;
              }
              return yield* Effect.fail(rpcError(cause));
            }
            // The owner's acknowledgment can arrive while `send` is still on the stack, so the
            // wait is registered before the part leaves.
            const acknowledged = final ? undefined : Deferred.makeUnsafe<void, RpcClientError>();
            if (acknowledged !== undefined) partAcks.set(key, acknowledged);
            yield* Effect.try({ try: () => connection.send(frame), catch: rpcError }).pipe(
              Effect.tapError((error) => Effect.sync(() => fail(error))),
            );
            offset = end;
            if (acknowledged !== undefined) {
              yield* Deferred.await(acknowledged).pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    if (partAcks.get(key) === acknowledged) partAcks.delete(key);
                  }),
                ),
              );
            }
          }
        });
      return {
        send: (id: number, message: FromClientEncoded) =>
          Effect.gen(function* () {
            recipients.add(id);
            if (failure) return yield* Effect.fail(failure);
            // A declared operation's request is measured against its bound; every other packet
            // keeps the envelope limit.
            const bound = message._tag === "Request" ? bounds.get(message.tag) : undefined;
            const wire = yield* Effect.try({
              try: () => encode(message, encoding, bound ?? maxMessageBytes),
              catch: (cause) =>
                rpcError(
                  bound !== undefined && cause instanceof SewedError && cause.code === "Limit"
                    ? new SewedError({
                        code: "Limit",
                        message: `Request exceeds the operation's bulk bound of ${bound} bytes`,
                      })
                    : cause,
                ),
            });
            if (message._tag === "Request") {
              const key = String(message.id);
              if (requests.size >= maxRequestsPerConnection || requests.has(key))
                return yield* Effect.fail(
                  rpcError(
                    new SewedError({
                      code: "Limit",
                      message: "RPC client has too many requests or a duplicate identity",
                    }),
                  ),
                );
              // Acknowledgments bound each stream independently. Its final Exit stays ordered
              // behind its chunks without delaying a different request's response.
              const queue = yield* Queue.bounded<FromServerEncoded>(2);
              const fiber = yield* Effect.gen(function* () {
                while (true) {
                  const response = yield* Queue.take(queue);
                  yield* write(id, response);
                  if (response._tag === "Exit") return;
                }
              }).pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    if (requests.get(key)?.queue === queue) requests.delete(key);
                  }),
                ),
                Effect.forkIn(scope),
              );
              requests.set(key, { queue, fiber });
            } else if (message._tag === "Interrupt") {
              const key = String(message.requestId);
              interrupt(key);
              // A bulk request abandoned between parts stops where it is; the owner drops its
              // assembly when this Interrupt reaches it.
              const acknowledged = partAcks.get(key);
              if (acknowledged !== undefined) {
                partAcks.delete(key);
                Deferred.doneUnsafe(acknowledged, Effect.interrupt);
              }
            }
            if (message._tag === "Request" && sizeOf(wire) > maxMessageBytes) {
              return yield* Semaphore.withPermits(gate, 1)(fragment(message.id, message.tag, wire));
            }
            yield* Effect.try({
              try: () => connection.send(wire),
              catch: rpcError,
            }).pipe(Effect.tapError((error) => Effect.sync(() => fail(error))));
          }),
        supportsAck: true,
        supportsTransferables: false,
        codecFor: encoding === "binary" ? BinaryWire.codecFor : RpcSerialization.json.codecFor,
      };
    }),
  );

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
