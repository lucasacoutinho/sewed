import { Context, Deferred, Effect, Match, Option, Queue, Scope } from "effect";
import { Rpc, RpcSchema, RpcSerialization, RpcServer } from "effect/unstable/rpc";
import type { RpcGroup } from "effect/unstable/rpc";
import type { FromClientEncoded } from "effect/unstable/rpc/RpcMessage";
import { SewedError } from "./SewedError.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { location, OwnerContext, sink } from "./internal/Diagnostics.ts";
import {
  decodeClient,
  encode,
  encodeChunks,
  maxPendingMessages,
  maxRequestsPerConnection,
  type Connection,
  type Wire,
} from "./internal/Transport.ts";
import { encodingOf } from "./internal/Encoding.ts";
import * as BinaryWire from "./internal/BinaryWire.ts";
import * as QueueDiagnostics from "./internal/QueueDiagnostics.ts";
import * as StreamDiagnostics from "./internal/StreamDiagnostics.ts";

export type HandlerServices<Rpcs extends Rpc.Any> =
  | Rpc.ToHandler<Rpcs>
  | Rpc.Middleware<Rpcs>
  | Rpc.ServicesServer<Rpcs>;

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
    const transfers = observer === undefined ? undefined : StreamDiagnostics.make(observer.emit);
    const identity = (clientId: number, requestId: string): StreamDiagnostics.Identity => ({
      ownerId,
      clientId,
      requestId,
      placement,
    });
    let nextId = 0;
    let closed = false;
    const clients = new Map<
      number,
      {
        connection: Connection;
        unsubscribe: () => void;
        requests: Set<string>;
        acknowledgments: Map<string, Deferred.Deferred<void>>;
      }
    >();
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
      for (const requestId of client.requests) {
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
      Queue.offerUnsafe(disconnects, id);
    };
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
              const send = (message: Wire): boolean => {
                try {
                  client.connection.send(message);
                  return true;
                } catch {
                  disconnect(id, "send-failed");
                  return false;
                }
              };
              if (response._tag !== "Chunk") {
                const message = encode(response, encoding);
                if (response._tag === "Exit") {
                  const requestId = String(response.requestId);
                  client.requests.delete(requestId);
                  transfers?.finish(identity(id, requestId));
                  const outcome = Match.value(response.exit).pipe(
                    Match.tag("Success", () => "success" as const),
                    Match.tag("Failure", (exit) =>
                      exit.cause.some((cause) => cause._tag === "Interrupt")
                        ? ("interrupted" as const)
                        : ("failure" as const),
                    ),
                    Match.exhaustive,
                  );
                  observer?.emit({
                    _tag: "RequestEnded",
                    ownerId,
                    clientId: id,
                    requestId,
                    outcome,
                    reason: "response",
                  });
                }
                send(message);
                return;
              }
              const key = String(response.requestId);
              yield* Effect.gen(function* () {
                for (const frame of encodeChunks(response, encoding)) {
                  if (frame.final) {
                    client.acknowledgments.delete(key);
                    if (send(frame.message)) transfers?.frame(identity(id, key), frame.message);
                  } else {
                    const acknowledgment = Deferred.makeUnsafe<void>();
                    client.acknowledgments.set(key, acknowledgment);
                    if (!send(frame.message)) return;
                    transfers?.frame(identity(id, key), frame.message);
                    yield* Deferred.await(acknowledgment);
                  }
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
    return {
      accept(connection: Connection) {
        if (closed || clients.size >= 128) {
          connection.close();
          return;
        }
        const id = nextId++;
        const client = {
          connection,
          unsubscribe: () => {},
          requests: new Set<string>(),
          acknowledgments: new Map<string, Deferred.Deferred<void>>(),
        };
        clients.set(id, client);
        client.unsubscribe = connection.subscribe(
          (message) => {
            try {
              const request = decodeClient(message, encoding);
              if (request._tag === "Ack") {
                const acknowledgment = client.acknowledgments.get(String(request.requestId));
                if (acknowledgment !== undefined) {
                  Deferred.doneUnsafe(acknowledgment, Effect.void);
                  return;
                }
              }
              if (request._tag === "Request") {
                const key = String(request.id);
                if (
                  request.isNotification ||
                  client.requests.has(key) ||
                  client.requests.size >= maxRequestsPerConnection
                ) {
                  disconnect(id, "request-limit-or-duplicate");
                  return;
                }
                client.requests.add(key);
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
