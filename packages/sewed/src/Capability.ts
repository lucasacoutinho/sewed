import { Context, Layer } from "effect";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Binding from "./Binding.ts";
import { ClientContext } from "./RuntimeContext.ts";

export interface Capability<
  Rpcs extends Rpc.Any,
  Key extends string = string,
> extends Context.Service<Capability<Rpcs, Key>, Binding.Client<Rpcs>> {
  readonly key: Key;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly slot: Binding.Slot<Rpcs, Key>;
}

export const define = <const Name extends string, Rpcs extends Rpc.Any>(
  name: Name,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Capability<Rpcs, `sewed/binding/${Name}`> => {
  const slot = Binding.slot(name, protocol);
  const tag = Context.Service<Capability<Rpcs, typeof slot.key>, Binding.Client<Rpcs>>(slot.key);
  return Object.assign(tag, { key: slot.key, protocol, slot });
};

// The capability's methods read ClientContext when they are called, not only while this layer
// builds it. Compose with Layer.provideMerge (not Layer.provide) when those methods will actually
// run: Layer.provide hides ClientContext from the composed environment once this layer is built,
// so a later call fails with "Service not found" even though acquiring the capability succeeded.
export const client = <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
  options: { readonly connection?: Binding.Connection } = {},
): Layer.Layer<Capability<Rpcs, Key>, never, ClientContext> =>
  Layer.effect(capability, Binding.deferred(capability.slot, options));
