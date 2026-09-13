import { Effect, Layer, Match, PubSub, Schema, Stream } from "effect";
import { Sink } from "./internal/Diagnostics.ts";
export { health as runtimeHealth, instrument } from "./internal/Tracing.ts";
export type { HealthOptions } from "./internal/Tracing.ts";

const runtime = Schema.Literals(["main", "worker", "utility", "renderer", "unknown"]);
const placement = {
  runtime,
  threadId: Schema.Number,
  processId: Schema.optionalKey(Schema.Number),
  runtimeId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
};
export const Placement = Schema.Struct(placement);
export type Placement = typeof Placement.Type;

const label = Schema.String.check(Schema.isMaxLength(512));
const identifier = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const timestamp = Schema.String.check(
  Schema.isMaxLength(39),
  Schema.isPattern(/^(?:0|[1-9][0-9]{0,38})$/),
);
const nonNegative = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));
const positive = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0));
const resourceState = Schema.Literals(["acquiring", "ready", "releasing"]);
const transferCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const TraceSpan = Schema.Struct({
  _tag: Schema.Literal("TraceSpan"),
  traceId: identifier,
  spanId: identifier,
  parentId: Schema.optionalKey(identifier),
  name: label,
  startTime: timestamp,
  endTime: Schema.optionalKey(timestamp),
  outcome: Schema.Literals(["running", "success", "failure"]),
  ownerId: Schema.optionalKey(label),
  binding: Schema.optionalKey(label),
  ...placement,
});
export type TraceSpan = typeof TraceSpan.Type;

export const TraceEvent = Schema.Struct({
  _tag: Schema.Literal("TraceEvent"),
  traceId: identifier,
  spanId: identifier,
  name: label,
  time: timestamp,
  ...placement,
});
export type TraceEvent = typeof TraceEvent.Type;

export const RuntimeSample = Schema.Struct({
  _tag: Schema.Literal("RuntimeSample"),
  delayMs: nonNegative,
  intervalMs: positive,
  ...placement,
});
export type RuntimeSample = typeof RuntimeSample.Type;

export const QueueSample = Schema.Struct({
  _tag: Schema.Literal("QueueSample"),
  queueId: label,
  ownerId: Schema.optionalKey(label),
  kind: Schema.Literals(["rpc-server", "rpc-client"]),
  size: nonNegative,
  capacity: positive,
  activeRequests: Schema.optionalKey(nonNegative),
  ...placement,
});
export type QueueSample = typeof QueueSample.Type;

export const QueueClosed = Schema.Struct({
  _tag: Schema.Literal("QueueClosed"),
  queueId: label,
  ...placement,
});
export type QueueClosed = typeof QueueClosed.Type;

export const Observation = Schema.Union([
  TraceSpan,
  TraceEvent,
  RuntimeSample,
  QueueSample,
  QueueClosed,
]);
export type Observation = typeof Observation.Type;

const request = { ownerId: Schema.String, clientId: Schema.Number, requestId: Schema.String };
export const ResourceChanged = Schema.Struct({
  _tag: Schema.Literal("ResourceChanged"),
  resourceId: identifier,
  ownerId: Schema.String,
  clientId: Schema.Number,
  state: resourceState,
  ...placement,
});
export type ResourceChanged = typeof ResourceChanged.Type;

export const ResourceClosed = Schema.Struct({
  _tag: Schema.Literal("ResourceClosed"),
  resourceId: identifier,
  ownerId: Schema.String,
  clientId: Schema.Number,
  outcome: Schema.Literals(["success", "failure", "interrupted", "disconnected"]),
  reason: label,
  ...placement,
});
export type ResourceClosed = typeof ResourceClosed.Type;

export const TransferProgress = Schema.Struct({
  _tag: Schema.Literal("TransferProgress"),
  ...request,
  frames: transferCount,
  wireBytes: transferCount,
  terminal: Schema.Boolean,
  ...placement,
});
export type TransferProgress = typeof TransferProgress.Type;

export const Event = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("OwnerStarted"), ownerId: Schema.String, ...placement }),
  Schema.Struct({
    _tag: Schema.Literal("OwnerClosed"),
    ownerId: Schema.String,
    reason: Schema.Literals(["scope-closed", "shutdown", "terminated", "exited", "startup-failed"]),
  }),
  Schema.Struct({
    _tag: Schema.Literal("RuntimeClosed"),
    runtimeId: identifier,
  }),
  Schema.Struct({
    _tag: Schema.Literal("BindingOpened"),
    bindingId: Schema.String,
    slot: Schema.String,
    ownerId: Schema.String,
    ...placement,
  }),
  Schema.Struct({
    _tag: Schema.Literal("BindingClosed"),
    bindingId: Schema.String,
    reason: Schema.Literals([
      "scope-closed",
      "navigation",
      "renderer-gone",
      "renderer-disconnected",
      "replaced",
    ]),
  }),
  Schema.Struct({
    _tag: Schema.Literal("RequestStarted"),
    ...request,
    procedure: Schema.String,
    traceId: Schema.optionalKey(Schema.String),
    spanId: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal("RequestEnded"),
    ...request,
    outcome: Schema.Literals(["success", "failure", "interrupted", "disconnected"]),
    reason: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("EventsDropped"),
    ownerId: Schema.String,
    count: Schema.Number,
  }),
  ResourceChanged,
  ResourceClosed,
  TransferProgress,
  TraceSpan,
  TraceEvent,
  RuntimeSample,
  QueueSample,
  QueueClosed,
]);
export type Event = typeof Event.Type;
export interface Record {
  readonly sequence: number;
  readonly timestamp: number;
  readonly event: Event;
}
export interface Snapshot {
  readonly events: readonly Record[];
  readonly owners: readonly Extract<Event, { _tag: "OwnerStarted" }>[];
  readonly bindings: readonly Extract<Event, { _tag: "BindingOpened" }>[];
  readonly requests: readonly Extract<Event, { _tag: "RequestStarted" }>[];
  readonly resources: readonly ResourceChanged[];
  readonly transfers: readonly TransferProgress[];
  readonly dropped: number;
  /** Number of live resource records evicted from the bounded active map. */
  readonly resourceDropped: number;
  /** Number of live transfer records evicted from the bounded active map. */
  readonly transferDropped: number;
  readonly complete: boolean;
  readonly closed: boolean;
}

/** Scope this collector outside the resources it observes so their finalizers are recorded. */
export const make = (options: { readonly capacity?: number; readonly tracing?: boolean } = {}) =>
  Effect.gen(function* () {
    const capacity = options.capacity ?? 256;
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 65536)
      return yield* Effect.die(new RangeError("Diagnostics capacity must be between 1 and 65536"));
    const updates = yield* PubSub.sliding<Record>({ capacity });
    const events: Record[] = [];
    const owners = new Map<string, Extract<Event, { _tag: "OwnerStarted" }>>();
    const bindings = new Map<string, Extract<Event, { _tag: "BindingOpened" }>>();
    const requests = new Map<string, Extract<Event, { _tag: "RequestStarted" }>>();
    const resources = new Map<string, ResourceChanged>();
    const transfers = new Map<string, TransferProgress>();
    let sequence = 0;
    let dropped = 0;
    let resourceDropped = 0;
    let transferDropped = 0;
    let closed = false;
    const requestKey = (event: { ownerId: string; clientId: number; requestId: string }) =>
      JSON.stringify([event.ownerId, event.clientId, event.requestId]);
    const retain = <A>(map: Map<string, A>, key: string, value: A, onDrop: () => void): void => {
      if (!map.has(key) && map.size >= capacity) {
        const oldest = map.keys().next();
        if (!oldest.done) {
          map.delete(oldest.value);
          onDrop();
        }
      }
      map.set(key, value);
    };
    const emit = (event: Event) => {
      if (closed) return;
      Match.value(event).pipe(
        Match.tag("OwnerStarted", (event) => owners.set(event.ownerId, event)),
        Match.tag("OwnerClosed", (event) => {
          owners.delete(event.ownerId);
          for (const [key, binding] of bindings)
            if (binding.runtimeId === event.ownerId) bindings.delete(key);
          for (const [key, request] of requests)
            if (request.ownerId === event.ownerId) requests.delete(key);
          for (const [key, resource] of resources)
            if (resource.ownerId === event.ownerId) resources.delete(key);
          for (const [key, transfer] of transfers)
            if (transfer.ownerId === event.ownerId) transfers.delete(key);
        }),
        Match.tag("RuntimeClosed", () => undefined),
        Match.tag("BindingOpened", (event) => bindings.set(event.bindingId, event)),
        Match.tag("BindingClosed", (event) => bindings.delete(event.bindingId)),
        Match.tag("RequestStarted", (event) => requests.set(requestKey(event), event)),
        Match.tag("RequestEnded", (event) => requests.delete(requestKey(event))),
        Match.tag("EventsDropped", (event) => {
          dropped += event.count;
        }),
        Match.tag("ResourceChanged", (event) => {
          retain(resources, event.resourceId, event, () => {
            resourceDropped += 1;
          });
        }),
        Match.tag("ResourceClosed", (event) => resources.delete(event.resourceId)),
        Match.tag("TransferProgress", (event) => {
          const key = requestKey(event);
          if (event.terminal) transfers.delete(key);
          else
            retain(transfers, key, event, () => {
              transferDropped += 1;
            });
        }),
        Match.tag("TraceSpan", () => undefined),
        Match.tag("TraceEvent", () => undefined),
        Match.tag("RuntimeSample", () => undefined),
        Match.tag("QueueSample", () => undefined),
        Match.tag("QueueClosed", () => undefined),
        Match.exhaustive,
      );
      const record = Object.freeze({
        sequence: ++sequence,
        timestamp: Date.now(),
        event: Object.freeze(event),
      });
      events.push(record);
      if (events.length > capacity) events.shift();
      Effect.runSync(PubSub.publish(updates, record));
    };
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
      }).pipe(Effect.andThen(PubSub.shutdown(updates))),
    );
    return {
      layer: Layer.succeed(Sink, { emit, tracing: options.tracing ?? false }),
      snapshot: Effect.sync((): Snapshot => ({
        events: [...events],
        owners: [...owners.values()],
        bindings: [...bindings.values()],
        requests: [...requests.values()],
        resources: [...resources.values()],
        transfers: [...transfers.values()],
        dropped,
        resourceDropped,
        transferDropped,
        complete: dropped === 0 && resourceDropped === 0 && transferDropped === 0,
        closed,
      })),
      changes: Stream.fromPubSub(updates),
    };
  });

export type Collector = Effect.Success<ReturnType<typeof make>>;
