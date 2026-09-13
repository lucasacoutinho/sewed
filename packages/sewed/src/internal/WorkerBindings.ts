import { MessagePort } from "node:worker_threads";
import { Context, Effect, Schema } from "effect";
import { makeBound, type Bound } from "../Binding.ts";
import { Event } from "../Diagnostics.ts";
import { connectPort, nodePort } from "./NodePort.ts";
import { serveConnections } from "./BindingRelay.ts";

export const WorkerData = Schema.Struct({
  url: Schema.String,
  ownerId: Schema.String,
  diagnostics: Schema.Boolean,
  tracing: Schema.Boolean,
  bindings: Schema.Array(Schema.Struct({ key: Schema.String, ownerId: Schema.String })),
});

export const FromWorker = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Ready") }),
  Schema.Struct({ _tag: Schema.Literal("Failed"), message: Schema.String }),
  Schema.Struct({
    _tag: Schema.Literal("Diagnostics"),
    events: Schema.Array(Event).check(Schema.isMaxLength(64)),
    dropped: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  Schema.Struct({
    _tag: Schema.Literal("Open"),
    key: Schema.String,
    port: Schema.instanceOf(MessagePort),
  }),
]);

export const ToWorker = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Shutdown") }),
  Schema.Struct({ _tag: Schema.Literal("DiagnosticsAck") }),
  Schema.Struct({ _tag: Schema.Literal("Connect"), port: Schema.instanceOf(MessagePort) }),
]);

export type DiagnosticsMessage = Extract<typeof FromWorker.Type, { readonly _tag: "Diagnostics" }>;
export interface DiagnosticsControlMessage {
  readonly _tag: "Diagnostics";
  readonly events: readonly Event[];
  readonly dropped: number;
}
export interface DiagnosticsParent {
  readonly postMessage: (message: DiagnosticsControlMessage) => void;
}

/** One batch in flight and a bounded waiting buffer keep diagnostics off the RPC critical path. */
export const forwardDiagnostics = (parent: DiagnosticsParent) => {
  const pending: Event[] = [];
  let inFlight = false;
  let dropped = 0;
  let closed = false;
  const flush = () => {
    if (closed || inFlight || (pending.length === 0 && dropped === 0)) return;
    inFlight = true;
    parent.postMessage({
      _tag: "Diagnostics",
      events: pending.splice(0, 64),
      dropped,
    });
    dropped = 0;
  };
  return {
    emit(event: Event) {
      if (closed) return;
      if (pending.length < 256) pending.push(event);
      else dropped++;
      flush();
    },
    acknowledge() {
      inFlight = false;
      flush();
    },
    close() {
      closed = true;
      pending.length = 0;
    },
  };
};

export const remoteBindings = (
  parent: MessagePort,
  bindings: typeof WorkerData.Type.bindings,
): readonly Bound[] =>
  bindings.map(({ key, ownerId }) =>
    makeBound(Context.Service(key), ownerId, {
      connect: connectPort((port) => {
        parent.postMessage({ _tag: "Open", key, port } satisfies typeof FromWorker.Type, [port]);
      }),
    }),
  );

export const serveBindings = (bindings: readonly Bound[]) =>
  Effect.map(
    serveConnections(bindings),
    (serve) =>
      ({ key, port }: Extract<typeof FromWorker.Type, { readonly _tag: "Open" }>) =>
        serve(key, nodePort(port)),
  );
