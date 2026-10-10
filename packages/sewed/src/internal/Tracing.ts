import { Effect, Option, Tracer } from "effect";
import type { Scope } from "effect";
import type { Observation, Placement, TraceSpan } from "../Diagnostics.ts";
import { location, sink } from "./Diagnostics.ts";

const maxLabelLength = 512;
const maxIdentifierLength = 256;
const defaultIntervalMs = 500;

export interface HealthOptions {
  readonly intervalMs?: number;
}

const label = (value: unknown): string | undefined =>
  typeof value === "string" ? value.slice(0, maxLabelLength) : undefined;

const identifier = (value: string): string => value.slice(0, maxIdentifierLength) || "unknown";
const timestamp = (value: bigint): string => {
  const encoded = String(value);
  return /^(?:0|[1-9][0-9]{0,38})$/.test(encoded) ? encoded : "0";
};

const placementOf = (placement: Placement): Placement => ({
  ...placement,
  runtimeId: identifier(placement.runtimeId),
});

const attributeLabel = (span: Tracer.Span, key: string): string | undefined =>
  label(span.attributes.get(key));

const outcomeOf = (status: Tracer.SpanStatus): TraceSpan["outcome"] => {
  if (status._tag === "Started") return "running";
  return status.exit._tag === "Success" ? "success" : "failure";
};

const spanObservation = (span: Tracer.Span, placement: Placement): TraceSpan => {
  const status = span.status;
  const parent = Option.getOrUndefined(span.parent);
  const ownerId = attributeLabel(span, "sewed.owner.id");
  const binding = attributeLabel(span, "sewed.binding");
  return {
    _tag: "TraceSpan",
    traceId: identifier(span.traceId),
    spanId: identifier(span.spanId),
    ...(parent === undefined ? {} : { parentId: identifier(parent.spanId) }),
    name: span.name.slice(0, maxLabelLength),
    startTime: timestamp(status.startTime),
    ...(status._tag === "Ended" ? { endTime: timestamp(status.endTime) } : {}),
    outcome: outcomeOf(status),
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(binding === undefined ? {} : { binding }),
    ...placementOf(placement),
  };
};

const spanEvent = (
  span: Tracer.Span,
  name: string,
  time: bigint,
  placement: Placement,
): Observation => ({
  _tag: "TraceEvent",
  traceId: identifier(span.traceId),
  spanId: identifier(span.spanId),
  name: name.slice(0, maxLabelLength),
  time: timestamp(time),
  ...placementOf(placement),
});

const observedTracer = (
  current: Tracer.Tracer,
  observer: (observation: Observation) => void,
  placement: Placement,
): Tracer.Tracer =>
  Tracer.make({
    context: current.context,
    span(options) {
      const span = current.span(options);
      if (!span.sampled) return span;
      observer(spanObservation(span, placement));
      return {
        _tag: span._tag,
        get name() {
          return span.name;
        },
        get spanId() {
          return span.spanId;
        },
        get traceId() {
          return span.traceId;
        },
        get parent() {
          return span.parent;
        },
        get annotations() {
          return span.annotations;
        },
        get status() {
          return span.status;
        },
        get attributes() {
          return span.attributes;
        },
        get links() {
          return span.links;
        },
        get sampled() {
          return span.sampled;
        },
        get kind() {
          return span.kind;
        },
        end(endTime, exit) {
          const wasEnded = span.status._tag === "Ended";
          span.end.call(span, endTime, exit);
          const statusAfter: Tracer.SpanStatus = span.status;
          if (!wasEnded && statusAfter._tag === "Ended") observer(spanObservation(span, placement));
        },
        attribute(key, value) {
          span.attribute.call(span, key, value);
          if (key === "sewed.owner.id" || key === "sewed.binding")
            observer(spanObservation(span, placement));
        },
        event(name, startTime, attributes) {
          span.event.call(span, name, startTime, attributes);
          observer(spanEvent(span, name, startTime, placement));
        },
        addLinks(links) {
          span.addLinks.call(span, links);
        },
      };
    },
  });

const checkedInterval = (options: HealthOptions): number => {
  const intervalMs = options.intervalMs ?? defaultIntervalMs;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0)
    throw new RangeError("Runtime health interval must be greater than zero");
  return intervalMs;
};

/** Start a scoped timer-lateness sampler when the diagnostics sink opted into tracing. */
export const health = (options: HealthOptions = {}): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const observer = yield* sink;
    if (observer?.tracing !== true) return;
    const intervalMs = yield* Effect.sync(() => checkedInterval(options));
    const placement = yield* location;
    let expected = performance.now() + intervalMs;
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.sleep(intervalMs).pipe(
          Effect.andThen(
            Effect.sync(() => {
              const now = performance.now();
              observer.emit({
                _tag: "RuntimeSample",
                delayMs: Math.max(0, now - expected),
                intervalMs,
                ...placementOf(placement),
              });
              expected = now + intervalMs;
            }),
          ),
        ),
      ),
    );
  });

/** Opt-in trace observations and the scoped health sampler for one Effect runtime. */
export const instrument = <A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | Scope.Scope> =>
  Effect.gen(function* () {
    const observer = yield* sink;
    if (observer?.tracing !== true) return yield* program;
    yield* health();
    const placement = yield* location;
    const current = yield* Effect.tracer;
    return yield* Effect.withTracer(program, observedTracer(current, observer.emit, placement));
  });
