import { Cause, Effect, Queue, Schema, Scope } from "effect";
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
const limit = () =>
  new SewedError({
    code: "Limit",
    message: `RPC messages are limited to ${maxMessageBytes} bytes`,
  });

export type Wire = string | Uint8Array;

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
const clientEnvelope = Schema.Union([
  request,
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
const serverEnvelope = Schema.Union([
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

export function encode(message: unknown): string;
export function encode(message: unknown, encoding: Encoding): Wire;
export function encode(message: unknown, encoding: Encoding = "json"): Wire {
  if (encoding === "binary") {
    const bytes = BinaryWire.encodeBinary(message);
    if (bytes.byteLength > maxMessageBytes) throw limit();
    return bytes;
  }
  const json = JSON.stringify(message);
  if (json === undefined || utf8.encode(json).byteLength > maxMessageBytes) throw limit();
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
    if (overhead + size > maxMessageBytes) throw limit();
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

const parse = (message: unknown, encoding?: Encoding): unknown => {
  if (message instanceof Uint8Array && encoding !== "json") {
    if (message.byteLength > maxMessageBytes) throw limit();
    return BinaryWire.decodeBinary(message);
  }
  if (encoding === "binary")
    throw new SewedError({ code: "Protocol", message: "Expected a binary RPC message" });
  if (typeof message !== "string") {
    throw new SewedError({ code: "Protocol", message: "Expected a JSON RPC message" });
  }
  if (message.length > maxMessageBytes || utf8.encode(message).byteLength > maxMessageBytes) {
    throw new SewedError({ code: "Limit", message: "RPC message exceeds the byte limit" });
  }
  return JSON.parse(message);
};

export const decodeClient = (message: unknown, encoding?: Encoding): FromClientEncoded => {
  const value = Schema.decodeUnknownSync(clientEnvelope)(parse(message, encoding));
  return value._tag === "Request"
    ? { ...value, headers: value.headers.map(([name, value]): [string, string] => [name, value]) }
    : value;
};
export const decodeServer = (message: unknown, encoding?: Encoding): FromServerEncoded =>
  // RPC JSON codecs encode undefined cause fields as null. RpcMessage's hole types
  // describe pre-codec values; RpcClient decodes those holes with the method schema.
  Schema.decodeUnknownSync(serverEnvelope)(parse(message, encoding)) as FromServerEncoded;

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
  onFailure?: () => void,
) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (write) {
      const scope = yield* Scope.fork(yield* Effect.scope);
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
        if (failure === undefined) {
          failure = rpcError(cause);
          onFailure?.();
        }
        for (const key of requests.keys()) interrupt(key);
        Queue.failCauseUnsafe(inbox, Cause.fail(failure));
      };
      const unsubscribe = connection.subscribe((message) => {
        try {
          const decoded = decodeServer(message, encoding);
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
      return {
        send: (id: number, message: FromClientEncoded) =>
          Effect.gen(function* () {
            recipients.add(id);
            if (failure) return yield* Effect.fail(failure);
            const wire = yield* Effect.try({
              try: () => encode(message, encoding),
              catch: rpcError,
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
            } else if (message._tag === "Interrupt") interrupt(String(message.requestId));
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
