import { Effect, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, Capability, Diagnostics, SewedError } from "sewed";
import { Capability as Serving, Net, Utility, Worker } from "sewed/main";
import type { Session } from "sewed/main";
import * as UtilityDefinition from "sewed/utility";
import * as WorkerDefinition from "sewed/worker";

/**
 * The third file of guide examples, under the rules `guide-examples-types.ts` states. These are
 * the guides for bindings, workers, utility processes, binary transport and operations. One more
 * liberty here: a guide imports `sewed/worker` and `sewed/main` both as `Worker` in different
 * files, so the definition side is named `WorkerDefinition` (and `UtilityDefinition`) in this one.
 */

declare const session: Session.Handle;
declare const command: string;
declare const content: Uint8Array;
declare const post: (
  command: string,
  content: Uint8Array,
) => Effect.Effect<{ readonly id: string }, SewedError>;
declare const application: Effect.Effect<void>;

// --- docs/binding-composition.md and docs/api.md ----------------------------------------------

const ComputeProtocol = RpcGroup.make(
  Rpc.make("wait", {
    payload: { milliseconds: Schema.Finite, label: Schema.String },
    success: Schema.String,
    error: SewedError,
  }),
  Rpc.make("background", { success: Schema.Finite, error: SewedError, stream: true }),
  Rpc.make("value", { success: Schema.Finite, error: SewedError }),
);
const Compute = Binding.slot("compute", ComputeProtocol);
declare const worker: Binding.Owner<RpcGroup.Rpcs<typeof ComputeProtocol>>;

export const bindingComposition = Effect.gen(function* () {
  yield* Effect.gen(function* () {
    const compute = yield* Compute();
    return yield* compute.wait({ milliseconds: 20, label: "Ready" });
  }).pipe(Effect.provide(Binding.layer([Binding.to(Compute, worker)])));

  const background = Effect.gen(function* () {
    const compute = yield* Compute();
    yield* Stream.runDrain(compute.background());
  });

  yield* background.pipe(
    Effect.provide(Binding.layer([Binding.to(Compute, worker)])),
    Effect.forkScoped,
  );
});

const CountProtocol = RpcGroup.make(
  Rpc.make("count", { payload: { n: Schema.Finite }, success: Schema.Finite }),
);
export const apiWorkerDefine = WorkerDefinition.define(CountProtocol, (implement) =>
  implement({
    count: ({ n }) => Effect.map(WorkerDefinition.threadId, (thread) => n + thread),
  }),
);

// --- docs/binary-streams.md -------------------------------------------------------------------

export const FileMethods = Binary.protocol(
  RpcGroup.make(Rpc.make("read", { success: Binary.Bytes, stream: true })),
);

const Attachments = Capability.define(
  "attachments",
  Binary.protocol(
    RpcGroup.make(
      Binary.bulk(
        Rpc.make("ingest", {
          payload: { command: Schema.String, content: Binary.Bytes },
          success: Schema.Struct({ id: Schema.String }),
          error: SewedError,
        }),
        { field: "content", maxBytes: 12 * 1024 * 1024 },
      ),
    ),
  ),
);

export const upload = Effect.gen(function* () {
  const attachments = yield* Attachments;
  return yield* attachments.ingest({ command, content });
});

export const attachmentsHandlers = Serving.fromHandlers(Attachments, (implement) =>
  implement({ ingest: ({ command, content }) => post(command, content) }),
);

const Result = Schema.Struct({ title: Schema.String });
export const Search = Capability.define(
  "search",
  Binary.protocol(
    RpcGroup.make(
      Binary.bulkAnswer(
        Rpc.make("query", {
          payload: { text: Schema.String },
          success: Schema.Array(Result),
          error: SewedError,
        }),
        { maxBytes: 4 * 1024 * 1024 },
      ),
    ),
  ),
);

// --- docs/worker-bindings.md ------------------------------------------------------------------

const ClockProtocol = RpcGroup.make(
  Rpc.make("ticks", { success: Schema.Finite, error: SewedError, stream: true }),
);
const Clock = Binding.slot("clock", ClockProtocol);

export const clockProxyDefinition = WorkerDefinition.define(
  ClockProtocol,
  ClockProtocol.toLayer({
    ticks: () => Stream.unwrap(Effect.map(Clock(), (clock) => clock.ticks())),
  }),
  { bindings: [Clock] },
);

declare const clockEntry: Worker.Entry<RpcGroup.Rpcs<typeof ClockProtocol>>;
declare const clockProxyEntry: Worker.Entry<RpcGroup.Rpcs<typeof ClockProtocol>>;

export const workerBindings = Effect.gen(function* () {
  const clock = yield* Worker.spawn(clockEntry);
  const clockProxy = yield* Worker.spawn(clockProxyEntry, {
    bindings: [Binding.to(Clock, clock)],
  });
  return clockProxy;
});

// --- docs/utility-processes.md ----------------------------------------------------------------

const UtilityProtocol = RpcGroup.make(
  Rpc.make("value", { success: Schema.Finite, error: SewedError }),
);
const UtilityCompute = Binding.slot("utility-compute", UtilityProtocol);

export const utilityDefinition = UtilityDefinition.define(UtilityProtocol, (implement) =>
  implement({
    value: () => UtilityDefinition.processId,
  }),
);

export const utilityProcess = Effect.gen(function* () {
  const owner = yield* Utility.spawn(
    Utility.entry(new URL("../utility/compute.js", import.meta.url), UtilityProtocol),
  );
  yield* Effect.gen(function* () {
    const compute = yield* UtilityCompute();
    const childPid = yield* compute.value();
    yield* Effect.log(childPid);
  }).pipe(Effect.provide(Binding.layer([Binding.to(UtilityCompute, owner)])));
});

// --- docs/operations.md -----------------------------------------------------------------------

export const operationsHttp = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const response = yield* http.get("https://api.example.com/status");
  return yield* response.json;
}).pipe(Effect.scoped, Effect.provide(Net.layer({ session })));

// --- docs/diagnostics.md ----------------------------------------------------------------------

export const observed = Effect.gen(function* () {
  const diagnostics = yield* Diagnostics.make({ capacity: 256 });
  yield* diagnostics.changes.pipe(
    Stream.runForEach((record) => Effect.logDebug(record)),
    Effect.forkScoped,
  );
  yield* application.pipe(Effect.provide(diagnostics.layer));
});
