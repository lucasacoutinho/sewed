import { Schema } from "effect";

const Arguments = Schema.Array(Schema.String);
export const Request = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("initial"),
    arguments: Arguments,
    workingDirectory: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("file"), path: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("url"), url: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("second-instance"),
    arguments: Arguments,
    workingDirectory: Schema.String,
    additionalData: Schema.Json,
  }),
]);
export type Request = typeof Request.Type;
