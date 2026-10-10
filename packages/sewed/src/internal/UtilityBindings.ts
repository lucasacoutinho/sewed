import { Context, Deferred, Effect, Exit, Schema } from "effect";
import { makeBound, type Bound } from "../Binding.ts";
import { Event } from "../Diagnostics.ts";
import { SewedError } from "../SewedError.ts";
import { electronPort, isElectronPort } from "./ElectronPort.ts";
import type { Connection } from "./Transport.ts";

const binding = Schema.Struct({ key: Schema.String, ownerId: Schema.String });
const boundedString = Schema.String.check(Schema.isMaxLength(256));
const requestId = boundedString;
const rejectionCode = Schema.Literals([
  "Closed",
  "Protocol",
  "Limit",
  "Startup",
  "Native",
  "Unknown",
]);

const dataFields = {
  url: Schema.String,
  ownerId: Schema.String,
  diagnostics: Schema.Boolean,
  tracing: Schema.Boolean,
  bindings: Schema.Array(binding),
};

export const UtilityData = Schema.Struct(dataFields);

export const FromUtility = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Ready"), processId: Schema.Int }),
  Schema.Struct({ _tag: Schema.Literal("Failed"), message: boundedString }),
  Schema.Struct({
    _tag: Schema.Literal("Diagnostics"),
    events: Schema.Array(Event).check(Schema.isMaxLength(64)),
    dropped: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  Schema.Struct({ _tag: Schema.Literal("Open"), key: Schema.String, requestId }),
  Schema.Struct({ _tag: Schema.Literal("Cancel"), requestId }),
]);

export const ToUtility = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Initialize"), ...dataFields }),
  Schema.Struct({ _tag: Schema.Literal("Shutdown") }),
  Schema.Struct({ _tag: Schema.Literal("DiagnosticsAck") }),
  Schema.Struct({ _tag: Schema.Literal("Connect") }),
  Schema.Struct({ _tag: Schema.Literal("Opened"), requestId }),
  Schema.Struct({
    _tag: Schema.Literal("Rejected"),
    requestId,
    code: rejectionCode,
    message: boundedString,
  }),
]);

export type UtilityDiagnosticsMessage = Extract<
  typeof FromUtility.Type,
  { readonly _tag: "Diagnostics" }
>;

export interface UtilityParent {
  readonly postMessage: (message: unknown) => void;
}

interface Pending {
  readonly deferred: Deferred.Deferred<Connection, SewedError>;
  completed: boolean;
  connection: Connection | undefined;
}

const isCloseable = (value: unknown): value is { readonly close: () => void } =>
  typeof value === "object" &&
  value !== null &&
  "close" in value &&
  typeof value.close === "function";

const closeTransferred = (ports: readonly unknown[]) => {
  for (const port of ports) {
    if (!isCloseable(port)) continue;
    try {
      port.close();
    } catch {
      // A transferred port may already be detached by the native channel.
    }
  }
};

const closedError = (message: string) => new SewedError({ code: "Closed", message });

export interface RemoteBindings {
  readonly bindings: readonly Bound[];
  readonly receive: (message: typeof ToUtility.Type, ports: readonly unknown[]) => void;
  readonly close: (reason?: SewedError) => void;
}

export const remoteBindings = (
  parent: UtilityParent,
  bindings: typeof UtilityData.Type.bindings,
): RemoteBindings => {
  const pending = new Map<string, Pending>();
  let nextRequestId = 0;
  let closed = false;
  const finish = (
    requestId: string,
    result: Effect.Effect<Connection, SewedError>,
    connection?: Connection,
  ) => {
    const request = pending.get(requestId);
    if (!request || request.completed) return false;
    request.completed = true;
    request.connection = connection;
    Deferred.doneUnsafe(request.deferred, result);
    return true;
  };
  const receive = (message: typeof ToUtility.Type, ports: readonly unknown[]) => {
    if (message._tag !== "Opened" && message._tag !== "Rejected") {
      closeTransferred(ports);
      return;
    }
    if (message._tag === "Rejected") {
      closeTransferred(ports);
      finish(
        message.requestId,
        Effect.fail(new SewedError({ code: message.code, message: message.message })),
      );
      return;
    }
    if (ports.length !== 1 || !isElectronPort(ports[0])) {
      closeTransferred(ports);
      finish(
        message.requestId,
        Effect.fail(
          new SewedError({
            code: "Protocol",
            message: "Utility Opened reply must transfer one port",
          }),
        ),
      );
      return;
    }
    const port = electronPort(ports[0]);
    if (!finish(message.requestId, Effect.succeed(port), port)) port.close();
  };
  const close = (reason = closedError("Utility process disconnected")) => {
    if (closed) return;
    closed = true;
    for (const request of pending.values()) {
      request.connection?.close();
      Deferred.doneUnsafe(request.deferred, Effect.fail(reason));
    }
    pending.clear();
  };
  const makeConnection = (key: string, ownerId: string) =>
    makeBound(Context.Service(key), ownerId, {
      connect: Effect.acquireRelease(
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            if (closed) return yield* Effect.fail(closedError("Utility process is closed"));
            if (pending.size >= 128)
              return yield* Effect.fail(
                new SewedError({ code: "Limit", message: "Utility binding request limit reached" }),
              );
            const requestId = String(nextRequestId++);
            const request = yield* Deferred.make<Connection, SewedError>();
            pending.set(requestId, { deferred: request, completed: false, connection: undefined });
            try {
              parent.postMessage({
                _tag: "Open",
                key,
                requestId,
              } satisfies typeof FromUtility.Type);
            } catch (cause) {
              pending.delete(requestId);
              return yield* Effect.fail(
                new SewedError({
                  code: "Closed",
                  message: "Could not request a utility binding",
                  cause,
                }),
              );
            }
            return yield* restore(Deferred.await(request)).pipe(
              Effect.onExit((exit) =>
                Effect.sync(() => {
                  const current = pending.get(requestId);
                  if (!current) return;
                  pending.delete(requestId);
                  if (Exit.isFailure(exit)) {
                    current.connection?.close();
                    if (!current.completed) {
                      try {
                        parent.postMessage({
                          _tag: "Cancel",
                          requestId,
                        } satisfies typeof FromUtility.Type);
                      } catch {
                        // The parent is already gone; the scoped connection still closes locally.
                      }
                    }
                  }
                }),
              ),
            );
          }),
        ),
        (connection) => Effect.sync(connection.close),
        { interruptible: true },
      ),
    });
  return {
    bindings: bindings.map(({ key, ownerId }) => makeConnection(key, ownerId)),
    receive,
    close,
  };
};
