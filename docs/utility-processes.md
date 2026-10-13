# Utility processes

Run an RPC owner in an Electron utility process with `Utility`. Define its handlers in the utility entry, then let main spawn it and provide the bindings it needs.

Utility entries use file URLs and the same protocol and handler-layer checks as workers. Their runtime service is `UtilityContext`.

```ts
import * as Utility from "sewed/utility";
import { Protocol } from "../shared/protocol.js";

export default Utility.define(Protocol, (implement) =>
  implement({
    value: () => Utility.processId,
  }),
);
```

The main program chooses the owner and supplies its bindings:

```ts
import { Effect } from "effect";
import { Binding } from "sewed";
import { App, Utility } from "sewed/main";
import { Compute, Protocol } from "../shared/protocol.js";

App.run(
  [],
  Effect.gen(function* () {
    const owner = yield* Utility.spawn(
      Utility.entry(new URL("../utility/compute.js", import.meta.url), Protocol),
    );
    yield* Effect.gen(function* () {
      const compute = yield* Compute();
      const childPid = yield* compute.value();
      yield* Effect.log(childPid);
    }).pipe(Effect.provide(Binding.layer([Binding.to(Compute, owner)])));
  }),
);
```

Here `Protocol` declares the numeric `value` RPC and `Compute` is its shared
`Binding.slot`. Renderer entries and worker dependencies can bind to this same
owner. Renderer reload changes the document connection while retaining the
utility PID and owner ID. A crash closes that owner; subsequent calls fail
instead of starting a replacement.

Handler Layers can provide application services. A utility that calls other
owners declares its slots in `Utility.define(..., { bindings: [...] })`; main
supplies those exact slots to `Utility.spawn(..., { bindings: [...] })`. Main,
worker, and utility dependencies retain their own runtime capabilities and
lifetimes. `UtilityContext` permits utility operations and cannot satisfy a
main, worker, or renderer requirement.

Dependencies owned by main receive their native port directly. The selected main
owner validates each packet without an intermediate in-process connection or
duplicate envelope decoding. Worker and utility owners retain a validating relay
in main. Consumer disconnect, owner shutdown and dependency environment closure
retire connections and release their admission capacity.

The main process starts the entry with `Utility.spawn`. The returned owner has a
numeric `processId`, `shutdown`, `terminate`, and `awaitExit`. Startup rejects
non-file URLs, an entry without the matching `Utility.define` registration, a
native fork failure, malformed control traffic, and a ten-second readiness
timeout.

Utility control traffic uses Electron's native `process.parentPort` channel.
Main creates each `MessageChannelMain`; the transferred `MessagePortMain` carries
the RPC packets. A utility child never creates or transfers a Node
`worker_threads.MessagePort`. Binding requests are bounded to 128 pending or
active connections, and rejected or late replies close transferred ports.
Each open accepts one reply; duplicate replies close extra ports and preserve
the first result. Request setup and cleanup registration run atomically, so
cancelling an open removes its pending entry and sends `Cancel` even when
interruption arrives immediately after `Open`. Waiting for the reply remains
interruptible. A failed native port subscription removes its listeners before
returning the error.

The child reports its own native PID in the `Ready` message. Shutdown lets the
owner scope finish its finalizers before the child exits. Scope teardown sends a
graceful shutdown, waits two seconds, then kills the native process and waits for
its numeric exit code. A failed child finalizer produces exit code 1 after the
remaining finalizers run. `terminate` kills directly; `awaitExit` exposes that exit
code without inventing signal information. `shutdown` acknowledges a request;
`terminate` waits for exit. Both retain typed `SewedError` failures for native
operations. Scope cleanup reports a defect if native termination does not finish;
it does not treat a timeout as successful process cleanup.
