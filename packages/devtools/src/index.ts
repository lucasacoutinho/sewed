import { Effect, Layer, Stream, Tracer } from "effect";
import type { Scope } from "effect";
import { DevToolsClient } from "effect/devtools";
import { Diagnostics, MainContext, SewedError } from "sewed";
import type { Snapshot } from "./model.ts";
import { observeAttributes, traceStore } from "./tracing.ts";

export type { Snapshot, Span, Health } from "./model.ts";

export interface Options {
  readonly capacity?: number;
}

export interface Handle {
  readonly layer: Diagnostics.Collector["layer"];
  readonly snapshot: Effect.Effect<Snapshot>;
}

export const make = (
  options: Options = {},
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const capacity = options.capacity ?? 512;
    if (!Number.isSafeInteger(capacity) || capacity < 16 || capacity > 4096) {
      return yield* Effect.fail(
        new SewedError({ code: "Limit", message: "DevTools capacity must be between 16 and 4096" }),
      );
    }
    const collector = yield* Diagnostics.make({ capacity, tracing: true });
    yield* Diagnostics.runtimeHealth().pipe(Effect.provide(collector.layer));
    const traces = traceStore(capacity);
    yield* collector.changes.pipe(
      Stream.runForEach((record) => Effect.sync(() => traces.consume([record]))),
      Effect.forkScoped,
    );
    const instrumentation = Layer.merge(
      collector.layer,
      Layer.effect(
        Tracer.Tracer,
        DevToolsClient.makeTracer.pipe(
          Effect.provideService(DevToolsClient.DevToolsClient, traces),
          Effect.map((tracer) => observeAttributes(tracer, traces.sendUnsafe)),
        ),
      ),
    );
    const snapshot: Effect.Effect<Snapshot> = Effect.gen(function* () {
      const diagnostics = yield* collector.snapshot;
      traces.consume(diagnostics.events);
      return {
        capturedAt: Date.now(),
        capacity,
        diagnostics,
        ...traces.snapshot(),
        health: traces.health({ complete: diagnostics.complete, dropped: diagnostics.dropped }),
      };
    });
    return { layer: instrumentation, snapshot };
  });

export const layer = (
  options: Options & { readonly enabled?: boolean } = {},
): Layer.Layer<never, SewedError, MainContext> =>
  (options.enabled ?? process.env.SEWED_DEVTOOLS === "1")
    ? Layer.unwrap(Effect.map(make(options), (tools) => tools.layer))
    : Layer.empty;
