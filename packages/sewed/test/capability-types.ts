import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Capability, ClientContext, MainContext } from "sewed";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
);
const Calculator = Capability.define("calculator", Protocol);

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
