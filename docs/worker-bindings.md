# Worker binding dependencies

A worker can call another worker or a main-owned service through a binding. Main chooses the running instance, and the worker declares the client it needs.

The dependency is available while the worker builds its handler layer as well as during requests. Calls execute in the selected owner's runtime, and each owner keeps its own lifetime.

## Give a worker a dependency

For a worker that exposes a bound clock stream, the definition declares its dependency and uses an ordinary binding client:

```ts
import { Schema, Effect, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, SewedError } from "sewed";
import * as Worker from "sewed/worker";

const ClockProtocol = RpcGroup.make(
  Rpc.make("ticks", { success: Schema.Number, error: SewedError, stream: true }),
);
const Clock = Binding.slot("clock", ClockProtocol);

export default Worker.define(
  ClockProtocol,
  ClockProtocol.toLayer({
    ticks: () => Stream.unwrap(Effect.map(Clock(), (clock) => clock.ticks())),
  }),
  { bindings: [Clock] },
);
```

Main supplies the running instances:

```ts
const clock = yield * Worker.spawn(clockEntry);
const clockProxy =
  yield *
  Worker.spawn(clockProxyEntry, {
    bindings: [Binding.to(Clock, clock)],
  });
```

The same binding can target a main-owned `host`. The worker still receives only the declared RPC capability; native operations execute in that host's runtime.

A forwarding operation declares `SewedError` in its error schema so dependency failures can cross its RPC boundary, including stream failures. An operation with a domain error can use `Schema.Union([DomainError, SewedError])`. Turning a dependency failure into a defect with `Effect.orDie` or `Stream.orDie` loses its typed error channel.

## API details

`Worker.define(protocol, handlers, { bindings })` accepts a handler Layer requiring `WorkerContext` and `ClientContext`. The two-argument form accepts only `WorkerContext`. Unprovided main, renderer, middleware, and unrelated services remain type errors. Slot declarations contain keys; matching the declaration to the supplied instances is checked at worker startup.

`Worker.spawn(entry, { bindings })` retains its `MainContext | Scope` requirement. `Binding.to` checks the selected owner's protocol locally. Startup rejects missing, extra, and duplicate dependency keys before building handlers; an entry typed from the worker module or from an explicit `bindings` declaration reports missing and undeclared keys at compile time first. RPC schemas validate calls across runtimes; declarations do not prove that a handler uses only the slots it listed.

The worker bootstrap installs a client environment before building handler Layers. Each client acquisition creates a MessageChannel and transfers one port to main. Main resolves the requested slot in that worker's binding environment, then relays validated RPC envelopes to its selected owner. Requests, responses, stream acknowledgements, and interruption use the existing RPC protocol. Control messages use separate schemas. Connection counts are limited per consuming worker.

The public options hide channel creation, transfer, validation, and relay cleanup, per boundary discipline. Callers choose owners and scopes; they do not coordinate transport stages.

## Decision

Use a port per client acquisition, with a relay in main. This works with both worker owners and main hosts through the existing `ConnectionFactory`. Closing a client or consuming worker closes its downstream connections and interrupts pending handlers. Dependency owners retain the scopes that acquired them. Exited owners are not replaced or retried.

Each spawned worker has a child scope that closes on exit or failed startup. Inside the worker, the dependency environment has its own child scope, acquired before handler Layers. Handler finalizers therefore run before dependency connections close. Main keeps the relay available until the consuming worker exits. Shutdown can interrupt handler startup as well as a running server.

## Tradeoffs

Dependency calls pass through a relay in main, which lets the same binding target a worker or a main-owned host. The relay adds a hop; CPU work still executes in the target worker.

The separate playground uses a compute worker bound to a clock worker. It exposes their actual thread IDs and observes stream continuity, cancellation, worker exit, and application shutdown.
