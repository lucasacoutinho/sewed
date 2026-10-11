import { Schema } from "effect";

export const Mode = Schema.Literals([
  "record-until-full",
  "record-continuously",
  "record-as-much-as-possible",
  "trace-to-console",
]);
export type Mode = typeof Mode.Type;

export const Options = Schema.Struct({
  included: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  excluded: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  mode: Schema.optionalKey(Mode),
  bufferKb: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  argumentFilter: Schema.optionalKey(Schema.Boolean),
});
export type Options = typeof Options.Type;

export const BufferUsage = Schema.Struct({ value: Schema.Finite, percentage: Schema.Finite });
export type BufferUsage = typeof BufferUsage.Type;

/** Which processes record heap allocations into a trace, and how often they sample. */
export const HeapProfiling = Schema.Struct({
  mode: Schema.optionalKey(
    Schema.Literals([
      "all",
      "browser",
      "gpu",
      "minimal",
      "renderer-sampling",
      "all-renderers",
      "utility-sampling",
      "all-utilities",
      "utility-and-browser",
    ]),
  ),
  /** Bytes between samples, on average. */
  samplingRate: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
});
export type HeapProfiling = typeof HeapProfiling.Type;
