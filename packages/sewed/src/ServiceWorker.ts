import { Schema } from "effect";

export const Info = Schema.Struct({
  versionId: Schema.Number,
  scriptUrl: Schema.String,
  scope: Schema.String,
  renderProcessId: Schema.Number,
});
export type Info = typeof Info.Type;

export const Status = Schema.Literals(["starting", "running", "stopping", "stopped"]);
export type Status = typeof Status.Type;

export const Event = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("registered"), scope: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("status"), versionId: Schema.Number, status: Status }),
]);
export type Event = typeof Event.Type;
