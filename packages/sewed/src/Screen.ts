import { Schema } from "effect";
import { Bounds } from "./internal/Geometry.ts";

export { Bounds, Point } from "./internal/Geometry.ts";

export const Display = Schema.Struct({
  id: Schema.Finite,
  label: Schema.String,
  bounds: Bounds,
  workArea: Bounds,
  scaleFactor: Schema.Finite,
  rotation: Schema.Finite,
  internal: Schema.Boolean,
});
export type Display = typeof Display.Type;

export const Change = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("added"), display: Display }),
  Schema.Struct({ kind: Schema.Literal("removed"), display: Display }),
  Schema.Struct({
    kind: Schema.Literal("metrics"),
    display: Display,
    metrics: Schema.Array(Schema.String),
  }),
]);
export type Change = typeof Change.Type;
