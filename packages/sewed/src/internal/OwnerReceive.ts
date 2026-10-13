import { Deferred, Effect } from "effect";
import type { FromClientEncoded } from "effect/rpc/RpcMessage";
import type { AnswerBound, Bound } from "./Bulk.ts";
import type { Encoding } from "./Encoding.ts";
import {
  dropAssembly,
  type Client,
  type Incoming,
  type OpenRequest,
  type RequestId,
  type RequestMessage,
} from "./OwnerClient.ts";
import type * as PendingBytes from "./PendingBytes.ts";
import {
  aliasOf,
  bulkField,
  concat,
  decodeClient,
  encode,
  failExit,
  maxMessageBytes,
  maxRequestsPerConnection,
  minPartBytes,
  sizeOf,
  type RequestPart,
  type Wire,
} from "./Transport.ts";

/** What the receive path needs of the owner it belongs to. */
export interface Owner {
  readonly encoding: Encoding;
  readonly bounds: ReadonlyMap<string, Bound>;
  readonly answerBounds: ReadonlyMap<string, AnswerBound>;
  readonly pendingBytes: {
    readonly reserve: (bytes: number) => PendingBytes.Reservation | undefined;
  };
  /** Queues a message for RpcServer; false when the inbox is full. */
  readonly offer: (incoming: Incoming) => boolean;
  readonly disconnect: (clientId: number, reason: string) => void;
  readonly endRequest: (
    clientId: number,
    client: Client,
    requestId: RequestId,
    outcome: "success" | "failure" | "interrupted",
  ) => void;
  /** Called once a request is admitted, before it is queued. */
  readonly onStarted: ((clientId: number, request: RequestMessage) => void) | undefined;
}

/**
 * What an owner does with each message a connection delivers: admit a request against its limits
 * and byte budget, assemble a bulk request from its parts, answer an interruption for a request
 * that has not reached its handler, and refuse what no honest client sends.
 */
export const make = (owner: Owner) => {
  const { encoding, bounds, answerBounds, pendingBytes, disconnect, endRequest } = owner;
  /**
   * Whether a declared operation's bulk field is one this owner refuses: absent, not bytes, or
   * past the bound the operation declared. An operation with no declaration has nothing to
   * check.
   *
   * Whole-envelope requests and completed assemblies of protocols with bulk declarations
   * both pass here, so a peer cannot reach past a field's bound by taking the shorter path.
   * No honest client can trip it: its own send refused the same request before a byte left.
   */
  const refusesBulk =
    bounds.size === 0
      ? undefined
      : (tag: string, payload: unknown): boolean => {
          const bound = bounds.get(tag);
          if (bound === undefined) return false;
          const bytes = bulkField(payload, bound.field);
          return bytes === undefined || bytes.byteLength > bound.maxBytes;
        };
  /**
   * Answers a request this owner could not decode: `Protocol`, `transport/undecodable-request`,
   * typed through the operation's error channel, in place of disconnecting every other request
   * on the connection. The handler never ran — RpcServer never saw the request — so the answer
   * says so, and an assembly the request was building is dropped with it.
   */
  const refuseUndecodable = (id: number, client: Client, requestId: RequestId) => {
    if (client.assembly?.id === requestId) dropAssembly(client);
    let refusal: Wire;
    try {
      refusal = encode(
        failExit(
          requestId,
          "Protocol",
          "The request could not be decoded; its handler did not run",
          "transport/undecodable-request",
        ),
        encoding,
      );
    } catch {
      // The refusal carries the peer's own request id, so a peer can make it too large for one
      // message. A request that cannot be answered cannot be attributed: end the connection,
      // as an unattributable packet does, and never let the throw leave this handler.
      disconnect(id, "invalid-message");
      return;
    }
    client.send(refusal);
  };
  const refusePending = (client: Client, requestId: RequestId) => {
    if (client.assembly?.id === requestId) dropAssembly(client);
    client.send(
      encode(
        failExit(
          requestId,
          "Limit",
          "The owner's pending byte budget is exhausted; its handler did not run",
          "transport/pending-bytes-limit",
        ),
        encoding,
      ),
    );
  };
  const forward = (id: number, incoming: Incoming) => {
    if (!owner.offer(incoming)) disconnect(id, "inbox-overflow");
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
   * of the request, which is the same allowance the client encoded against. The reservation
   * that covers it leaves with the assembled request.
   */
  const assemble = (
    id: number,
    client: Client,
    part: RequestPart,
  ):
    | { readonly request: RequestMessage; readonly reservation: PendingBytes.Reservation }
    | undefined => {
    const bound = bounds.get(part.tag);
    const size = part.bytes.byteLength;
    const building = client.assembly;
    if (
      bound === undefined ||
      client.requests.has(part.id) ||
      (building !== undefined && (building.id !== part.id || building.tag !== part.tag)) ||
      // The allowance counts bytes, which says nothing about how many parts carry them: empty
      // parts pass a byte count forever, and each one the owner retains costs heap. The floor
      // on a non-final part is what bounds the count, so an assembly holds at most
      // `ceil((maxBytes + maxMessageBytes) / minPartBytes) + 1` parts. The final part is the
      // tail and may be any size from one byte up; no part may be empty.
      size === 0 ||
      (!part.final && size < minPartBytes) ||
      (building?.bytes ?? 0) + size > bound.maxBytes + maxMessageBytes
    ) {
      disconnect(id, "invalid-bulk-part");
      return undefined;
    }
    const reservation =
      building === undefined ? pendingBytes.reserve(size) : building.reservation.grow(size);
    if (reservation === undefined) {
      refusePending(client, part.id);
      return undefined;
    }
    const assembly = building ?? { id: part.id, tag: part.tag, parts: [], reservation, bytes: 0 };
    assembly.parts.push(part.bytes);
    assembly.bytes += size;
    client.assembly = assembly;
    if (!part.final) {
      client.send(encode({ _tag: "PartAck", requestId: part.id }, encoding));
      return undefined;
    }
    // The joined packet is the one copy decoded; its parts are released before the decode
    // allocates, so the two are not both held through it.
    const joined = concat(assembly.parts.splice(0));
    let whole: FromClientEncoded | RequestPart;
    try {
      whole = decodeClient(joined, encoding, bound.maxBytes + maxMessageBytes);
    } catch {
      // Every part named this request, so a whole that does not decode is its failure alone,
      // whatever the packet itself claims to be.
      refuseUndecodable(id, client, part.id);
      return undefined;
    }
    const bytes = whole._tag === "Request" ? bulkField(whole.payload, bound.field) : undefined;
    if (
      whole._tag !== "Request" ||
      whole.id !== part.id ||
      whole.tag !== part.tag ||
      bytes === undefined ||
      // Only the declared field may be bulk: what an honest client sends beside it fits one
      // envelope, so a request that does not is one no honest client produced.
      assembly.bytes - bytes.byteLength > maxMessageBytes
    ) {
      disconnect(id, "invalid-bulk-request");
      return undefined;
    }
    client.assembly = undefined;
    return { request: whole, reservation };
  };
  /**
   * Admits one request, whole or assembled, and queues it for RpcServer. It arrives with the
   * reservation for its bytes, or with none when the budget could not hold them.
   */
  const onRequest = (
    id: number,
    client: Client,
    request: RequestMessage,
    reservation: PendingBytes.Reservation | undefined,
  ) => {
    const refusal = refusesBulk?.(request.tag, request.payload)
      ? "invalid-bulk-request"
      : request.isNotification ||
          client.requests.has(request.id) ||
          client.assembly?.id === request.id ||
          client.requests.size >= maxRequestsPerConnection
        ? "request-limit-or-duplicate"
        : undefined;
    if (refusal !== undefined) {
      reservation?.release();
      disconnect(id, refusal);
      return;
    }
    if (reservation === undefined) {
      refusePending(client, request.id);
      return;
    }
    const open: OpenRequest = { tag: request.tag, reservation, stage: "queued" };
    client.requests.set(request.id, open);
    owner.onStarted?.(id, request);
    forward(id, { _tag: "Request", clientId: id, message: request, open });
  };
  const onInterrupt = (
    id: number,
    client: Client,
    message: Extract<FromClientEncoded, { _tag: "Interrupt" }>,
  ) => {
    const requestId = message.requestId;
    if (client.assembly?.id === requestId) {
      // The request is dropped where it stood and goes no further. Its parts were still being
      // assembled, so RpcServer has never seen this identity, and an Interrupt for an identity
      // it never started is work with no answer to give.
      dropAssembly(client);
      return;
    }
    const open = client.requests.get(requestId);
    if (open !== undefined && open.stage !== "handling") {
      const stage = open.stage;
      endRequest(id, client, requestId, "interrupted");
      if (typeof stage !== "string") stage.interruptUnsafe();
      // RPC has no response codec registered yet, so answer this interruption here.
      client.send(
        encode(
          {
            _tag: "Exit",
            requestId,
            exit: { _tag: "Failure", cause: [{ _tag: "Interrupt", fiberId: null }] },
          },
          encoding,
        ),
      );
    } else if (open !== undefined && answerBounds.has(open.tag)) {
      // A bulk answer's caller gave up. Its wait for an acknowledgment is released here,
      // because RpcServer's own interruption reaches the handler, not the send that parts its
      // finished answer; a stream keeps RpcServer's interruption alone.
      client.abandoned.add(requestId);
      const acknowledgment = client.acknowledgments.get(requestId);
      if (acknowledgment !== undefined) Deferred.doneUnsafe(acknowledgment, Effect.void);
    }
    // Forwarded in every case: a writer that finished decoding hands the request to RpcServer
    // before this owner sees its stage change, and only RpcServer can interrupt that handler.
    forward(id, { _tag: "Control", clientId: id, message });
  };
  const receive = (id: number, client: Client, wire: Wire) => {
    const message = decodeClient(wire, encoding);
    // A well-formed client names a request one way. Naming an open one by its other wire type
    // is something no honest client sends, so it ends the connection as an invalid packet does.
    const named =
      "id" in message ? message.id : "requestId" in message ? message.requestId : undefined;
    const alias = named === undefined ? undefined : aliasOf(named);
    if (alias !== undefined && (client.requests.has(alias) || client.assembly?.id === alias)) {
      disconnect(id, "invalid-request-identity");
      return;
    }
    switch (message._tag) {
      case "Request":
        onRequest(id, client, message, pendingBytes.reserve(sizeOf(wire)));
        return;
      case "RequestPart": {
        const assembled = assemble(id, client, message);
        if (assembled !== undefined)
          onRequest(id, client, assembled.request, assembled.reservation);
        return;
      }
      case "Interrupt":
        onInterrupt(id, client, message);
        return;
      case "Ack": {
        const acknowledgment = client.acknowledgments.get(message.requestId);
        if (acknowledgment !== undefined) Deferred.doneUnsafe(acknowledgment, Effect.void);
        else forward(id, { _tag: "Control", clientId: id, message });
        return;
      }
      default:
        forward(id, { _tag: "Control", clientId: id, message });
    }
  };
  return { receive, refuseUndecodable };
};
