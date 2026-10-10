import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Capability from "./Capability.ts";
import { SewedError } from "./SewedError.ts";

const Text = Schema.String.check(Schema.isMinLength(1));

export const Urgency = Schema.Literals(["normal", "critical", "low"]);
export type Urgency = typeof Urgency.Type;
export const Timeout = Schema.Literals(["default", "never"]);
export type Timeout = typeof Timeout.Type;
export const Action = Schema.Struct({ id: Text, text: Text });
export type Action = typeof Action.Type;

export const Options = Schema.Struct({
  title: Text,
  body: Schema.optionalKey(Schema.String),
  subtitle: Schema.optionalKey(Schema.String),
  silent: Schema.optionalKey(Schema.Boolean),
  urgency: Schema.optionalKey(Urgency),
  timeout: Schema.optionalKey(Timeout),
  icon: Schema.optionalKey(Text),
  actions: Schema.optionalKey(Schema.NonEmptyArray(Action)),
  reply: Schema.optionalKey(Schema.Struct({ placeholder: Schema.String })),
  closeButtonText: Schema.optionalKey(Schema.String),
});
export type Options = typeof Options.Type;

export const Event = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("shown") }),
  Schema.Struct({ kind: Schema.Literal("clicked") }),
  Schema.Struct({ kind: Schema.Literal("action"), id: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("replied"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("closed") }),
  Schema.Struct({ kind: Schema.Literal("failed"), message: Schema.String }),
]);
export type Event = typeof Event.Type;

/** One request is one notification: its stream ends when the notification closes, and interrupting the request closes it. */
export const protocol = RpcGroup.make(
  Rpc.make("show", { payload: Options, success: Event, stream: true, error: SewedError }),
);

/**
 * The whole notification surface as one capability: `Notification.native` in `sewed/main` provides
 * it, `Capability.client` reaches it from a document, and `Testing.Notification.memory` stands in
 * for tests. The surface carries no policy; the options are checked on every call.
 */
export const capability = Capability.define("notification", protocol);
