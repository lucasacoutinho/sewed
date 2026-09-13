import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
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
