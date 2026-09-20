import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Binary from "./Binary.ts";
import * as Capability from "./Capability.ts";
import { SewedError } from "./SewedError.ts";

export const Format = Schema.Literals(["text", "html", "rtf", "image", "bookmark"]);
export type Format = typeof Format.Type;

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG bytes, checked by signature so malformed images never reach the clipboard.
 *
 * A check is a runtime filter and rebuilds the same schema type, so naming that type here loses
 * nothing and keeps every protocol carrying this field readable.
 */
export const Png: Binary.Bytes = Binary.Bytes.check(
  Schema.makeFilter(
    (bytes) =>
      (bytes.length > pngSignature.length &&
        pngSignature.every((byte, index) => bytes[index] === byte)) ||
      "Clipboard image bytes must be a PNG",
  ),
);

export const Content = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("html"),
    html: Schema.String,
    text: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal("rtf"), rtf: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("image"), png: Png }),
  Schema.Struct({ kind: Schema.Literal("bookmark"), title: Schema.String, url: Schema.String }),
]);
export type Content = typeof Content.Type;

/** Formats this capability may read and write; anything omitted is denied. */
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

/**
 * The whole clipboard surface as one capability: `Clipboard.native` in `sewed/main` carries the
 * format policy, `Capability.client` reaches it from a document, and `Testing.Clipboard.memory`
 * stands in for tests.
 */
export const capability = Capability.define("clipboard", protocol);
