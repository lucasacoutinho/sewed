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
import type { Bound } from "./Bulk.ts";
import type { Encoding } from "./Encoding.ts";
import * as BinaryWire from "./BinaryWire.ts";
import { Bytes, here, isBytes } from "./Bytes.ts";
import * as QueueDiagnostics from "./QueueDiagnostics.ts";

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
 * bound. `bytes` is a slice of the encoded request's own MessagePack packet, so the owner
 * concatenates the slices and decodes the whole once, with no second codec. A bulk operation
 * belongs to a `Binary.protocol` — refused anywhere else where the slot is declared — so a part
 * carrying anything but bytes is not a packet this transport can have produced.
 */
const requestPart = Schema.Struct({
  _tag: Schema.Literal("RequestPart"),
  id: requestId,
  tag: Schema.String,
  bytes: Bytes,
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

/**
 * A synthetic `Exit` failure, in the exact wire shape a real owner's answer would carry, for one
 * in-flight request `fail` typed-fails directly. This assumes the operation's own declared
 * `error` schema admits `SewedError` — true of every operation this library declares, but
 * unenforced here: nothing stops a consumer's own `Rpc.make` from omitting `error` entirely (or
 * naming a schema that excludes `SewedError`), and RpcClient then fails *this* synthetic exit's
 * own decode instead of handing it to the caller, so the caller sees `Protocol: <tag>: Expected
 * never` for a loss after send, or the plain rethrown `Closed` at the `connection.send` catch
 * site below for one before send — never this function's own `code`/`reason` (see
 * `docs/transport.md`). `cause`, when given, is the `SewedError` that actually triggered `fail`
 * (T7): the request's own reasoned message stays the answer, with the trigger attached rather
 * than dropped, for a caller that reads that far.
 */
const failExit = (
  requestId: string | number,
  code: "Closed" | "Unknown",
  message: string,
  reason: string,
  cause?: unknown,
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
          ...(cause === undefined ? {} : { cause }),
        },
      },
    ],
  },
});

export const clientProtocol = (
  connection: Connection,
  encoding: Encoding = "json",
  bounds: ReadonlyMap<string, Bound> = new Map(),
  onFailure?: () => void,
) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (write) {
      const scope = yield* Scope.fork(yield* Effect.scope);
      // One bulk request crosses a connection at a time, so its owner holds one assembly and the
      // memory a connection costs is bounded by the largest declared bound. Only a bulk send
      // takes the permit: an ordinary request is sent between two parts without waiting.
      const gate = Semaphore.makeUnsafe(1);
      /** The rendezvous for the one part in flight on a connection: the owner's `PartAck`. */
      const partAcks = new Map<string, Deferred.Deferred<void, RpcClientError>>();
      /**
       * One wait per bulk send in progress, covering the whole span in which the owner cannot yet
       * have seen the request: the wait for the gate, in which not a byte has left, and the part
       * loop after it. A lost connection fails these, so a caller whose request was queued behind
       * another transfer is told the same fact as one suspended between two parts — the request
       * was not delivered — instead of a bare interruption that says nothing about the owner.
       */
      const undelivered = new Map<string, Deferred.Deferred<never, RpcClientError>>();
      const inbox = yield* Queue.bounded<FromServerEncoded, RpcClientError>(maxPendingMessages);
      const recipients = new Set<number>();
      const requests = new Map<
        string,
        {
          readonly queue: Queue.Queue<FromServerEncoded>;
          readonly fiber: Fiber.Fiber<void>;
          /** The recipient `write` routes a synthetic Exit to, the same `id` `send` was called with. */
          readonly clientId: number;
          /** The request's own id, exactly as its `Request`/`RequestPart` carried it on the wire. */
          readonly requestId: string | number;
          /**
           * Set once `connection.send` (or the last bulk part) has actually left. `fail` reads
           * this to answer `Closed` (never left) or `Unknown` (left, no answer arrived) for a
           * request still here when the connection is lost. A loss `fail` learns about
           * synchronously — nested inside this very `connection.send` call, which only an
           * in-process owner can trigger (`pair()`, `Host.ts`) — runs before this flips, so it
           * still answers `Closed` even though the bytes already left: the transport can only
           * prove what it has already observed, and a synchronous close from inside the send
           * reads as the owner refusing the frame, not as losing it after taking it (T5).
           */
          sent: boolean;
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
        // `onFailure` runs first now, not last. For a shared client it is `evict` (`Binding.ts`),
        // and `evict` is itself two-phase: it deletes the registry entry synchronously and only
        // *schedules* `Scope.close` as a microtask, so calling it here does not itself interrupt
        // anything yet. What running it first buys is a live registry for the two delivery loops
        // below: `write`, a few lines down, can resume a suspended caller inline, in this same
        // call stack, and a follow-up call that caller's own continuation makes must not find the
        // entry this failure is about to retire — it must reconnect (T2). Both loops still finish,
        // synchronously, answering every request typed, before the microtask queue can turn and
        // that scheduled `Scope.close` ever runs, so no interruption reaches a caller ahead of its
        // typed answer here. A test pins both halves of this order.
        if (first) onFailure?.();
        // A Limit (the inbox or a request's own response queue overflowing) is itself the reason
        // every in-flight request below is about to lose its connection; carried as `cause` on
        // their own synthetic failures rather than dropped, for a caller that reads that far (T7).
        const limitCause =
          first && cause instanceof SewedError && cause.code === "Limit" ? cause : undefined;
        // A bulk send that has not finished its last part was not delivered, so its handler
        // cannot have run, and it fails with that fact rather than with the general transport
        // failure, which says nothing about whether the owner saw the request. A send still
        // waiting on the gate is the same case and is registered the same way: it has sent
        // nothing at all.
        if (undelivered.size > 0) {
          const closed = rpcError(
            new SewedError({
              code: "Closed",
              message: "Connection closed before the bulk request was delivered",
              reason: "transport/closed-before-send",
              ...(limitCause === undefined ? {} : { cause: limitCause }),
            }),
          );
          for (const [key, waiting] of undelivered) {
            undelivered.delete(key);
            Deferred.doneUnsafe(waiting, Effect.fail(closed));
          }
        }
        // A bulk send still mid-transfer never reaches this loop: draining `undelivered` just
        // above already removed its `requests` entry too — `Deferred.doneUnsafe` resumes the
        // waiting send fiber inline, and its `tapError` calls `interrupt(key)` (`requests.delete`
        // plus `fiber.interruptUnsafe`) before this loop starts. There is nothing left here for an
        // `undelivered.has(key)` check to find (T3).
        //
        // Every request still here answers typed too: `Closed` if it never left (a send failing
        // on the stack right below is the one way `sent` can still be false here), `Unknown` if it
        // did and nothing has come back — a caller that retried on a bare interruption must not
        // retry this one. `write` is what actually resumes the caller, proven by marker trace
        // (`.artifacts/review-wave-5-final/`): with `openClient`'s post-`RpcClient.make` yield
        // (T1), the client's run fiber has always registered by the time any call can reach here,
        // so this delivery is never buffered and lost the way it could be before that fix. The
        // `Effect.try` rethrow at the `connection.send` call site below is a second voice on the
        // same conclusion when a send throws synchronously — this `write` already resolved the
        // entry by the time that rethrow's own failure could reach the caller a different way
        // (T4).
        for (const [key, request] of requests) {
          requests.delete(key);
          request.fiber.interruptUnsafe();
          const exit = request.sent
            ? failExit(
                request.requestId,
                "Unknown",
                "Connection lost after the request was sent; whether it was handled is unknown",
                "transport/lost-after-send",
                limitCause,
              )
            : failExit(
                request.requestId,
                "Closed",
                "Connection closed before the request was sent",
                "transport/closed-before-send",
                limitCause,
              );
          Effect.runSync(write(request.clientId, exit));
        }
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
      // Built where it is needed rather than on every send: an ordinary request, acknowledgment
      // or ping pays nothing for a feature it does not use, and an `Error` subclass costs a
      // stack capture.
      const besideEnvelope = () =>
        rpcError(
          new SewedError({
            code: "Limit",
            message: "The request beside its bulk field exceeds the envelope limit",
          }),
        );
      // A request too large for one envelope leaves as slices of its own encoded packet, one in
      // flight, each answered by the owner's PartAck before the next is sent — the mirror of the
      // acknowledgment a split stream batch already waits for. A slice is sized by trying: half
      // the envelope limit, halved on a Limit, the way encodeChunks sizes a binary fragment.
      // `possiblyReceived` is called for the final slice alone, from inside the very same plain
      // callback `connection.send` itself runs in — not from this generator's own next step. A
      // `pair()` delivers synchronously, so an in-process owner may already have the whole request
      // assembled the instant `connection.send` returns; probed live, though, even a synchronous
      // `Effect.try`'s own result reaches a `yield*`-ing generator through the fiber's ordinary
      // resume path, which is not guaranteed to run before a connection loss triggered from
      // outside this fiber reaches `fail` first — only plain, uninterrupted JS in the same callback
      // is. `fail` reads two maps to answer a still-open request: `undelivered`, which claims
      // nothing has left yet, and a request's own `sent` flag. Both are updated here, inline,
      // instead of from a `.pipe(Effect.tap)` downstream of `Effect.raceFirst`, which a connection
      // lost in that same gap can reach first — answering `Closed` for a request whose bytes had
      // already, provably, left (reproduced live: a `tap.senders` probe over `pair()` showed the
      // final part on the wire before such a loss, yet the caller still read
      // `Closed`/`transport/closed-before-send` under the deferred-tap version this replaced).
      const fragment = (
        id: string | number,
        tag: string,
        wire: Uint8Array,
        possiblyReceived: () => void,
      ) =>
        Effect.gen(function* () {
          const key = String(id);
          const total = wire.byteLength;
          let offset = 0;
          let slice = Math.floor(maxMessageBytes / 2);
          while (offset < total) {
            const end = Math.min(offset + slice, total);
            const final = end >= total;
            const part = {
              _tag: "RequestPart",
              id,
              tag,
              bytes: wire.subarray(offset, end),
              final,
            };
            let frame: Wire;
            try {
              frame = encode(part, encoding);
            } catch (cause) {
              const narrowed =
                cause instanceof SewedError && cause.code === "Limit" ? narrower(slice) : undefined;
              if (narrowed !== undefined) {
                slice = narrowed;
                continue;
              }
              // Halving stops at the floor the owner enforces, so this client never sends a part
              // the owner would refuse for being too small. A part that does not fit an envelope
              // even at the floor cannot be sent at all, and saying so is better than sending one
              // that will close the connection.
              return yield* Effect.fail(
                cause instanceof SewedError && cause.code === "Limit"
                  ? rpcError(
                      new SewedError({
                        code: "Protocol",
                        message: `A bulk part of the smallest allowed ${minPartBytes} bytes does not fit one envelope`,
                      }),
                    )
                  : rpcError(cause),
              );
            }
            // The owner's acknowledgment can arrive while `send` is still on the stack, so the
            // wait is registered before the part leaves. The finalizer covers that whole window,
            // not just the wait: an interruption between registering and awaiting would
            // otherwise leave an entry behind for a request that is no longer being sent.
            const acknowledged = final ? undefined : Deferred.makeUnsafe<void, RpcClientError>();
            yield* Effect.gen(function* () {
              if (acknowledged !== undefined) partAcks.set(key, acknowledged);
              // `possiblyReceived` runs inside this same `try`, right after `connection.send`,
              // rather than as this generator's own next step: even a synchronous `Effect.try`
              // hands its result back to a `yield*` through the fiber's own resume path, which
              // (probed live) is not guaranteed to run before a synchronous connection loss
              // triggered from outside this fiber reaches `fail` — only plain, uninterrupted JS in
              // the same callback is.
              yield* Effect.try({
                try: () => {
                  connection.send(frame);
                  if (final) possiblyReceived();
                },
                catch: rpcError,
              }).pipe(Effect.tapError((error) => Effect.sync(() => fail(error))));
              offset = end;
              if (acknowledged !== undefined) yield* Deferred.await(acknowledged);
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  if (acknowledged !== undefined && partAcks.get(key) === acknowledged)
                    partAcks.delete(key);
                }),
              ),
            );
          }
        });
      return {
        send: (id: number, message: FromClientEncoded) =>
          Effect.gen(function* () {
            recipients.add(id);
            if (failure) return yield* Effect.fail(failure);
            // A declared operation's bulk field is measured exactly, before anything is sent, so
            // an oversized attachment costs the caller no wire and the owner no buffer. The rest
            // of that request keeps one envelope's allowance on top; every other packet keeps the
            // envelope limit alone.
            const bound = message._tag === "Request" ? bounds.get(message.tag) : undefined;
            const bulk =
              message._tag === "Request" && bound !== undefined
                ? bulkField(message.payload, bound.field)
                : undefined;
            if (bound !== undefined) {
              if (bulk === undefined) {
                return yield* Effect.fail(
                  rpcError(
                    new SewedError({
                      code: "Protocol",
                      message: "A bulk field is Binary.Bytes in a Binary.protocol",
                    }),
                  ),
                );
              }
              if (bulk.byteLength > bound.maxBytes) {
                return yield* Effect.fail(
                  rpcError(
                    new SewedError({
                      code: "Limit",
                      message: `${bound.field} exceeds the operation's bulk bound of ${bound.maxBytes} bytes`,
                    }),
                  ),
                );
              }
            }
            const wire = yield* Effect.try({
              try: () =>
                encode(
                  message,
                  encoding,
                  bound === undefined ? maxMessageBytes : bound.maxBytes + maxMessageBytes,
                ),
              catch: (cause) =>
                bound !== undefined && cause instanceof SewedError && cause.code === "Limit"
                  ? besideEnvelope()
                  : rpcError(cause),
            });
            // Only the declared field is allowed to be bulk. Everything else in the request —
            // the other fields, the headers, the envelope — keeps the limit it would have had
            // without the declaration, so a bound on an attachment does not lift the limit on a
            // command string beside it.
            if (bulk !== undefined && sizeOf(wire) - bulk.byteLength > maxMessageBytes) {
              return yield* Effect.fail(besideEnvelope());
            }
            // The packet a bulk request leaves as slices of, or undefined for a request sent
            // whole. Both answers are settled before the request is registered below, so the
            // refusal that follows leaves no entry and no forked fiber behind.
            //
            // A bulk operation belongs to a Binary.protocol, refused anywhere else where the slot
            // is declared, so that packet is always MessagePack bytes. Text here means a protocol
            // reached this transport without that check; saying so is better than sending a
            // packet no owner will accept.
            let sliced:
              | { readonly id: string | number; readonly tag: string; readonly packet: Uint8Array }
              | undefined;
            if (message._tag === "Request" && bound !== undefined) {
              if (typeof wire === "string") {
                return yield* Effect.fail(
                  rpcError(
                    new SewedError({
                      code: "Protocol",
                      message: "A bulk operation needs a Binary.protocol",
                    }),
                  ),
                );
              }
              // A request that still fits one envelope is sent whole.
              if (wire.byteLength > maxMessageBytes)
                sliced = { id: message.id, tag: message.tag, packet: wire };
            }
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
              requests.set(key, { queue, fiber, clientId: id, requestId: message.id, sent: false });
            } else if (message._tag === "Interrupt") {
              // A bulk request abandoned between parts stops where it is with no help from here:
              // RpcClient interrupts the sending fiber before it asks for this Interrupt, and
              // that interruption unwinds the part loop and releases the gate. The owner drops
              // its assembly when this Interrupt reaches it, which it does before the next
              // request's first part because the loop has already stopped.
              interrupt(String(message.requestId));
            }
            if (sliced !== undefined) {
              const key = String(sliced.id);
              const closed = Deferred.makeUnsafe<never, RpcClientError>();
              // Registered before the permit is taken, so the span a lost connection has to
              // answer for starts at the gate and not at the first part.
              undelivered.set(key, closed);
              // Handed to `fragment` and called inline for the final part alone — see its own
              // doc comment for why inline, there, is load-bearing. `fail` checks `undelivered`
              // before `sent`, so both are cleared here together: leaving `undelivered`'s own
              // removal to the `Effect.ensuring` below (which still runs, for every other way this
              // send can end) would answer `Closed` from that map regardless of `sent`.
              const possiblyReceived = () => {
                if (undelivered.get(key) === closed) undelivered.delete(key);
                const entry = requests.get(key);
                if (entry !== undefined) entry.sent = true;
              };
              return yield* Semaphore.withPermits(
                gate,
                1,
              )(fragment(sliced.id, sliced.tag, sliced.packet, possiblyReceived)).pipe(
                Effect.raceFirst(Deferred.await(closed)),
                // A part that cannot be encoded fails this send after the request was registered
                // above. Without dropping that registration the entry and its forked fiber would
                // sit on the connection until it ended.
                Effect.tapError(() => Effect.sync(() => interrupt(key))),
                Effect.ensuring(
                  Effect.sync(() => {
                    if (undelivered.get(key) === closed) undelivered.delete(key);
                  }),
                ),
              );
            }
            yield* Effect.try({
              try: () => connection.send(wire),
              // The one place a `Request` genuinely never left: `connection.send` itself threw.
              // `fail`, called from the `tapError` below, delivers the caller's real answer here:
              // its own per-request loop finds this request's entry still `sent: false` and
              // resolves it, through `write`, before this `catch` even returns to its own caller —
              // proven by marker trace (`.artifacts/review-wave-5-final/`), and guaranteed rather
              // than raced once `openClient` yields after `RpcClient.make` (T1), so the run fiber
              // that `write` resumes has always registered by now. The `SewedError` built right
              // here, thrown back out of this `try`, is a second voice on the same conclusion —
              // reached only if that `write` had not already resolved the entry, which is not the
              // proven case on this path (T4).
              catch: (cause) =>
                message._tag === "Request"
                  ? rpcError(
                      new SewedError({
                        code: "Closed",
                        message: "Connection closed before the request was sent",
                        reason: "transport/closed-before-send",
                        cause,
                      }),
                    )
                  : rpcError(cause),
            }).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (message._tag !== "Request") return;
                  const entry = requests.get(String(message.id));
                  if (entry !== undefined) entry.sent = true;
                }),
              ),
              Effect.tapError((error) => Effect.sync(() => fail(error))),
            );
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
