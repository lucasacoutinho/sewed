import { Schema } from "effect";

export const Info = Schema.Struct({
  versionId: Schema.Finite,
  scriptUrl: Schema.String,
  scope: Schema.String,
  renderProcessId: Schema.Finite,
});
export type Info = typeof Info.Type;

export const Status = Schema.Literals(["starting", "running", "stopping", "stopped"]);
export type Status = typeof Status.Type;

export const Event = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("registered"), scope: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("status"), versionId: Schema.Finite, status: Status }),
]);
export type Event = typeof Event.Type;

/** A worker that was started, or found running, for a scope. */
export const Started = Schema.Struct({
  versionId: Schema.Finite,
  scope: Schema.String,
  scriptUrl: Schema.String,
});
export type Started = typeof Started.Type;
