import { Match, Option, Tracer } from "effect";
import type { DevToolsSchema } from "effect/unstable/devtools";
import { Diagnostics } from "sewed";
import type { Health, Span } from "./model.ts";

type Observation = Diagnostics.Observation;
type TraceSpanObservation = Diagnostics.TraceSpan;
type TraceEventObservation = Diagnostics.TraceEvent;
type RuntimeSample = Diagnostics.RuntimeSample;
type QueueSample = Diagnostics.QueueSample;

const maxEventsPerSpan = 32;

/** The same message shape Effect's DevTools client sends; span fields are not all own properties. */
const snapshotOf = (span: Tracer.Span): DevToolsSchema.Span => ({
  _tag: "Span",
  spanId: span.spanId,
  traceId: span.traceId,
  name: span.name,
  sampled: span.sampled,
  attributes: new Map(span.attributes),
  status: span.status,
  parent: span.parent,
});

/** Effect installs RPC attributes after constructing the span, including long-lived streams. */
export const observeAttributes = (
  tracer: Tracer.Tracer,
  send: (span: DevToolsSchema.Span) => void,
): Tracer.Tracer =>
  Tracer.make({
    context: tracer.context,
    span(options) {
      const span = tracer.span(options);
      const attribute = span.attribute;
      span.attribute = function (key, value) {
        attribute.call(this, key, value);
        if (key.startsWith("sewed.")) send(snapshotOf(span));
      };
      return span;
    },
  });
const label = (value: string): string => value.slice(0, 512);
const identifier = (value: string): string => value.slice(0, 256) || "unknown";
const timestamp = (value: string): string => (/^(?:0|[1-9][0-9]{0,38})$/.test(value) ? value : "0");
const keyOf = (value: { readonly traceId: string; readonly spanId: string }): string =>
  JSON.stringify([value.traceId, value.spanId]);

const runtimeOf = (value: string | undefined): Diagnostics.Placement["runtime"] => {
  switch (value) {
    case "main":
    case "worker":
    case "utility":
    case "renderer":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
};

const textAttribute = (
  attributes: ReadonlyMap<string, unknown>,
  key: string,
): string | undefined => {
  const value = attributes.get(key);
  return typeof value === "string" ? label(value) : undefined;
};

const numberAttribute = (
  attributes: ReadonlyMap<string, unknown>,
  key: string,
): number | undefined => {
  const value = attributes.get(key);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const placementFromAttributes = (
  attributes: ReadonlyMap<string, unknown>,
): Diagnostics.Placement => {
  const value = textAttribute(attributes, "sewed.runtime");
  const runtime = value === undefined ? "main" : runtimeOf(value);
  const runtimeId = identifier(textAttribute(attributes, "sewed.runtime.id") ?? runtime);
  const threadId = numberAttribute(attributes, "sewed.thread.id") ?? 0;
  const processId = numberAttribute(attributes, "sewed.process.id");
  return {
    runtime,
    runtimeId,
    threadId,
    ...(processId === undefined ? {} : { processId }),
  };
};

const statusOf = (message: DevToolsSchema.Span): Span["outcome"] =>
  Match.value(message.status).pipe(
    Match.tag("Started", () => "running" as const),
    Match.tag("Ended", ({ exit }) =>
      exit._tag === "Success" ? ("success" as const) : ("failure" as const),
    ),
    Match.exhaustive,
  );

const spanFromUpstream = (message: DevToolsSchema.Span): Span => {
  const attributes = message.attributes;
  const placement = placementFromAttributes(attributes);
  const ownerId = textAttribute(attributes, "sewed.owner.id");
  const binding = textAttribute(attributes, "sewed.binding");
  return {
    _tag: "TraceSpan",
    traceId: identifier(message.traceId),
    spanId: identifier(message.spanId),
    ...(Option.isSome(message.parent) ? { parentId: identifier(message.parent.value.spanId) } : {}),
    name: label(message.name),
    startTime: timestamp(String(message.status.startTime)),
    ...(message.status._tag === "Ended"
      ? { endTime: timestamp(String(message.status.endTime)) }
      : {}),
    outcome: statusOf(message),
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(binding === undefined ? {} : { binding }),
    ...placement,
    events: [],
  };
};

const eventFromUpstream = (message: DevToolsSchema.SpanEvent): TraceEventObservation => ({
  _tag: "TraceEvent",
  traceId: identifier(message.traceId),
  spanId: identifier(message.spanId),
  name: label(message.name),
  time: timestamp(String(message.startTime)),
  ...placementFromAttributes(new Map()),
});

const appendEvent = (
  events: readonly Span["events"][number][],
  event: Span["events"][number],
): { readonly events: readonly Span["events"][number][]; readonly dropped: number } => {
  const next = [...events, event];
  const dropped = Math.max(0, next.length - maxEventsPerSpan);
  return { events: next.slice(-maxEventsPerSpan), dropped };
};

export interface TraceStore {
  readonly sendUnsafe: (message: DevToolsSchema.Span | DevToolsSchema.SpanEvent) => void;
  readonly sendObservation: (observation: Observation) => void;
  readonly consume: (
    records: readonly { readonly sequence: number; readonly event: Diagnostics.Event }[],
  ) => void;
  readonly snapshot: () => {
    readonly spans: readonly Span[];
    readonly evictedSpans: number;
    readonly droppedTraceEvents: number;
  };
  readonly health: (options: { readonly complete: boolean; readonly dropped: number }) => Health;
}

export const traceStore = (capacity: number): TraceStore => {
  const spans = new Map<string, Span>();
  const pendingEvents = new Map<string, Span["events"]>();
  const runtimes = new Map<string, RuntimeSample>();
  const queues = new Map<string, QueueSample>();
  let evictedSpans = 0;
  let droppedEvents = 0;
  let evictedSamples = 0;
  let lastSequence = 0;
  let sequenceStarted = false;
  let sequenceGaps = 0;

  const queueKey = (sample: Pick<QueueSample, "runtimeId" | "queueId">): string =>
    JSON.stringify([sample.runtimeId, sample.queueId]);

  const retainPending = (key: string, event: Span["events"][number]) => {
    const appended = appendEvent(pendingEvents.get(key) ?? [], event);
    droppedEvents += appended.dropped;
    pendingEvents.set(key, appended.events);
    while (pendingEvents.size > capacity) {
      const oldest = pendingEvents.keys().next();
      if (oldest.done) break;
      const events = pendingEvents.get(oldest.value);
      pendingEvents.delete(oldest.value);
      droppedEvents += events?.length ?? 0;
    }
  };

  const ingestEvent = (event: TraceEventObservation) => {
    const key = keyOf(event);
    const value = { name: label(event.name), time: event.time };
    const previous = spans.get(key);
    if (previous === undefined) {
      retainPending(key, value);
      return;
    }
    const appended = appendEvent(previous.events, value);
    droppedEvents += appended.dropped;
    spans.set(key, { ...previous, events: appended.events });
  };

  const ingestSpan = (incoming: TraceSpanObservation | Span) => {
    const key = keyOf(incoming);
    const previous = spans.get(key);
    const pending = pendingEvents.get(key) ?? [];
    pendingEvents.delete(key);
    const baseEvents = previous?.events ?? ("events" in incoming ? incoming.events : []);
    let mergedEvents = baseEvents;
    for (const event of pending) {
      const appended = appendEvent(mergedEvents, event);
      mergedEvents = appended.events;
      droppedEvents += appended.dropped;
    }
    const next =
      previous !== undefined && previous.outcome !== "running" && incoming.outcome === "running"
        ? { ...previous, events: mergedEvents }
        : { ...incoming, _tag: "TraceSpan" as const, events: mergedEvents };
    spans.set(key, next);
    while (spans.size > capacity) {
      const oldest = spans.keys().next();
      if (oldest.done) break;
      const evicted = spans.get(oldest.value);
      spans.delete(oldest.value);
      evictedSpans++;
      droppedEvents += evicted?.events.length ?? 0;
    }
  };

  const retainRuntime = (sample: RuntimeSample) => {
    if (!runtimes.has(sample.runtimeId) && runtimes.size >= capacity) {
      const oldest = runtimes.keys().next();
      if (!oldest.done) {
        runtimes.delete(oldest.value);
        evictedSamples++;
      }
    }
    runtimes.set(sample.runtimeId, sample);
  };

  const retainQueue = (sample: QueueSample) => {
    const key = queueKey(sample);
    if (!queues.has(key) && queues.size >= capacity) {
      const oldest = queues.keys().next();
      if (!oldest.done) {
        queues.delete(oldest.value);
        evictedSamples++;
      }
    }
    queues.set(key, sample);
  };

  const clearOwner = (ownerId: string) => {
    runtimes.delete(ownerId);
    for (const [key, sample] of queues)
      if (sample.ownerId === ownerId || sample.runtimeId === ownerId) queues.delete(key);
  };

  const clearRuntime = (runtimeId: string) => {
    runtimes.delete(runtimeId);
    for (const [key, sample] of queues) if (sample.runtimeId === runtimeId) queues.delete(key);
  };

  const sendObservation = (observation: Observation) => {
    switch (observation._tag) {
      case "TraceSpan":
        ingestSpan(observation);
        break;
      case "TraceEvent":
        ingestEvent(observation);
        break;
      case "RuntimeSample":
        retainRuntime(observation);
        break;
      case "QueueSample":
        retainQueue(observation);
        break;
      case "QueueClosed":
        queues.delete(queueKey(observation));
        break;
    }
  };

  const consume = (
    records: readonly { readonly sequence: number; readonly event: Diagnostics.Event }[],
  ) => {
    for (const record of records) {
      if (record.sequence <= lastSequence) continue;
      if (sequenceStarted && record.sequence > lastSequence + 1)
        sequenceGaps += record.sequence - lastSequence - 1;
      sequenceStarted = true;
      lastSequence = record.sequence;
      switch (record.event._tag) {
        case "TraceSpan":
        case "TraceEvent":
        case "RuntimeSample":
        case "QueueSample":
        case "QueueClosed":
          sendObservation(record.event);
          break;
        case "OwnerClosed":
          clearOwner(record.event.ownerId);
          break;
        case "RuntimeClosed":
          clearRuntime(record.event.runtimeId);
          break;
        default:
          break;
      }
    }
  };

  return {
    sendUnsafe(message) {
      if (message._tag === "SpanEvent") {
        ingestEvent(eventFromUpstream(message));
      } else {
        ingestSpan(spanFromUpstream(message));
      }
    },
    sendObservation,
    consume,
    snapshot: () => ({
      spans: [...spans.values()],
      evictedSpans,
      droppedTraceEvents: droppedEvents,
    }),
    health: ({ complete, dropped }) => ({
      runtimes: [...runtimes.values()],
      queues: [...queues.values()],
      dropped: dropped + sequenceGaps,
      evicted: evictedSamples,
      complete:
        complete &&
        sequenceGaps === 0 &&
        droppedEvents === 0 &&
        evictedSamples === 0 &&
        evictedSpans === 0,
    }),
  };
};
