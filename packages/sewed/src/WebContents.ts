import { Schema } from "effect";
import * as UrlRule from "./UrlRule.ts";

export const NavigationPolicy = Schema.Array(UrlRule.Rule);
export type NavigationPolicy = typeof NavigationPolicy.Type;

export const DevToolsOptions = Schema.Struct({
  mode: Schema.optionalKey(Schema.Literals(["left", "right", "bottom", "undocked", "detach"])),
  activate: Schema.optionalKey(Schema.Boolean),
});
export type DevToolsOptions = typeof DevToolsOptions.Type;

export const State = Schema.Union([
  Schema.Struct({ status: Schema.Literal("idle") }),
  Schema.Struct({ status: Schema.Literal("loading"), url: Schema.String }),
  Schema.Struct({
    status: Schema.Literal("ready"),
    url: Schema.String,
    processId: Schema.Number,
  }),
  Schema.Struct({
    status: Schema.Literal("failed"),
    url: Schema.String,
    code: Schema.Number,
    description: Schema.String,
  }),
  Schema.Struct({
    status: Schema.Literal("gone"),
    reason: Schema.String,
    exitCode: Schema.Number,
  }),
]);
export type State = typeof State.Type;

export const Responsiveness = Schema.Union([
  Schema.Struct({ status: Schema.Literal("unknown") }),
  Schema.Struct({
    status: Schema.Literals(["responsive", "unresponsive"]),
    processId: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
]);
export type Responsiveness = typeof Responsiveness.Type;
