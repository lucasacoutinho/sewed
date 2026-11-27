import { Schema } from "effect";

export const Mode = Schema.Literals([
  "record-until-full",
  "record-continuously",
  "record-as-much-as-possible",
  "trace-to-console",
]);
export type Mode = typeof Mode.Type;

/** Native (C/C++) heap allocation profiling options for a trace recording. */
export const NativeHeapProfiling = Schema.Struct({
  /** Milliseconds between snapshots; 0 writes one snapshot when tracing stops. */
  dumpInterval: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  /** Average bytes allocated between samples; must be greater than 0. */
  samplingInterval: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
});
export type NativeHeapProfiling = typeof NativeHeapProfiling.Type;

export const Options = Schema.Struct({
  included: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  excluded: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  mode: Schema.optionalKey(Mode),
  bufferKb: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  argumentFilter: Schema.optionalKey(Schema.Boolean),
  nativeHeapProfiling: Schema.optionalKey(NativeHeapProfiling),
});
export type Options = typeof Options.Type;

export const BufferUsage = Schema.Struct({ value: Schema.Finite, percentage: Schema.Finite });
export type BufferUsage = typeof BufferUsage.Type;
