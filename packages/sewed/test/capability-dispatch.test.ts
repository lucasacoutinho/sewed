import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Context, Effect, Exit, Layer, Schema } from "effect";
import * as Headers from "effect/http/Headers";
import { Rpc, RpcGroup } from "effect/rpc";
import { RequestId } from "effect/rpc/RpcMessage";

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.Unknown }, success: Schema.Unknown }),
);
type EchoRpc = RpcGroup.Rpcs<typeof Protocol>;
type EchoEntry = Pick<Rpc.Handler<"echo">, "context"> & {
  readonly handler: Rpc.ToHandlerFn<EchoRpc, never>;
};
const entryKey = (rpc: EchoRpc) => Context.Service<Rpc.Handler<"echo">, EchoEntry>(rpc.key);

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  "capability-dispatch/Greeting",
) {}

const metadataFor = (rpc: EchoRpc) => ({
  rpc,
  requestId: RequestId("1"),
  headers: Headers.empty,
  client: new Rpc.ServerClient(0),
});

describe("handler entries", () => {
  it("resolves one entry per rpc key and invokes it with the payload", async () => {
    const handlers = Protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) });
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const services = yield* Layer.build(handlers);
          const rpc = Protocol.requests.get("echo");
          assert.ok(rpc);
          const entry = Context.getOrUndefined(services, entryKey(rpc));
          assert.ok(entry, "an entry exists under the rpc key");
          const payload = { value: { marker: {} } };
          const result = entry.handler(payload, metadataFor(rpc));
          const effect = Rpc.isWrapper(result) ? result.value : result;
          return yield* effect;
        }),
      ),
    );
    assert.deepEqual(result, { marker: {} });
  });

  // A handler that builds its answer from a service resolves that service when it is called, and
  // the entry's own context is the only place it comes from: without it the call fails. (A handler
  // layer built from an Effect closes over its services instead, and needs nothing at call time.)
  // Dispatching in process therefore has to provide entry.context, exactly as RpcServer does.
  it("carries the context its layer was built with, which the handler needs", async () => {
    const handlers = Protocol.toLayer({
      echo: ({ value }) =>
        Effect.map(Greeting, (greeting) => `${greeting.prefix}:${String(value)}`),
    }).pipe(Layer.provide(Layer.succeed(Greeting, { prefix: "hello" })));
    const exits = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const services = yield* Layer.build(handlers);
          const rpc = Protocol.requests.get("echo");
          assert.ok(rpc);
          const entry = Context.getOrUndefined(services, entryKey(rpc));
          assert.ok(entry, "an entry exists under the rpc key");
          const call = () => {
            const result = entry.handler({ value: "world" }, metadataFor(rpc));
            return Rpc.isWrapper(result) ? result.value : result;
          };
          return {
            ambient: yield* Effect.exit(call()),
            provided: yield* Effect.exit(Effect.provideContext(call(), entry.context)),
          };
        }),
      ),
    );
    assert.equal(exits.ambient._tag, "Failure", "the entry's services are not ambient");
    assert.deepEqual(exits.provided, Exit.succeed("hello:world"));
  });
});
