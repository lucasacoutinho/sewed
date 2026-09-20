import { Schema } from "effect";

const Arguments = Schema.Array(Schema.String);

/** How this process was launched: its own arguments, or a file or URL the platform handed it. */
export const Request = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("initial"),
    arguments: Arguments,
    workingDirectory: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("file"), path: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("url"), url: Schema.String }),
]);
export type Request = typeof Request.Type;

/**
 * A later launch of the application while this process holds the single-instance lock: the other
 * process's arguments and working directory, and the JSON `data` it claimed with (`null` when it
 * claimed with none). Delivered on `App.Instance`'s `launches`, never on `App.launches`.
 */
export const SecondInstance = Schema.Struct({
  arguments: Arguments,
  workingDirectory: Schema.String,
  additionalData: Schema.Json,
});
export type SecondInstance = typeof SecondInstance.Type;
