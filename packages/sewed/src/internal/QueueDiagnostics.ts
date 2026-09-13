import { Effect } from "effect";
import { generateInstanceId } from "../InstanceId.ts";
import { location, sink } from "./Diagnostics.ts";

export const observe = (
  size: () => number,
  capacity: number,
  options: {
    readonly kind: "rpc-server" | "rpc-client";
    readonly ownerId?: string;
    readonly activeRequests?: () => number;
  },
) =>
  Effect.gen(function* () {
    const observer = yield* sink;
    if (!observer?.tracing) return;
    const placement = yield* location;
    const queueId = yield* generateInstanceId();
    const sample = Effect.sync(() =>
      observer.emit({
        _tag: "QueueSample",
        queueId,
        kind: options.kind,
        ...(options.ownerId === undefined ? {} : { ownerId: options.ownerId }),
        ...(options.activeRequests === undefined
          ? {}
          : { activeRequests: options.activeRequests() }),
        size: size(),
        capacity,
        ...placement,
      }),
    );
    yield* sample;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => observer.emit({ _tag: "QueueClosed", queueId, ...placement })),
    );
    yield* sample.pipe(Effect.delay(500), Effect.forever, Effect.forkScoped);
  });
