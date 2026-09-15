import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Capability } from "sewed";
import * as Testing from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
);

describe("Capability", () => {
  it("names its slot after the capability and keeps the protocol", () => {
    const Calculator = Capability.define("calculator", Protocol);
    assert.equal(Calculator.key, "sewed/binding/calculator");
    assert.equal(Calculator.slot.key, "sewed/binding/calculator");
    assert.equal(Calculator.protocol, Protocol);
  });

  it("serves the capability to a client Layer over a binding", async () => {
    const Calculator = Capability.define("calculator", Protocol);
    const handlers = Protocol.toLayer({ double: ({ value }) => Effect.succeed(value * 2) });
    const program = Effect.gen(function* () {
      const calculator = yield* Calculator;
      return yield* calculator.double({ value: 21 });
    });
    const result = await Effect.runPromise(
      Effect.scoped(
        program.pipe(
          Effect.provide(
            Capability.client(Calculator).pipe(
              Layer.provideMerge(Testing.layer(Calculator.slot, handlers)),
            ),
          ),
        ),
      ),
    );
    assert.equal(result, 42);
  });

  it("opens no connection until an operation runs", async () => {
    const Calculator = Capability.define("calculator", Protocol);
    let connections = 0;
    const handlers = Protocol.toLayer({
      double: ({ value }) => Effect.sync(() => value * 2),
    });
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* Calculator; // acquiring the capability alone must not connect
          assert.equal(connections, 0);
        }).pipe(
          Effect.provide(
            Capability.client(Calculator).pipe(
              Layer.provide(
                Testing.layer(Calculator.slot, handlers, {
                  onConnect: () => {
                    connections += 1;
                  },
                }),
              ),
            ),
          ),
        ),
      ),
    );
  });
});
