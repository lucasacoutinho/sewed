import { Effect, Stream } from "effect";
import type { Rpc } from "effect/rpc";
import * as Binding from "../Binding.ts";
import type { Operations } from "../Capability.ts";
import { ClientContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

// The client environment is read once, here, while the layer builds, and provided around every
// call. Each call also runs in a scope of its own, closed when the call ends — or, for a stream,
// when the stream does — so a per-call connection is released on time and the operation itself
// asks its caller for nothing.
export const operations = <Rpcs extends Rpc.Any>(
  slot: Binding.Slot<Rpcs>,
  options: { readonly connection?: Binding.Connection },
): Effect.Effect<Operations<Rpcs>, never, ClientContext> =>
  Effect.gen(function* () {
    const runtime = yield* ClientContext;
    const deferred = yield* Binding.deferred(slot, options);
    const table = Binding.table(deferred);
    return Binding.methods<Rpcs, Operations<Rpcs>>(slot.protocol, (tag) => (input) => {
      const method = table[tag];
      if (method === undefined) {
        return Effect.fail(
          new SewedError({ code: "Protocol", message: `Capability ${slot.key} has no ${tag}` }),
        );
      }
      const result = method(input);
      return Effect.isEffect(result)
        ? Effect.scoped(result.pipe(Effect.provideService(ClientContext, runtime)))
        : Stream.scoped(Stream.provideService(result, ClientContext, runtime));
    });
  });
