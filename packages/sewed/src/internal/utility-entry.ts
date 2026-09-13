import { Cause, Deferred, Effect, Match, Schema } from "effect";
import { UtilityContext, utilityIdentity } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { start } from "../Utility.ts";
import { OwnerContext, Sink } from "./Diagnostics.ts";
import * as Tracing from "./Tracing.ts";
import { forwardDiagnostics, type DiagnosticsControlMessage } from "./WorkerBindings.ts";
import {
  FromUtility,
  remoteBindings,
  ToUtility,
  UtilityData,
  type RemoteBindings,
} from "./UtilityBindings.ts";
import { electronPort, isElectronPort } from "./ElectronPort.ts";

const parent = process.parentPort;
if (!parent) throw new Error("Invalid Sewed utility bootstrap");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const eventData = (value: unknown): unknown => (isRecord(value) ? value.data : undefined);

const eventPorts = (value: unknown): readonly unknown[] => {
  if (!isRecord(value) || !Array.isArray(value.ports)) return [];
  return value.ports;
};

const isCloseable = (value: unknown): value is { readonly close: () => void } =>
  typeof value === "object" &&
  value !== null &&
  "close" in value &&
  typeof value.close === "function";

const closePorts = (ports: readonly unknown[]) => {
  for (const port of ports) {
    if (!isCloseable(port)) continue;
    try {
      port.close();
    } catch {
      // A rejected transfer may already be detached by the native channel.
    }
  }
};

const bounded = (message: string) => message.slice(0, 256);
const closedError = (message: string) => new SewedError({ code: "Closed", message });

Effect.runFork(
  Effect.scoped(
    Effect.gen(function* () {
      const diagnostics = forwardDiagnostics({
        postMessage: (message: DiagnosticsControlMessage) => parent.postMessage(message),
      });
      const initialization = yield* Deferred.make<typeof UtilityData.Type, SewedError>();
      const shutdown = yield* Deferred.make<void, SewedError>();
      let initialized = false;
      let shutdownRequested = false;
      let remote: RemoteBindings | undefined;
      let state:
        | { readonly status: "starting" }
        | { readonly status: "running"; readonly host: Effect.Success<ReturnType<typeof start>> } =
        { status: "starting" };

      const fail = (error: SewedError) => {
        Deferred.doneUnsafe(initialization, Effect.fail(error));
        Deferred.doneUnsafe(shutdown, Effect.fail(error));
      };
      const close = () => {
        shutdownRequested = true;
        if (!initialized) fail(closedError("Utility process closed before initialization"));
        else Deferred.doneUnsafe(shutdown, Effect.void);
      };
      const protocolFailure = (cause: unknown) => {
        fail(
          new SewedError({
            code: "Protocol",
            message: "Invalid main control message",
            cause,
          }),
        );
      };
      const requireNoPorts = (ports: readonly unknown[]) => {
        if (ports.length === 0) return true;
        closePorts(ports);
        protocolFailure(new Error("Utility control message must not transfer ports"));
        return false;
      };
      const receive = (event: unknown) => {
        const ports = eventPorts(event);
        try {
          const message = Schema.decodeUnknownSync(ToUtility)(eventData(event));
          Match.value(message).pipe(
            Match.tag("Initialize", (value) => {
              if (!requireNoPorts(ports)) return;
              if (initialized) {
                protocolFailure(new Error("Utility was initialized more than once"));
                return;
              }
              initialized = true;
              Deferred.doneUnsafe(initialization, Effect.succeed(value));
            }),
            Match.tag("Shutdown", () => {
              if (requireNoPorts(ports)) close();
            }),
            Match.tag("DiagnosticsAck", () => {
              if (requireNoPorts(ports)) diagnostics.acknowledge();
            }),
            Match.tag("Connect", () => {
              if (ports.length !== 1 || !isElectronPort(ports[0])) {
                closePorts(ports);
                protocolFailure(new Error("Utility Connect must transfer one MessagePortMain"));
                return;
              }
              if (state.status === "running") state.host.accept(electronPort(ports[0]));
              else ports[0].close();
            }),
            Match.tag("Opened", (value) => {
              if (remote) remote.receive(value, ports);
              else closePorts(ports);
            }),
            Match.tag("Rejected", (value) => {
              if (!requireNoPorts(ports)) return;
              if (remote) remote.receive(value, ports);
            }),
            Match.exhaustive,
          );
        } catch (cause) {
          closePorts(ports);
          protocolFailure(cause);
        }
      };
      parent.on("message", receive);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          parent.off("message", receive);
          remote?.close(closedError("Utility process is closing"));
          diagnostics.close();
        }),
      );

      const run = Effect.gen(function* () {
        const data = yield* Deferred.await(initialization);
        if (shutdownRequested) return;
        remote = remoteBindings(parent, data.bindings);
        const bindings = remote.bindings;
        const module: { readonly default?: unknown } = yield* Effect.tryPromise({
          try: () => import(data.url),
          catch: (cause) =>
            new SewedError({ code: "Startup", message: "Could not load utility entry", cause }),
        });
        const program = Effect.gen(function* () {
          const host = yield* start(module.default, bindings);
          state = { status: "running", host };
          parent.postMessage({
            _tag: "Ready",
            processId: process.pid,
          } satisfies typeof FromUtility.Type);
          yield* Effect.never;
        }).pipe(
          Tracing.instrument,
          Effect.provideService(UtilityContext, utilityIdentity(process.pid)),
          Effect.provideService(OwnerContext, { id: data.ownerId }),
        );
        yield* data.diagnostics
          ? program.pipe(Effect.provideService(Sink, { ...diagnostics, tracing: data.tracing }))
          : program;
      }).pipe(Effect.raceFirst(Deferred.await(shutdown)));
      yield* run;
    }),
  ).pipe(
    Effect.onExit((exit) =>
      Effect.sync(() => {
        try {
          if (exit._tag === "Failure")
            parent.postMessage({
              _tag: "Failed",
              message: bounded(Cause.pretty(exit.cause)),
            } satisfies typeof FromUtility.Type);
        } finally {
          process.exit(exit._tag === "Failure" ? 1 : 0);
        }
      }),
    ),
  ),
);
