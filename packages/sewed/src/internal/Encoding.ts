import { Context, Option } from "effect";
import type { Rpc, RpcGroup } from "effect/rpc";

export type Encoding = "json" | "binary";
const BinaryEncoding = Context.Service<never, "binary">("sewed/BinaryEncoding");

export const binary = <Rpcs extends Rpc.Any>(protocol: RpcGroup.RpcGroup<Rpcs>) =>
  protocol.annotate(BinaryEncoding, "binary");

export const encodingOf = (protocol: { readonly annotations: Context.Context<never> }): Encoding =>
  Option.getOrElse(Context.getOption(protocol.annotations, BinaryEncoding), () => "json");
