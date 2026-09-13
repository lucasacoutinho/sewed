# Worker binding dependencies

## Problem

Main and renderer programs can consume explicit bindings. A worker definition also needs to call other owners, including during handler Layer construction. Connection factories belong to the runtime that created the owners, so passing their JavaScript objects as worker data cannot provide that capability.

`Worker.spawn` already owns a real Node worker. `Binding.client` already owns each client's connection and retains the RPC's services, errors, and scope requirement. This addition connects those existing mechanisms without transferring owner lifetimes.

## Usage

For a worker that exposes a bound clock stream, the definition declares its dependency and uses an ordinary binding client:

```ts
export default Worker.define(
  ClockProtocol,
  ClockProtocol.toLayer({
    ticks: () => Stream.unwrap(Effect.map(Clock(), (clock) => clock.ticks())).pipe(Stream.orDie),
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

## Shape

`Worker.define(protocol, handlers, { bindings })` accepts a handler Layer requiring `WorkerContext` and `ClientContext`. The two-argument form continues to accept only `WorkerContext`. Unprovided main, renderer, middleware, and unrelated services remain type errors. Slot declarations contain keys; matching the declaration to the supplied instances is checked at worker startup.

`Worker.spawn(entry, { bindings })` retains its `MainContext | Scope` requirement. `Binding.to` checks the selected owner's protocol locally. Startup rejects missing, extra, and duplicate dependency keys before building handlers; an entry typed from the worker module or from an explicit `bindings` declaration reports missing and undeclared keys at compile time first. RPC schemas validate calls across runtimes; declarations do not prove that a handler uses only the slots it listed.

The worker bootstrap installs a client environment before building handler Layers. Each client acquisition creates a MessageChannel and transfers one port to main. Main resolves the requested slot in that worker's binding environment, then relays validated RPC envelopes to its selected owner. Requests, responses, stream acknowledgements, and interruption use the existing RPC protocol. Control messages use separate schemas. Connection counts are limited per consuming worker.

The public options hide channel creation, transfer, validation, and relay cleanup, per boundary discipline. Callers choose owners and scopes; they do not coordinate transport stages.

## Decision

Use a port per client acquisition, with a relay in main. This works with both worker owners and main hosts through the existing `ConnectionFactory`. Closing a client or consuming worker closes its downstream connections and interrupts pending handlers. Dependency owners retain the scopes that acquired them. Exited owners are not replaced or retried.

Each spawned worker has a child scope that closes on exit or failed startup. Inside the worker, the dependency environment has its own child scope, acquired before handler Layers. Handler finalizers therefore run before dependency connections close. Main keeps the relay available until the consuming worker exits. Shutdown can interrupt handler startup as well as a running server.

## Alternatives considered

- Transfer a direct dependency port at startup. This either restricts dependencies to Node workers or requires all owners to expose transferable endpoints. Reusing that port for independently acquired RPC clients would also require multiplexing connection identities.
- Multiplex all dependency traffic through the worker's parent channel. This avoids extra ports but adds a connection ID protocol, response routing, and queues already handled by the existing transport.
- Let workers spawn their dependencies. This changes ownership and duplicates shared services. Main already has the running instances needed for explicit composition.

## Tradeoffs

The main relay adds a hop between workers in exchange for supporting all existing owner types. CPU work still executes in the target worker. Bulk transfer and a direct-port optimization remain separate work.

The separate playground uses a compute worker bound to a clock worker. It exposes their actual thread IDs and observes stream continuity, cancellation, worker exit, and application shutdown.
