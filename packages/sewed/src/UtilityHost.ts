import { fileURLToPath } from "node:url";
import { MessageChannelMain, utilityProcess } from "electron";
import { Deferred, Effect, Exit, Match, Schema, Scope } from "effect";
import type { Rpc } from "effect/unstable/rpc";
import { makeOwner, type Bound, type Complete, type Owner } from "./Binding.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import type { Entry } from "./Utility.ts";
import { sink } from "./internal/Diagnostics.ts";
import { serveConnections } from "./internal/BindingRelay.ts";
import { connectElectronPort, electronPort } from "./internal/ElectronPort.ts";
import { FromUtility, ToUtility } from "./internal/UtilityBindings.ts";
import type { Connection } from "./internal/Transport.ts";

export { entry } from "./Utility.ts";
export type { Definition, Entry } from "./Utility.ts";

export interface Handle<Rpcs extends Rpc.Any> extends Owner<Rpcs> {
  readonly processId: number;
  readonly shutdown: Effect.Effect<void, SewedError, MainContext>;
  readonly terminate: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitExit: Effect.Effect<number, never, MainContext>;
}

type OpenMessage = Extract<typeof FromUtility.Type, { readonly _tag: "Open" }>;
type CancelMessage = Extract<typeof FromUtility.Type, { readonly _tag: "Cancel" }>;
type UtilityProcess = ReturnType<typeof utilityProcess.fork>;

const bounded = (message: string) => message.slice(0, 256);

const startup = (message: string, cause?: unknown) =>
  new SewedError({ code: "Startup", message, ...(cause === undefined ? {} : { cause }) });

const closed = (message: string) => new SewedError({ code: "Closed", message });

const native = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

export const spawn = <
  Rpcs extends Rpc.Any,
  Keys extends string,
  const B extends readonly Bound<Keys>[] = [],
>(
  entry: Entry<Rpcs, Keys> & Complete<Keys, B>,
  options?: { readonly bindings: B },
): Effect.Effect<Handle<Rpcs>, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    if (entry.url.protocol !== "file:")
      return yield* Effect.fail(startup("Utility entries must use a file URL"));
    const scope = yield* Scope.fork(yield* Effect.scope);
    return yield* Effect.gen(function* () {
      const dependencyScope = yield* Scope.fork(scope);
      const bindings: Bound[] = [...(options?.bindings ?? [])];
      const open = yield* serveConnections(bindings).pipe(Scope.provide(dependencyScope));
      const id = yield* generateInstanceId();
      const diagnostics = yield* sink;
      let closeReason: "scope-closed" | "shutdown" | "terminated" | "exited" | "startup-failed" =
        "startup-failed";
      const exited = yield* Deferred.make<number>();
      const ready = yield* Deferred.make<number, SewedError>();
      let dead = false;
      let processId = 0;
      const pending = new Map<string, { readonly close: () => void; closed: boolean }>();
      let utility: UtilityProcess;

      const closePending = (requestId: string) => {
        const request = pending.get(requestId);
        if (!request) return false;
        request.close();
        return true;
      };
      const post = (
        message: typeof ToUtility.Type,
        transfer?: readonly Electron.MessagePortMain[],
      ) => {
        if (dead) return closed("Utility process has exited");
        try {
          if (transfer === undefined) utility.postMessage(message);
          else utility.postMessage(message, [...transfer]);
          return undefined;
        } catch (cause) {
          return native("Could not post utility control message", cause);
        }
      };
      const reject = (requestId: string, reason: SewedError) => {
        const error = post({
          _tag: "Rejected",
          requestId: bounded(requestId),
          code: reason.code,
          message: bounded(reason.message),
        });
        if (error) {
          Deferred.doneUnsafe(ready, Effect.fail(error));
          Effect.runFork(Scope.close(scope, Exit.void));
        }
      };
      const openDependency = (message: OpenMessage) => {
        if (dead) {
          reject(message.requestId, closed("Utility process has exited"));
          return;
        }
        if (pending.has(message.requestId)) {
          reject(
            message.requestId,
            new SewedError({ code: "Protocol", message: "Duplicate utility request" }),
          );
          return;
        }
        if (pending.size >= 128) {
          reject(
            message.requestId,
            new SewedError({ code: "Limit", message: "Binding connection limit reached" }),
          );
          return;
        }
        const channel = new MessageChannelMain();
        const source = electronPort(channel.port1);
        const request: { readonly close: () => void; closed: boolean } = {
          closed: false,
          close: () => {
            if (request.closed) return;
            request.closed = true;
            pending.delete(message.requestId);
            source.close();
          },
        };
        const connection: Connection = {
          send: source.send,
          subscribe: source.subscribe,
          close: () => {
            request.close();
          },
        };
        pending.set(message.requestId, request);
        const rejected = open(message.key, connection);
        if (rejected !== undefined || request.closed) {
          channel.port2.close();
          reject(
            message.requestId,
            rejected ?? closed("Binding connection closed before it was opened"),
          );
          return;
        }
        const error = post({ _tag: "Opened", requestId: message.requestId }, [channel.port2]);
        if (error) {
          connection.close();
          channel.port2.close();
          Deferred.doneUnsafe(ready, Effect.fail(error));
          Effect.runFork(Scope.close(scope, Exit.void));
        }
      };
      const receive = (value: unknown) => {
        try {
          const message = Schema.decodeUnknownSync(FromUtility)(value);
          Match.value(message).pipe(
            Match.tag("Ready", (message) => {
              if (
                message.processId <= 0 ||
                (utility.pid !== undefined && message.processId !== utility.pid)
              ) {
                throw new SewedError({
                  code: "Protocol",
                  message: "Utility Ready PID did not match the native process",
                });
              }
              processId = message.processId;
              closeReason = "exited";
              Deferred.doneUnsafe(ready, Effect.succeed(message.processId));
            }),
            Match.tag("Open", openDependency),
            Match.tag("Cancel", (message: CancelMessage) => {
              closePending(message.requestId);
            }),
            Match.tag("Diagnostics", (message) => {
              for (const event of message.events) diagnostics?.emit(event);
              if (message.dropped > 0)
                diagnostics?.emit({ _tag: "EventsDropped", ownerId: id, count: message.dropped });
              if (!dead) {
                const error = post({ _tag: "DiagnosticsAck" });
                if (error) Effect.runFork(Scope.close(scope, Exit.void));
              }
            }),
            Match.tag("Failed", (failure) => {
              Deferred.doneUnsafe(
                ready,
                Effect.fail(startup("Utility initialization failed", failure.message)),
              );
            }),
            Match.exhaustive,
          );
        } catch (cause) {
          Deferred.doneUnsafe(
            ready,
            Effect.fail(
              new SewedError({
                code: "Protocol",
                message: "Invalid utility control message",
                cause,
              }),
            ),
          );
          Effect.runFork(Scope.close(scope, Exit.void));
        }
      };
      const exitedBy = (code: number) => {
        dead = true;
        diagnostics?.emit({ _tag: "OwnerClosed", ownerId: id, reason: closeReason });
        Deferred.doneUnsafe(exited, Effect.succeed(code));
        Deferred.doneUnsafe(ready, Effect.fail(closed(`Utility exited with code ${code}`)));
        Effect.runFork(Scope.close(scope, Exit.void));
      };
      const processError = (type: unknown, location: unknown, report: unknown) => {
        const error = native("Utility process failed", { type, location, report });
        Deferred.doneUnsafe(ready, Effect.fail(error));
        if (!dead) Effect.runFork(Scope.close(scope, Exit.void));
      };
      const kill = (child: UtilityProcess) => {
        if (dead) return;
        const pid = child.pid;
        if (pid === undefined) return;
        try {
          if (!child.kill() && child.pid !== undefined)
            throw native("Utility process could not be terminated", { pid });
        } catch (cause) {
          throw cause instanceof SewedError
            ? cause
            : native("Utility process termination failed", cause);
        }
      };
      utility = yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            utilityProcess.fork(
              fileURLToPath(new URL("./internal/utility-entry.js", import.meta.url)),
              [],
              {
                stdio: "ignore",
                serviceName: "Sewed Utility",
              },
            ),
          catch: (cause) => startup("Could not start utility process", cause),
        }),
        (child) =>
          Effect.gen(function* () {
            utility = child;
            if (closeReason === "exited") closeReason = "scope-closed";
            if (!dead) {
              const error = post({ _tag: "Shutdown" });
              if (error) yield* Effect.sync(() => kill(child));
            }
            yield* Deferred.await(exited).pipe(
              Effect.timeoutOrElse({
                duration: "2 seconds",
                orElse: () =>
                  Effect.sync(() => kill(child)).pipe(
                    Effect.andThen(
                      Deferred.await(exited).pipe(
                        Effect.timeoutOrElse({
                          duration: "2 seconds",
                          orElse: () =>
                            Effect.die(
                              native("Utility process did not exit after termination", {
                                pid: child.pid,
                              }),
                            ),
                        }),
                      ),
                    ),
                  ),
              }),
            );
          }).pipe(
            Effect.asVoid,
            Effect.ensuring(
              Effect.sync(() => {
                child.off("message", receive);
                child.off("error", processError);
                if (dead) child.off("exit", exitedBy);
              }),
            ),
          ),
      );
      utility.on("message", receive);
      utility.on("error", processError);
      utility.once("exit", exitedBy);
      const initialization: typeof ToUtility.Type = {
        _tag: "Initialize",
        url: entry.url.href,
        ownerId: id,
        diagnostics: diagnostics !== undefined,
        tracing: diagnostics?.tracing ?? false,
        bindings: bindings.map(({ slot, ownerId }) => ({ key: slot.key, ownerId })),
      };
      const postError = post(initialization);
      if (postError) {
        Deferred.doneUnsafe(ready, Effect.fail(postError));
        return yield* Effect.fail(postError);
      }
      processId = yield* Deferred.await(ready).pipe(
        Effect.timeoutOrElse({
          duration: "10 seconds",
          orElse: () => Effect.fail(startup("Utility initialization timed out")),
        }),
      );
      const fields = {
        processId,
        shutdown: Effect.andThen(
          MainContext,
          Effect.suspend(() => {
            closeReason = "shutdown";
            if (dead) return Effect.void;
            const error = post({ _tag: "Shutdown" });
            return error === undefined ? Effect.void : Effect.fail(error);
          }),
        ),
        terminate: Effect.andThen(
          MainContext,
          Effect.suspend(() => {
            closeReason = "terminated";
            if (dead) return Effect.void;
            try {
              kill(utility);
              return Deferred.await(exited).pipe(
                Effect.timeoutOrElse({
                  duration: "2 seconds",
                  orElse: () =>
                    Effect.fail(
                      native("Utility process did not exit after termination", {
                        pid: utility.pid,
                      }),
                    ),
                }),
                Effect.asVoid,
              );
            } catch (cause) {
              return Effect.fail(
                cause instanceof SewedError
                  ? cause
                  : native("Could not terminate utility process", cause),
              );
            }
          }),
        ),
        awaitExit: Effect.andThen(MainContext, Deferred.await(exited)),
      };
      return makeOwner(
        id,
        entry.protocol,
        {
          connect: connectElectronPort(
            () => new MessageChannelMain(),
            (port) => {
              const error = post({ _tag: "Connect" }, [port]);
              if (error) throw error;
            },
          ),
        },
        fields,
      );
    }).pipe(
      Scope.provide(scope),
      Effect.onError(() => Scope.close(scope, Exit.void)),
    );
  });
