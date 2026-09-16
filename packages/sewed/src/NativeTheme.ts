import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Capability from "./Capability.ts";
import { SewedError } from "./SewedError.ts";

export const Source = Schema.Literals(["system", "light", "dark"]);
export type Source = typeof Source.Type;

export const State = Schema.Struct({
  source: Source,
  shouldUseDarkColors: Schema.Boolean,
  shouldUseHighContrastColors: Schema.Boolean,
  shouldUseInvertedColorScheme: Schema.Boolean,
  inForcedColorsMode: Schema.Boolean,
  prefersReducedTransparency: Schema.Boolean,
});
export type State = typeof State.Type;

export const protocol = RpcGroup.make(
  Rpc.make("state", { success: State, stream: true, error: SewedError }),
  Rpc.make("setSource", { payload: { source: Source }, error: SewedError }),
);

/**
 * What a theme capability may do. Every Layer that carries these options checks before the
 * platform runs, so a served renderer call meets the same rules a main-side call does.
 */
export interface Options {
  /** Whether callers may change the theme source; observing is always allowed. */
  readonly allowSetSource?: boolean;
}

/**
 * The whole theme surface as one capability: `NativeTheme.native` in `sewed/main` carries the
 * options, `Capability.client` reaches it from a document, and `Testing.NativeTheme.memory`
 * stands in for tests.
 */
export const capability = Capability.define("native-theme", protocol);
