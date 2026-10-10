import { Schema } from "effect";

const Coordinate = Schema.Finite.check(Schema.isInt32());
const Dimension = Coordinate.check(Schema.isGreaterThanOrEqualTo(0));

export const Point = Schema.Struct({ x: Coordinate, y: Coordinate });
export type Point = typeof Point.Type;

export const Bounds = Schema.Struct({
  ...Point.fields,
  width: Dimension,
  height: Dimension,
});
export type Bounds = typeof Bounds.Type;
