import { Worker as NodeWorker } from "node:worker_threads";
import { Deferred, Effect, Exit, Match, Schema, Scope } from "effect";
import type { Rpc } from "effect/rpc";
import { makeOwner, type Bound, type Complete, type Owner } from "./Binding.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import type { Entry } from "./Worker.ts";
import { connectPort } from "./internal/NodePort.ts";
import { sink } from "./internal/Diagnostics.ts";
import {
  FromWorker,
  serveBindings,
  type ToWorker,
  type WorkerData,
} from "./internal/WorkerBindings.ts";

export { entry } from "./Worker.ts";
export type { Definition, Entry } from "./Worker.ts";

export interface Handle<Rpcs extends Rpc.Any> extends Owner<Rpcs> {
  readonly shutdown: Effect.Effect<void, never, MainContext>;
  readonly terminate: Effect.Effect<void, never, MainContext>;
  readonly awaitExit: Effect.Effect<number, never, MainContext>;
}

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
    const scope = yield* Scope.fork(yield* Effect.scope);
    return yield* Effect.gen(function* () {
      const dependencyScope = yield* Scope.fork(scope);
      const bindings: Bound[] = [...(options?.bindings ?? [])];
      const open = yield* serveBindings(bindings).pipe(Scope.provide(dependencyScope));
      const id = yield* generateInstanceId();
      const diagnostics = yield* sink;
      let closeReason: "scope-closed" | "shutdown" | "terminated" | "exited" | "startup-failed" =
        "startup-failed";
      const exited = yield* Deferred.make<number>();
      const ready = yield* Deferred.make<void, SewedError>();
      let dead = false;
      const worker = yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            new NodeWorker(new URL("./internal/worker-entry.js", import.meta.url), {
              workerData: {
                url: entry.url.href,
                ownerId: id,
                diagnostics: diagnostics !== undefined,
                tracing: diagnostics?.tracing ?? false,
                bindings: bindings.map(({ slot, ownerId }) => ({ key: slot.key, ownerId })),
              } satisfies typeof WorkerData.Type,
            }),
          catch: (cause) =>
            new SewedError({ code: "Startup", message: "Could not start worker", cause }),
        }),
        (worker) =>
          Effect.sync(() => {
            if (closeReason === "exited") closeReason = "scope-closed";
            if (!dead) worker.postMessage({ _tag: "Shutdown" } satisfies typeof ToWorker.Type);
          }).pipe(
            Effect.andThen(Deferred.await(exited)),
            Effect.timeoutOrElse({
              duration: "2 seconds",
              orElse: () => Effect.promise(() => worker.terminate()),
            }),
            Effect.asVoid,
            Effect.ensuring(
              Effect.sync(() => {
                worker.off("message", receive);
              }),
            ),
          ),
      );
      worker.on("error", (cause) => {
        Deferred.doneUnsafe(
          ready,
          Effect.fail(new SewedError({ code: "Startup", message: "Worker failed", cause })),
        );
      });
      worker.once("exit", (code) => {
        dead = true;
        diagnostics?.emit({ _tag: "OwnerClosed", ownerId: id, reason: closeReason });
        Deferred.doneUnsafe(exited, Effect.succeed(code));
        Deferred.doneUnsafe(
          ready,
          Effect.fail(
            new SewedError({ code: "Closed", message: `Worker exited with code ${code}` }),
          ),
        );
        Effect.runFork(Scope.close(scope, Exit.void));
      });
      function receive(value: unknown) {
        try {
          const message = Schema.decodeUnknownSync(FromWorker)(value);
          Match.value(message).pipe(
            Match.tag("Ready", () => {
              closeReason = "exited";
              Deferred.doneUnsafe(ready, Effect.void);
            }),
            Match.tag("Open", open),
            Match.tag("Diagnostics", (message) => {
              for (const event of message.events) diagnostics?.emit(event);
              if (message.dropped > 0)
                diagnostics?.emit({ _tag: "EventsDropped", ownerId: id, count: message.dropped });
              if (!dead)
                worker.postMessage({ _tag: "DiagnosticsAck" } satisfies typeof ToWorker.Type);
            }),
            Match.tag("Failed", (failure) => {
              Deferred.doneUnsafe(
                ready,
                Effect.fail(
                  new SewedError({
                    code: "Startup",
                    message: "Worker initialization failed",
                    cause: failure.message,
                  }),
                ),
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
                message: "Invalid worker control message",
                cause,
              }),
            ),
          );
          Effect.runFork(Scope.close(scope, Exit.void));
        }
      }
      worker.on("message", receive);
      yield* Deferred.await(ready).pipe(
        Effect.timeoutOrElse({
          duration: "10 seconds",
          orElse: () =>
            Effect.fail(
              new SewedError({ code: "Startup", message: "Worker initialization timed out" }),
            ),
        }),
      );
      const fields = {
        shutdown: Effect.andThen(
          MainContext,
          Effect.sync(() => {
            closeReason = "shutdown";
            if (!dead) worker.postMessage({ _tag: "Shutdown" } satisfies typeof ToWorker.Type);
          }),
        ),
        terminate: Effect.andThen(
          MainContext,
          Effect.suspend(() => {
            closeReason = "terminated";
            return Effect.promise(() => worker.terminate());
          }),
        ).pipe(Effect.asVoid),
        awaitExit: Effect.andThen(MainContext, Deferred.await(exited)),
      };
      return makeOwner(
        id,
        entry.protocol,
        {
          connect: connectPort((port) => {
            if (dead) throw new SewedError({ code: "Closed", message: "Worker owner has exited" });
            worker.postMessage({ _tag: "Connect", port } satisfies typeof ToWorker.Type, [port]);
          }),
        },
        fields,
      );
    }).pipe(
      Scope.provide(scope),
      Effect.onError(() => Scope.close(scope, Exit.void)),
    );
  });
