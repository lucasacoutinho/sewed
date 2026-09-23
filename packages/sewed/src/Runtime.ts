import { Context, Deferred, Effect, Match, Option, Queue, Scope } from "effect";
import { Rpc, RpcSchema, RpcSerialization, RpcServer } from "effect/unstable/rpc";
import type { RpcGroup } from "effect/unstable/rpc";
import type { FromClientEncoded, FromServerEncoded } from "effect/unstable/rpc/RpcMessage";
import { SewedError } from "./SewedError.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { location, OwnerContext, sink } from "./internal/Diagnostics.ts";
import {
  answerParts,
  bulkField,
  concat,
  decodeClient,
  encode,
  encodeChunks,
  failExit,
  maxMessageBytes,
  maxPendingMessages,
  maxRequestsPerConnection,
  minPartBytes,
  type Connection,
  type RequestPart,
  type Wire,
} from "./internal/Transport.ts";
import { answerBoundsOf, boundsOf } from "./internal/Bulk.ts";
import { encodingOf } from "./internal/Encoding.ts";
import * as BinaryWire from "./internal/BinaryWire.ts";
import * as QueueDiagnostics from "./internal/QueueDiagnostics.ts";
import * as StreamDiagnostics from "./internal/StreamDiagnostics.ts";

export type HandlerServices<Rpcs extends Rpc.Any> =
  | Rpc.ToHandler<Rpcs>
  | Rpc.Middleware<Rpcs>
  | Rpc.ServicesServer<Rpcs>;

/** The parts of one bulk request received so far, and what they weigh against its bound. */
interface Assembly {
  readonly id: string;
  readonly tag: string;
  readonly parts: Uint8Array[];
  bytes: number;
}

interface Client {
  connection: Connection;
  unsubscribe: () => void;
  /** Every request still open on this connection, by id, with the operation it named. */
  requests: Map<string, string>;
  acknowledgments: Map<string, Deferred.Deferred<void>>;
  /**
   * Requests on a `Binary.bulkAnswer` operation whose caller has interrupted them. An answer
   * still to come sends nothing; one leaving in parts stops after the part in flight.
   */
  abandoned: Set<string>;
  assembly: Assembly | undefined;
  /** Both directions of the protocol send through here: a refused packet is a lost connection. */
  send: (message: Wire) => boolean;
}

export const server = <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: { readonly ownerId?: string } = {},
) =>
  Effect.gen(function* () {
    const encoding = encodingOf(protocol);
    const workerOwner = yield* Effect.serviceOption(OwnerContext);
    const ownerId =
      options.ownerId ??
      (Option.isSome(workerOwner) ? workerOwner.value.id : yield* generateInstanceId());
    const serverContext = yield* Effect.context<Rpc.ServicesServer<Rpcs>>();
    const ownerServerServices = new Map(serverContext.mapUnsafe);
    for (const [key, value] of ownerServerServices) {
      if (
        typeof value === "object" &&
        value !== null &&
        "context" in value &&
        Context.isContext(value.context)
      ) {
        ownerServerServices.set(key, {
          ...value,
          context: Context.add(value.context, OwnerContext, { id: ownerId }),
        });
      }
    }
    const ownerServerContext = Context.makeUnsafe(ownerServerServices);
    const observer = yield* sink;
    const placement = yield* location;
    observer?.emit({ _tag: "OwnerStarted", ownerId, ...placement });
    const streamProcedures = new Set<string>();
    for (const [tag, request] of protocol.requests) {
      if (Rpc.isRpc(request) && RpcSchema.isStreamSchema(request.successSchema))
        streamProcedures.add(tag);
    }
    const bounds = boundsOf(protocol);
    const answerBounds = answerBoundsOf(protocol);
    const transfers = observer === undefined ? undefined : StreamDiagnostics.make(observer.emit);
    const identity = (clientId: number, requestId: string): StreamDiagnostics.Identity => ({
      ownerId,
      clientId,
      requestId,
      placement,
    });
    let nextId = 0;
    let closed = false;
    const clients = new Map<number, Client>();
    const inbox = yield* Queue.bounded<readonly [number, FromClientEncoded]>(maxPendingMessages);
    yield* QueueDiagnostics.observe(() => Queue.sizeUnsafe(inbox), maxPendingMessages, {
      kind: "rpc-server",
      ownerId,
      activeRequests: () =>
        [...clients.values()].reduce((count, client) => count + client.requests.size, 0),
    });
    const disconnects = yield* Queue.make<number>();
    const disconnect = (id: number, reason = "connection-closed") => {
      const client = clients.get(id);
      if (!client) return;
      clients.delete(id);
      for (const requestId of client.requests.keys()) {
        transfers?.finish(identity(id, requestId));
        observer?.emit({
          _tag: "RequestEnded",
          ownerId,
          clientId: id,
          requestId,
          outcome: "disconnected",
          reason,
        });
      }
      client.unsubscribe();
      client.connection.close();
      // A stream's chunk or a bulk answer's part may be waiting here for this client's own
      // acknowledgment, nested inside `send`'s own fiber rather than the handler's — a unary
      // handler has already finished producing its Exit by the time a bulk answer starts
      // fragmenting it, so RpcServer's own per-request fiber interruption, keyed to the handler,
      // never reaches this wait. The connection is closed and the client unregistered first: a
      // released wait can resume inline, inside this very call, and its next write must find
      // the client gone rather than a live connection to send one more frame down.
      for (const acknowledgment of client.acknowledgments.values())
        Deferred.doneUnsafe(acknowledgment, Effect.void);
      Queue.offerUnsafe(disconnects, id);
    };
    /**
     * Retires a request once its answer has left, whichever shape that answer actually took on
     * the wire: the handler's own `Exit`, or the typed refusal `send` substitutes for one that
     * does not fit an envelope. A client already disconnected has reported its requests ended
     * there, so nothing is reported twice.
     */
    const endRequest = (
      clientId: number,
      client: Client,
      requestId: string | number,
      outcome: "success" | "failure" | "interrupted",
    ) => {
      const key = String(requestId);
      if (clients.get(clientId) !== client || !client.requests.delete(key)) return;
      transfers?.finish(identity(clientId, key));
      observer?.emit({
        _tag: "RequestEnded",
        ownerId,
        clientId,
        requestId: key,
        outcome,
        reason: "response",
      });
    };
    const outcomeOf = (exit: Extract<FromServerEncoded, { _tag: "Exit" }>["exit"]) =>
      Match.value(exit).pipe(
        Match.tag("Success", () => "success" as const),
        Match.tag("Failure", (failure) =>
          failure.cause.some((cause) => cause._tag === "Interrupt")
            ? ("interrupted" as const)
            : ("failure" as const),
        ),
        Match.exhaustive,
      );
    const transport = yield* RpcServer.Protocol.make(
      Effect.fnUntraced(function* (write) {
        yield* Queue.take(inbox).pipe(
          Effect.flatMap(([id, request]) => (clients.has(id) ? write(id, request) : Effect.void)),
          Effect.forever,
          Effect.forkScoped,
        );
        return {
          disconnects,
          send: (id, response) =>
            Effect.gen(function* () {
              const client = clients.get(id);
              if (!client) return;
              // A request this owner no longer tracks was already answered: a stream value over
              // the envelope, whose handler was then interrupted, still ends with an Exit.
              if (
                (response._tag === "Exit" || response._tag === "Chunk") &&
                !client.requests.has(String(response.requestId))
              )
                return;
              // The one message a handler's own answer refuses to send in place of: over the
              // envelope, typed exactly as a lost connection would answer the same request,
              // because from here the two are indistinguishable — the handler ran, and its
              // answer did not arrive.
              const overLimit = (requestId: string | number) =>
                client.send(
                  encode(
                    failExit(
                      requestId,
                      "Unknown",
                      "The host's answer exceeded the message envelope; whether it was handled is unknown",
                      "transport/answer-over-limit",
                    ),
                    encoding,
                  ),
                );
              // A unary operation declaring `Binary.bulkAnswer` gets its own encode threshold —
              // its declared bound, not the ordinary envelope — and, only when the encoded Exit
              // does not fit one envelope, leaves as acknowledged `AnswerPart` frames instead of
              // one message. An answer that happens to fit anyway is sent whole, exactly like an
              // ordinary call, so declaring the bound costs nothing on a small answer.
              const tag =
                response._tag === "Exit"
                  ? client.requests.get(String(response.requestId))
                  : undefined;
              const answerBound = tag === undefined ? undefined : answerBounds.get(tag);
              if (answerBound !== undefined && response._tag === "Exit") {
                const key = String(response.requestId);
                // The caller interrupted this request: nothing it could still receive is wanted,
                // and its client no longer tracks the request to receive it.
                if (client.abandoned.delete(key)) {
                  endRequest(id, client, response.requestId, "interrupted");
                  return;
                }
                let wire: Wire;
                try {
                  wire = encode(response, encoding, answerBound.maxBytes);
                } catch (cause) {
                  if (!(cause instanceof SewedError) || cause.code !== "Limit") throw cause;
                  endRequest(id, client, response.requestId, "failure");
                  overLimit(response.requestId);
                  return;
                }
                if (typeof wire === "string")
                  throw new TypeError("A bulk-answer operation is not a Binary.protocol");
                if (wire.byteLength <= maxMessageBytes) {
                  endRequest(id, client, response.requestId, outcomeOf(response.exit));
                  client.send(wire);
                  return;
                }
                // The request stays open while its parts leave, so a disconnect in between
                // reports it disconnected, and its end is reported after the last part.
                yield* Effect.gen(function* () {
                  for (const frame of answerParts(response.requestId, wire, encoding)) {
                    if (frame.final) {
                      client.acknowledgments.delete(key);
                      endRequest(id, client, response.requestId, outcomeOf(response.exit));
                      client.send(frame.message);
                    } else {
                      const acknowledgment = Deferred.makeUnsafe<void>();
                      client.acknowledgments.set(key, acknowledgment);
                      if (!client.send(frame.message)) return;
                      yield* Deferred.await(acknowledgment);
                      // An Interrupt releases this wait too: the part just sent is the last.
                      if (client.abandoned.delete(key)) {
                        endRequest(id, client, response.requestId, "interrupted");
                        return;
                      }
                    }
                  }
                }).pipe(Effect.ensuring(Effect.sync(() => client.acknowledgments.delete(key))));
                return;
              }
              if (response._tag !== "Chunk") {
                let message: Wire;
                try {
                  message = encode(response, encoding);
                } catch (cause) {
                  if (!(cause instanceof SewedError) || cause.code !== "Limit") throw cause;
                  if (response._tag !== "Exit") throw cause;
                  // Effect's RpcServer would otherwise catch this throw as a defect and ship a
                  // Die, after the handler already ran. Substituting the typed refusal here, and
                  // letting this `send` return normally, keeps RpcServer from ever learning that
                  // its write "failed" — from its side, the answer simply went out.
                  endRequest(id, client, response.requestId, "failure");
                  overLimit(response.requestId);
                  return;
                }
                if (response._tag === "Exit")
                  endRequest(id, client, response.requestId, outcomeOf(response.exit));
                client.send(message);
                return;
              }
              const key = String(response.requestId);
              yield* Effect.gen(function* () {
                try {
                  for (const frame of encodeChunks(response, encoding)) {
                    if (frame.final) {
                      client.acknowledgments.delete(key);
                      if (client.send(frame.message))
                        transfers?.frame(identity(id, key), frame.message);
                    } else {
                      const acknowledgment = Deferred.makeUnsafe<void>();
                      client.acknowledgments.set(key, acknowledgment);
                      if (!client.send(frame.message)) return;
                      transfers?.frame(identity(id, key), frame.message);
                      yield* Deferred.await(acknowledgment);
                    }
                  }
                } catch (cause) {
                  if (!(cause instanceof SewedError) || cause.code !== "Limit") throw cause;
                  // A stream value too large to fit one envelope even alone: encodeChunks has
                  // nothing left to try, so the request ends here, typed, rather than dying the
                  // connection's own RpcServer loop. Earlier values already delivered stand.
                  endRequest(id, client, response.requestId, "failure");
                  overLimit(response.requestId);
                  // The handler is parked until this chunk is acknowledged, which it never will
                  // be. Interrupting it releases its finalizers and its concurrency permit; the
                  // Exit that interruption produces finds the request already answered.
                  if (
                    !Queue.offerUnsafe(inbox, [
                      id,
                      { _tag: "Interrupt", requestId: response.requestId },
                    ])
                  )
                    disconnect(id, "inbox-overflow");
                }
              }).pipe(Effect.ensuring(Effect.sync(() => client.acknowledgments.delete(key))));
            }),
          end: (id) =>
            Effect.sync(() => {
              disconnect(id);
            }),
          clientIds: Effect.sync(() => new Set(clients.keys())),
          initialMessage: Effect.succeed(Option.none()),
          supportsAck: true,
          supportsTransferables: false,
          supportsSpanPropagation: true,
          supportsNotifications: false,
          codecFor: encoding === "binary" ? BinaryWire.codecFor : RpcSerialization.json.codecFor,
        };
      }),
    );
    yield* RpcServer.make(protocol, {
      concurrency: 32,
      disableFatalDefects: true,
      spanAttributes: {
        "sewed.owner.id": ownerId,
        "sewed.runtime": placement.runtime,
        "sewed.runtime.id": placement.runtimeId,
        "sewed.thread.id": placement.threadId,
        ...("processId" in placement ? { "sewed.process.id": placement.processId } : {}),
      },
    }).pipe(
      Effect.provideService(RpcServer.Protocol, transport),
      Effect.provideContext(ownerServerContext),
      Effect.forkScoped,
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
        for (const id of clients.keys()) disconnect(id, "owner-scope-closed");
        if (Option.isNone(workerOwner))
          observer?.emit({ _tag: "OwnerClosed", ownerId, reason: "scope-closed" });
      }),
    );
    /**
     * Whether a declared operation's bulk field is one this owner refuses: absent, not bytes, or
     * past the bound the operation declared. An operation with no declaration has nothing to
     * check.
     *
     * Every request passes here, whether it arrived whole in one envelope or assembled from
     * parts, so the two paths admit exactly the same requests and a peer cannot reach past the
     * bound by taking the shorter one. No honest client can trip it: its own send refused the
     * same request before a byte left.
     */
    const refusesBulk = (tag: string, payload: unknown): boolean => {
      const bound = bounds.get(tag);
      if (bound === undefined) return false;
      const bytes = bulkField(payload, bound.field);
      return bytes === undefined || bytes.byteLength > bound.maxBytes;
    };
    /**
     * One part of a bulk request: the owner buffers it against the operation's declared bound and
     * decodes the whole request only when its final part arrives. Anything a well-formed client
     * cannot have sent — a part for an operation that declared no bound, a part past the bound, a
     * second assembly, a request that does not decode to the part's own identity, a request
     * carrying more than one envelope beside its field — closes the connection, the way an
     * invalid packet does. The assembled request is then the `Request` it decodes to, and
     * everything that follows treats it as one that arrived whole, its field included.
     *
     * The buffer the owner will hold is `maxBytes` for the field plus one envelope for the rest
     * of the request, which is the same allowance the client encoded against.
     */
    const assemble = (
      id: number,
      client: Client,
      part: RequestPart,
    ): FromClientEncoded | undefined => {
      const key = String(part.id);
      const bound = bounds.get(part.tag);
      const size = part.bytes.byteLength;
      if (
        bound === undefined ||
        client.requests.has(key) ||
        (client.assembly !== undefined &&
          (client.assembly.id !== key || client.assembly.tag !== part.tag)) ||
        // The allowance counts bytes, which says nothing about how many parts carry them: empty
        // parts pass a byte count forever, and each one the owner retains costs heap. The floor
        // on a non-final part is what bounds the count, so an assembly holds at most
        // `ceil((maxBytes + maxMessageBytes) / minPartBytes) + 1` parts. The final part is the
        // tail and may be any size from one byte up; no part may be empty.
        size === 0 ||
        (!part.final && size < minPartBytes) ||
        (client.assembly?.bytes ?? 0) + size > bound.maxBytes + maxMessageBytes
      ) {
        disconnect(id, "invalid-bulk-part");
        return undefined;
      }
      const assembly = client.assembly ?? { id: key, tag: part.tag, parts: [], bytes: 0 };
      assembly.parts.push(part.bytes);
      assembly.bytes += size;
      client.assembly = assembly;
      if (!part.final) {
        client.send(encode({ _tag: "PartAck", requestId: part.id }, encoding));
        return undefined;
      }
      client.assembly = undefined;
      const whole = decodeClient(
        concat(assembly.parts),
        encoding,
        bound.maxBytes + maxMessageBytes,
      );
      const bytes = whole._tag === "Request" ? bulkField(whole.payload, bound.field) : undefined;
      if (
        whole._tag !== "Request" ||
        String(whole.id) !== key ||
        whole.tag !== part.tag ||
        bytes === undefined ||
        // Only the declared field may be bulk: what an honest client sends beside it fits one
        // envelope, so a request that does not is one no honest client produced.
        assembly.bytes - bytes.byteLength > maxMessageBytes
      ) {
        disconnect(id, "invalid-bulk-request");
        return undefined;
      }
      return whole;
    };
    return {
      accept(connection: Connection) {
        if (closed || clients.size >= 128) {
          connection.close();
          return;
        }
        const id = nextId++;
        const client: Client = {
          connection,
          unsubscribe: () => {},
          requests: new Map<string, string>(),
          acknowledgments: new Map<string, Deferred.Deferred<void>>(),
          abandoned: new Set<string>(),
          assembly: undefined,
          send: (message: Wire): boolean => {
            // A write resumed after a disconnect finds the client gone and sends nothing.
            if (clients.get(id) !== client) return false;
            try {
              connection.send(message);
              return true;
            } catch {
              disconnect(id, "send-failed");
              return false;
            }
          },
        };
        clients.set(id, client);
        client.unsubscribe = connection.subscribe(
          (message) => {
            try {
              let request = decodeClient(message, encoding);
              if (request._tag === "Ack") {
                const acknowledgment = client.acknowledgments.get(String(request.requestId));
                if (acknowledgment !== undefined) {
                  Deferred.doneUnsafe(acknowledgment, Effect.void);
                  return;
                }
              }
              if (request._tag === "RequestPart") {
                const whole = assemble(id, client, request);
                if (whole === undefined) return;
                request = whole;
              }
              if (request._tag === "Interrupt") {
                const key = String(request.requestId);
                const tag = client.requests.get(key);
                // A bulk answer's caller gave up. Its wait for an acknowledgment is released
                // here, because RpcServer's own interruption reaches the handler, not the send
                // that parts its finished answer; a stream keeps RpcServer's interruption alone.
                if (tag !== undefined && answerBounds.has(tag)) {
                  client.abandoned.add(key);
                  const acknowledgment = client.acknowledgments.get(key);
                  if (acknowledgment !== undefined)
                    Deferred.doneUnsafe(acknowledgment, Effect.void);
                }
              }
              if (
                request._tag === "Interrupt" &&
                client.assembly?.id === String(request.requestId)
              ) {
                client.assembly = undefined;
                // The request is dropped where it stood and goes no further. Its parts were
                // still being assembled, so RpcServer has never seen this identity, and an
                // Interrupt for an identity it never started is work with no answer to give.
                return;
              }
              if (request._tag === "Request") {
                const key = String(request.id);
                if (refusesBulk(request.tag, request.payload)) {
                  disconnect(id, "invalid-bulk-request");
                  return;
                }
                if (
                  request.isNotification ||
                  client.requests.has(key) ||
                  client.requests.size >= maxRequestsPerConnection
                ) {
                  disconnect(id, "request-limit-or-duplicate");
                  return;
                }
                client.requests.set(key, request.tag);
                if (streamProcedures.has(request.tag)) transfers?.start(identity(id, key));
                observer?.emit({
                  _tag: "RequestStarted",
                  ownerId,
                  clientId: id,
                  requestId: key,
                  procedure: request.tag,
                  ...(request.traceId === undefined ? {} : { traceId: request.traceId }),
                  ...(request.spanId === undefined ? {} : { spanId: request.spanId }),
                });
              }
              if (!Queue.offerUnsafe(inbox, [id, request])) disconnect(id, "inbox-overflow");
            } catch {
              disconnect(id, "invalid-message");
            }
          },
          (reason) => {
            disconnect(id, reason.code);
          },
        );
      },
    };
  });

export const scopedConnection = (
  connect: () => Connection,
): Effect.Effect<Connection, SewedError, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.try({
      try: connect,
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Closed", message: "Could not connect to owner", cause }),
    }),
    (connection) => Effect.sync(connection.close),
  );
