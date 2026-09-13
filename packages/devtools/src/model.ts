import type { Diagnostics } from "sewed";

export interface Span extends Diagnostics.TraceSpan {
  readonly events: readonly Pick<Diagnostics.TraceEvent, "name" | "time">[];
}

export interface Health {
  readonly runtimes: readonly Diagnostics.RuntimeSample[];
  readonly queues: readonly Diagnostics.QueueSample[];
  readonly dropped: number;
  readonly evicted: number;
  readonly complete: boolean;
}

export interface Snapshot {
  readonly capturedAt: number;
  readonly capacity: number;
  readonly diagnostics: Diagnostics.Snapshot;
  readonly spans: readonly Span[];
  readonly evictedSpans: number;
  readonly droppedTraceEvents: number;
  readonly health: Health;
}
