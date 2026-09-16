import { Context, Effect, Layer } from "effect";
import type { Rpc } from "effect/unstable/rpc";
import * as Binding from "../Binding.ts";
import type { Capability, Operations } from "../Capability.ts";
import { SewedError } from "../SewedError.ts";
import * as CapabilityDispatch from "./CapabilityDispatch.ts";
import type { HandlerLayer } from "./HandlerLayer.ts";

/** One operation a memory capability was asked for, in the order the calls were made. */
export interface Call {
  readonly tag: string;
  readonly payload: unknown;
}

/** What a memory capability recorded. `calls` is a snapshot, so a test can read it repeatedly. */
export class Recorder extends Context.Service<
  Recorder,
  { readonly calls: Effect.Effect<readonly Call[]> }
>()("sewed/CapabilityRecorder") {}

/**
 * The in-memory Layer for a capability: the same dispatch the native Layer uses, over handlers a
 * test supplies, with every call recorded. The recorder observes the operation the caller asked
 * for, before the handler decides it, so a denial is recorded exactly like a call that succeeds.
 */
export const memory = <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability<Rpcs, Key>,
  handlers: HandlerLayer<Rpcs, E, R>,
): Layer.Layer<Capability<Rpcs, Key> | Recorder, E, R> => {
  const calls: Call[] = [];
  const recorded = Layer.effect(
    capability,
    Effect.map(CapabilityDispatch.dispatch(capability.slot, handlers), (operations) => {
      // The same dynamic method table `Binding.methods` and `Binding.table` already are: the tags
      // are only known once the protocol is inspected, so the recorded shape is built, and the
      // dispatched one read, through `unknown`. A missing tag is reported, never asserted away.
      const table = Binding.table<Rpcs, Operations<Rpcs>>(operations);
      return Binding.methods<Rpcs, Operations<Rpcs>>(capability.protocol, (tag, input) => {
        const method = table[tag];
        if (method === undefined) {
          return Effect.fail(
            new SewedError({
              code: "Protocol",
              message: `Capability ${capability.key} has no handler for ${tag}`,
            }),
          );
        }
        calls.push({ tag, payload: input });
        return method(input);
      });
    }),
  );
  return Layer.mergeAll(
    recorded,
    Layer.succeed(Recorder, { calls: Effect.sync(() => [...calls]) }),
  );
};
