import { Schema } from "effect";

/** A session's proxy configuration, one mode at a time. */
export const Config = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("direct") }),
  Schema.Struct({ mode: Schema.Literal("system") }),
  Schema.Struct({ mode: Schema.Literal("auto_detect") }),
  Schema.Struct({ mode: Schema.Literal("pac_script"), pacScript: Schema.String }),
  Schema.Struct({
    mode: Schema.Literal("fixed_servers"),
    proxyRules: Schema.String.check(Schema.isMinLength(1)),
    proxyBypassRules: Schema.optionalKey(Schema.String),
  }),
]);
export type Config = typeof Config.Type;
