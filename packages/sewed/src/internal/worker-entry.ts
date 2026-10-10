import { parentPort, threadId, workerData } from "node:worker_threads";
import { Cause, Deferred, Effect, Match, Schema } from "effect";
import { WorkerContext, workerIdentity } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { start } from "../Worker.ts";
import { nodePort } from "./NodePort.ts";
import { OwnerContext, Sink } from "./Diagnostics.ts";
import * as Tracing from "./Tracing.ts";
import {
  forwardDiagnostics,
  FromWorker,
  remoteBindings,
  ToWorker,
  WorkerData,
} from "./WorkerBindings.ts";

const port = parentPort;
if (!port) throw new Error("Invalid Sewed worker bootstrap");

Effect.runFork(
  Effect.scoped(
    Effect.gen(function* () {
      const data = yield* Schema.decodeUnknownEffect(WorkerData)(workerData);
      const diagnostics = forwardDiagnostics(port);
      const shutdown = yield* Deferred.make<void, SewedError>();
      let state:
        | { readonly status: "starting" }
        | { readonly status: "running"; readonly host: Effect.Success<ReturnType<typeof start>> } =
        { status: "starting" };
      const closed = () => {
        Deferred.doneUnsafe(shutdown, Effect.void);
      };
      const receive = (value: unknown) => {
        try {
          const message = Schema.decodeUnknownSync(ToWorker)(value);
          Match.value(message).pipe(
            Match.tag("Shutdown", closed),
            Match.tag("DiagnosticsAck", () => diagnostics.acknowledge()),
            Match.tag("Connect", (message) => {
              if (state.status === "running") state.host.accept(nodePort(message.port));
              else message.port.close();
            }),
            Match.exhaustive,
          );
        } catch (cause) {
          Deferred.doneUnsafe(
            shutdown,
            Effect.fail(
              new SewedError({
                code: "Protocol",
                message: "Invalid main control message",
                cause,
              }),
            ),
          );
        }
      };
      port.on("message", receive);
      port.once("close", closed);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          port.off("message", receive);
          port.off("close", closed);
          diagnostics.close();
        }),
      );
      const run = Effect.gen(function* () {
        const module: { default?: unknown } = yield* Effect.tryPromise(() => import(data.url));
        const host = yield* start(module.default, remoteBindings(port, data.bindings));
        state = { status: "running", host };
        port.postMessage({ _tag: "Ready" } satisfies typeof FromWorker.Type);
        return yield* Effect.never;
      }).pipe(
        Effect.raceFirst(Deferred.await(shutdown)),
        Tracing.instrument,
        Effect.provideService(OwnerContext, { id: data.ownerId }),
      );
      yield* data.diagnostics
        ? run.pipe(Effect.provideService(Sink, { ...diagnostics, tracing: data.tracing }))
        : run;
    }),
  ).pipe(
    Effect.provideService(WorkerContext, workerIdentity(threadId)),
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        port.postMessage({
          _tag: "Failed",
          message: Cause.pretty(cause),
        } satisfies typeof FromWorker.Type);
        process.exitCode = 1;
      }),
    ),
    Effect.ensuring(
      Effect.sync(() => {
        port.close();
      }),
    ),
  ),
);
