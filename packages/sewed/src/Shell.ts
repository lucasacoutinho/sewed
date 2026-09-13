import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { SewedError } from "./SewedError.ts";
import * as UrlRule from "./UrlRule.ts";

/** Origins and documents that `openExternal` may reach; nothing else opens. */
export const Policy = Schema.Array(UrlRule.Rule);
export type Policy = typeof Policy.Type;

export const OpenResult = Schema.Struct({ opened: Schema.Boolean, message: Schema.String });
export type OpenResult = typeof OpenResult.Type;

export const protocol = RpcGroup.make(
  Rpc.make("openExternal", { payload: { url: Schema.String }, error: SewedError }),
  Rpc.make("openPath", {
    payload: { path: Schema.String },
    success: OpenResult,
    error: SewedError,
  }),
  Rpc.make("showItemInFolder", { payload: { path: Schema.String }, error: SewedError }),
  Rpc.make("trashItem", { payload: { path: Schema.String }, error: SewedError }),
);
