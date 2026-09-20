import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Capability from "./Capability.ts";
import { SewedError } from "./SewedError.ts";
import * as UrlRule from "./UrlRule.ts";
import * as WebRequest from "./WebRequest.ts";

const mailbox = /^[^@\s,;<>]+@[^@\s,;<>]+$/;

/** One exact recipient `openExternal` may address; other recipients never match. */
export const Mailto = Schema.Struct({
  kind: Schema.Literal("mailto"),
  address: Schema.String.check(
    Schema.makeFilter((address) => mailbox.test(address) || "Expected one email address"),
  ),
});
export type Mailto = typeof Mailto.Type;

/**
 * Origins, documents, exact mail recipients, and match patterns that `openExternal` may reach;
 * nothing else opens. A pattern is the same `WebRequest.Pattern` navigation rules use: a wildcard
 * scheme, host, and path — `*`, `*`, `/*` — matches every http or https URL. Because
 * `openExternal` hands the URL straight to the operating system, a pattern's scheme is checked
 * again on top of its own syntax: the shell refuses `<all_urls>` and any scheme other than `*`,
 * `http`, `https`, or one `App.run` registers as standard. `file` is not a pattern scheme: a
 * pattern's path is matched against the URL as written, so a percent-encoded separator reaches it
 * undecoded and could grant a traversal a real path check would refuse. A local file goes through
 * `openPath` or `showItemInFolder` with a configured root instead, or an exact `document` rule
 * that compares one whole URL rather than matching a wildcard against it.
 */
export const Policy = Schema.Array(
  Schema.Union([UrlRule.Origin, UrlRule.Document, Mailto, WebRequest.Pattern]),
);
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
  /** Origins, documents, mail recipients, and match patterns `openExternal` may open. */
  readonly policy: Policy;
  /** Absolute directories whose contents `openPath`, `showItemInFolder`, and `trashItem` may touch. */
  readonly paths?: readonly string[];
}

/**
 * The whole shell surface as one capability: `Shell.native` in `sewed/main` carries the policy,
 * `Capability.client` reaches it from a document, and `Testing.Shell.memory` stands in for tests.
 */
export const capability = Capability.define("shell", protocol);
