import { Context, Deferred, Effect, Option, Queue, Scope } from "effect";
import { Rpc, RpcSchema, RpcSerialization, RpcServer } from "effect/rpc";
import type { RpcGroup } from "effect/rpc";
import { SewedError } from "./SewedError.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { location, OwnerContext, sink } from "./internal/Diagnostics.ts";
import {
  maxPendingMessages,
  ownerReceiver,
  type Connection,
  Undecodable,
  type Wire,
} from "./internal/Transport.ts";
import { answerBoundsOf, boundsOf } from "./internal/Bulk.ts";
import { encodingOf } from "./internal/Encoding.ts";
import * as BinaryWire from "./internal/BinaryWire.ts";
import {
  dropAssembly,
  type Client,
  type Incoming,
  type RequestId,
} from "./internal/OwnerClient.ts";
import * as OwnerReceive from "./internal/OwnerReceive.ts";
import * as OwnerSend from "./internal/OwnerSend.ts";
import * as QueueDiagnostics from "./internal/QueueDiagnostics.ts";
import * as StreamDiagnostics from "./internal/StreamDiagnostics.ts";
import * as PendingBytes from "./internal/PendingBytes.ts";
import { isBytes } from "./internal/Bytes.ts";

export type HandlerServices<Rpcs extends Rpc.Any> =
  | Rpc.ToHandler<Rpcs>
  | Rpc.Middleware<Rpcs>
  | Rpc.ServicesServer<Rpcs>;

export const server = <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: { readonly ownerId?: string; readonly maxPendingBytes?: number } = {},
) =>
  Effect.gen(function* () {
    const pendingBytes = yield* Effect.sync(() => PendingBytes.make(options.maxPendingBytes));
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
    const identity = (clientId: number, requestId: RequestId): StreamDiagnostics.Identity => ({
      ownerId,
      clientId,
      requestId: String(requestId),
      placement,
    });
    let nextId = 0;
    let closed = false;
    const clients = new Map<number, Client>();
    const inbox = yield* Queue.bounded<Incoming>(maxPendingMessages);
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
      dropAssembly(client);
      for (const [requestId, request] of client.requests) {
        const stage = request.stage;
        request.stage = "ended";
        request.reservation.release();
        if (typeof stage !== "string") stage.interruptUnsafe();
        transfers?.finish(identity(id, requestId));
        observer?.emit({
          _tag: "RequestEnded",
          ownerId,
          clientId: id,
          requestId: String(requestId),
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
      requestId: RequestId,
      outcome: "success" | "failure" | "interrupted",
    ) => {
      const request = client.requests.get(requestId);
      if (clients.get(clientId) !== client || request === undefined) return;
      client.requests.delete(requestId);
      request.stage = "ended";
      request.reservation.release();
      transfers?.finish(identity(clientId, requestId));
      observer?.emit({
        _tag: "RequestEnded",
        ownerId,
        clientId,
        requestId: String(requestId),
        outcome,
        reason: "response",
      });
    };
    const offer = (incoming: Incoming) => Queue.offerUnsafe(inbox, incoming);
    const send = OwnerSend.make({
      clients,
      encoding,
      answerBounds,
      offer,
      disconnect,
      endRequest,
      onFrame: (clientId, requestId, frame) =>
        transfers?.frame(identity(clientId, requestId), frame),
    });
    const { receive, refuseUndecodable } = OwnerReceive.make({
      encoding,
      bounds,
      answerBounds,
      pendingBytes,
      offer,
      disconnect,
      endRequest,
      onStarted: (clientId, request) => {
        if (streamProcedures.has(request.tag)) transfers?.start(identity(clientId, request.id));
        observer?.emit({
          _tag: "RequestStarted",
          ownerId,
          clientId,
          requestId: String(request.id),
          procedure: request.tag,
          ...(request.traceId === undefined ? {} : { traceId: request.traceId }),
          ...(request.spanId === undefined ? {} : { spanId: request.spanId }),
        });
      },
    });
    const transport = RpcServer.Protocol.of({
      run: (write) =>
        Queue.take(inbox).pipe(
          Effect.flatMap((incoming) =>
            Effect.gen(function* () {
              const { clientId, message } = incoming;
              if (incoming._tag === "Control") {
                if (clients.has(clientId)) yield* write(clientId, message);
                return;
              }
              const { open } = incoming;
              // The writer decodes before registering an RPC handler. Track that lifetime
              // separately while the inbox remains available for controls and other requests.
              const fiber = yield* Effect.suspend(() =>
                open.stage === "ended" ? Effect.void : write(clientId, message),
              ).pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    if (open.stage !== "ended") open.stage = "handling";
                  }),
                ),
                Effect.forkScoped,
              );
              if (open.stage === "queued") open.stage = fiber;
            }),
          ),
          Effect.forever,
          Effect.scoped,
        ),
      disconnects,
      send,
      end: (id) =>
        Effect.sync(() => {
          disconnect(id);
        }),
      clientIds: Effect.sync(() => new Set(clients.keys())),
      initialMessage: Effect.succeedNone,
      supportsAck: true,
      supportsTransferables: false,
      supportsSpanPropagation: true,
      supportsNotifications: false,
      codecFor: encoding === "binary" ? BinaryWire.codecFor : RpcSerialization.json.codecFor,
    });
    yield* RpcServer.make(protocol, {
      spanPrefix: "RpcServer",
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
          requests: new Map(),
          acknowledgments: new Map(),
          abandoned: new Set(),
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
          ownerReceiver((message) => {
            if (clients.get(id) !== client) return;
            try {
              if (typeof message !== "string" && !isBytes(message))
                disconnect(id, "invalid-message");
              else receive(id, client, message);
            } catch (error) {
              // A whole request that parsed and names an identity not already open here fails
              // alone. A packet that did not parse, is not a request, or names a request already
              // running cannot be answered without confusing that request.
              const requestId = error instanceof Undecodable ? error.requestId : undefined;
              if (requestId === undefined || client.requests.has(requestId))
                disconnect(id, "invalid-message");
              else refuseUndecodable(id, client, requestId);
            }
          }),
          (reason) => {
            disconnect(id, reason.code);
          },
        );
        if (clients.get(id) !== client) client.unsubscribe();
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
