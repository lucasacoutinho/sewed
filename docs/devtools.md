# @sewed/devtools

Scoped diagnostics and Effect tracing for Sewed. The optional package collects
owners, bindings, requests, remote resources, sampled stream counters, spans, and
runtime health. It has no UI, native window, preload, renderer bridge, or React
dependency.

## Read snapshots

```ts
import { Effect } from "effect";
import { App, BrowserWindow } from "sewed/main";
import * as DevTools from "@sewed/devtools";

App.run(
  [],
  Effect.gen(function* () {
    const tools = yield* DevTools.make({ capacity: 512 });
    yield* Effect.gen(function* () {
      yield* BrowserWindow.make();
    }).pipe(Effect.provide(tools.layer));

    const snapshot = yield* tools.snapshot;
    yield* Effect.logInfo("Observed owners", snapshot.diagnostics.owners.length);
  }),
);
```

`make({ capacity? })` requires `MainContext` and `Scope`. It returns `layer` and
`snapshot`. Create it in the application scope, outside the resources it observes,
so their finalizers can still emit diagnostics. A headless collector can also run
under `sewed/testing` for checks without Electron.

`snapshot` is a typed Effect returning captured time, capacity, diagnostics, spans,
and health. Diagnostic records include current owners, bindings, active requests,
resources and transfers, plus bounded lifecycle history. Join request starts,
progress, and endings by owner, client, and request ID. Stream totals count encoded
wire bytes and frames. Resource IDs are diagnostic identities, not lease tokens.

`capacity` defaults to 512 and accepts 16–4096. History, live resource/transfer
records, spans, and health samples are bounded. Drop and eviction counters identify
partial history. Missing starts do not acquire invented durations. Closed owners
and runtimes are removed from active maps.

Spans retain IDs, parentage, names, times, outcomes, up to 32 named events, and
Sewed placement/ownership attributes. Snapshots exclude RPC payloads, lease tokens,
arbitrary attributes, return values, and failure bodies. Span and event names are
application-provided metadata; keep sensitive data out of them.

## Effect integration

The adapter uses the pinned Effect `4.0.0-rc.115`
[`DevToolsClient.makeTracer`](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/unstable/devtools/DevToolsClient.ts).
It delegates to the current tracer, preserving its span IDs, parents, events,
ends, and sampling behavior while collecting selected metadata locally.

Applications can provide Effect's ordinary
[`DevTools.layer`](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/unstable/devtools/DevTools.ts)
around a program using `tools.layer`:

```ts
import { DevTools as EffectDevTools } from "effect/unstable/devtools";

yield * program.pipe(Effect.provide(tools.layer), Effect.provide(EffectDevTools.layer()));
```

Effect owns that runtime's external connection and metrics export. Its default
endpoint is `ws://localhost:34437`. Sewed does not start a server or install a UI.
Forwarded worker, utility and renderer observations are aggregated in Sewed's
snapshot; they are not replayed as fabricated upstream spans or metrics.

Sewed enables instrumentation in spawned workers, utility processes, and bound
renderer documents. The main bridge validates renderer observations and assigns
the sending document's placement. Local and forwarded spans join by trace/span ID,
including unfinished streams. Health contains scoped timer lateness and the latest
Sewed RPC queue sizes; these are not CPU utilization or Electron native queue sizes.

The lower-level `Diagnostics.instrument` and `Diagnostics.runtimeHealth` APIs
remain available through the core `sewed` package.

## Development

The optional Vite wrapper enables instrumentation in its managed Electron child:

```ts
import { sewedDevTools } from "@sewed/devtools/vite";

sewedDevTools({ main: "src/main/app.ts", tsconfig: "tsconfig.electron.json" });
```

It sets `SEWED_DEVTOOLS=1` without changing the host environment. A long-running
program can use `Effect.provide(DevTools.layer())`; `enabled: true` or `false`
overrides the flag. Layers live for the Effect they are provided to. When an
`App.run` setup returns after constructing resources, use `make` in that application
scope as above to retain diagnostics until shutdown.

The playground's `dev:inspect` enables this collection while opening the same two
application windows. Electron's ordinary Chromium DevTools remains available
through `window.webContents.openDevTools()` and `closeDevTools`; it is independent
of this package. Native checks exercise snapshots, cross-runtime traces,
cancellation, resource release and development shutdown directly.
