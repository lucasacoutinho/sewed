import { Schema } from "effect";

export const Options = Schema.Struct({ allowFileAccess: Schema.optionalKey(Schema.Boolean) });
export type Options = typeof Options.Type;

export const Info = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  version: Schema.String,
  url: Schema.String,
});
export type Info = typeof Info.Type;
