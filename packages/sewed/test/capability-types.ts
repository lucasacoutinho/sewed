import { Context, Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Capability, ClientContext, MainContext } from "sewed";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
);
const Calculator = Capability.define("calculator", Protocol);
const OtherProtocol = RpcGroup.make(Rpc.make("other"));

// The capability's shape is the protocol's client shape.
const call = Effect.gen(function* () {
  const calculator = yield* Calculator;
  const value: number = yield* calculator.double({ value: 1 });
  return value;
});
void call;

// The client Layer produces exactly the capability, requiring only a client environment.
const clientLayer: Layer.Layer<typeof Calculator, never, ClientContext> =
  Capability.client(Calculator);
void clientLayer;

// @ts-expect-error A client Layer requires a client environment, not a main one.
const wrong: Layer.Layer<typeof Calculator, never, MainContext> = Capability.client(Calculator);
void wrong;

// The native Layer produces exactly the capability and requires no environment of its own.
const nativeLayer: Layer.Layer<typeof Calculator, never, never> = Capability.fromHandlers(
  Calculator,
  Protocol.toLayer({ double: ({ value }) => Effect.succeed(value * 2) }),
);
void nativeLayer;

class Factor extends Context.Service<Factor, { readonly by: number }>()(
  "capability-types/Factor",
) {}

// What the handlers require stays in the Layer's environment.
const handlerRequirements: Layer.Layer<typeof Calculator, never, Factor> = Capability.fromHandlers(
  Calculator,
  Protocol.toLayer({ double: ({ value }) => Effect.map(Factor, (factor) => value * factor.by) }),
);
void handlerRequirements;

// @ts-expect-error The handlers' own requirements cannot be dropped from the native Layer.
const withoutRequirements: Layer.Layer<typeof Calculator, never, never> = handlerRequirements;
void withoutRequirements;

// @ts-expect-error A handler Layer for a different protocol cannot serve this capability.
Capability.fromHandlers(Calculator, OtherProtocol.toLayer({ other: () => Effect.void }));
