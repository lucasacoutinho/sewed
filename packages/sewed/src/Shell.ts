import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Capability from "./Capability.ts";
import { SewedError } from "./SewedError.ts";
import * as UrlRule from "./UrlRule.ts";

const mailbox = /^[^@\s,;<>]+@[^@\s,;<>]+$/;

/** One exact recipient `openExternal` may address; other recipients never match. */
export const Mailto = Schema.Struct({
  kind: Schema.Literal("mailto"),
  address: Schema.String.check(
    Schema.makeFilter((address) => mailbox.test(address) || "Expected one email address"),
  ),
});
export type Mailto = typeof Mailto.Type;

/** Origins, documents, and exact mail recipients that `openExternal` may reach; nothing else opens. */
export const Policy = Schema.Array(Schema.Union([UrlRule.Origin, UrlRule.Document, Mailto]));
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
  Rpc.make("beep", { payload: {}, error: SewedError }),
);

/**
 * What a shell capability may reach. Every Layer that carries these options checks both before
 * the platform runs, so a served renderer call meets the same rules a main-side call does.
 */
export interface Options {
  /** Origins, documents, and mail recipients `openExternal` may open. */
  readonly policy: Policy;
  /** Absolute directories whose contents `openPath`, `showItemInFolder`, and `trashItem` may touch. */
  readonly paths?: readonly string[];
}

/**
 * The whole shell surface as one capability: `Shell.native` in `sewed/main` carries the policy,
 * `Capability.client` reaches it from a document, and `Testing.Shell.memory` stands in for tests.
 */
export const capability = Capability.define("shell", protocol);
