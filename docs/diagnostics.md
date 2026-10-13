# Runtime diagnostics

Follow the owners, bindings, and requests in your application with `Diagnostics.make({ capacity: 256 })`. Read a snapshot when you need an overview, or subscribe to changes as work runs.

Provide the collector's `layer` around the owners and binding environments you want to observe. Create it in an outer scope so it can record their cleanup too.

```ts
import { Effect, Stream } from "effect";
import { Diagnostics } from "sewed";

const observed = Effect.gen(function* () {
  const diagnostics = yield* Diagnostics.make({ capacity: 256 });
  yield* diagnostics.changes.pipe(
    Stream.runForEach((record) => Effect.logDebug(record)),
    Effect.forkScoped,
  );
  yield* application.pipe(Effect.provide(diagnostics.layer));
});
```

Here `application` is the application's resource program. For an Electron application, pass `observed` to `App.run`. A subscription is optional: `yield* diagnostics.snapshot` returns the current owners, bindings, active requests, and retained event history.

| Record           | Meaning                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `OwnerStarted`   | Exact owner ID, runtime, runtime ID, and thread ID                                       |
| `BindingOpened`  | Slot, target owner ID, and the runtime that owns the binding environment                 |
| `RequestStarted` | Owner, connection-local client and request IDs, procedure, and propagated trace/span IDs |
| `RequestEnded`   | Success, failure, interruption, or disconnection, with its reason                        |
| `BindingClosed`  | Scope closure, navigation, renderer loss, disconnect, or replacement                     |
| `OwnerClosed`    | Scope closure, shutdown, termination, startup failure, or process exit                   |

Request IDs are only unique together with their owner and client IDs. Main hosts and actual worker servers produce request records at the execution boundary. Worker records travel back to the collector that observed `Worker.spawn`. Renderer binding records come from the main-side document handshake, so navigation and process loss remain visible even after the renderer disappears. Bindings to an exited owner remain identifiable until their own environment closes; they never rebind automatically.

The history retains at most `capacity` records, from 1 to 65,536. Live state is tracked separately and survives history eviction. `changes` is a bounded sliding stream: slow consumers can detect missed records by a gap in `sequence` and read a fresh snapshot. Payloads, returned values, failure messages, URLs, and headers are not retained.

Worker forwarding allows one batch in flight and at most 256 waiting events. Overload produces `EventsDropped`, increments `snapshot.dropped`, and sets `snapshot.complete` to false. After that flag, active records may be incomplete; do not treat their count as authoritative. Closing a worker still clears its active requests and worker-owned binding environments. Abrupt termination can prevent final individual request records from reaching main; the owner closure explains their disappearance. This is a development diagnostic feed, not an audit log.

Effect RPC tracing remains enabled. Client spans include `sewed.binding`, `sewed.owner.id`, `sewed.runtime`, and `sewed.thread.id`. Server spans include the owner and execution runtime. Existing Effect tracers receive these attributes, and trace IDs propagate across the RPC connection. Sewed does not install an exporter or replace your tracer. A worker's tracing exporter, if needed, must be configured inside that worker; collector forwarding carries diagnostic records rather than full tracing spans.

Without a collector layer, owners do not build the diagnostic stream registry or install request-admission and stream-frame observation callbacks. Transport validation, admission budgets, acknowledgment pacing, request cleanup and ordinary Effect RPC tracing are unchanged. A collector with `tracing: false` still records request and transfer lifetimes; it is not the diagnostics-free path.

Closing the collector ends `changes` and stops recording. Its last snapshot remains readable with `closed: true`. Collectors are opt-in and do not acquire owners, retry work, or change scheduling.

Electron utility owners use runtime `utility`, an OS `processId`, and their explicit owner ID as `runtimeId`. Their `threadId` is 0 and does not imply main-process placement. `@sewed/devtools` consumes this collector for headless snapshots and uses Effect's DevTools tracer for local span metadata.
