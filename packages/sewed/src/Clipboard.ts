import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Binary from "./Binary.ts";
import { SewedError } from "./SewedError.ts";

export const Format = Schema.Literals(["text", "html", "rtf", "image", "bookmark"]);
export type Format = typeof Format.Type;

export const Content = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("html"),
    html: Schema.String,
    text: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal("rtf"), rtf: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("image"), png: Binary.Bytes }),
  Schema.Struct({ kind: Schema.Literal("bookmark"), title: Schema.String, url: Schema.String }),
]);
export type Content = typeof Content.Type;

/** Formats a hosted owner may read and write; anything omitted is denied. */
export const Policy = Schema.Struct({ read: Schema.Array(Format), write: Schema.Array(Format) });
export type Policy = typeof Policy.Type;

export const protocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("read", {
      payload: { format: Format },
      success: Schema.NullOr(Content),
      error: SewedError,
    }),
    Rpc.make("write", { payload: { content: Content }, error: SewedError }),
    Rpc.make("formats", { success: Schema.Array(Format), error: SewedError }),
    Rpc.make("clear", { error: SewedError }),
  ),
);
