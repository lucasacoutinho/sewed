import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Context, Effect, Exit, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.Unknown }, success: Schema.Unknown }),
);

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  "capability-dispatch/Greeting",
) {}

const metadataFor = (rpc: unknown) => ({
  rpc,
  requestId: "1",
  headers: {},
  client: undefined,
});

describe("handler entries", () => {
  it("resolves one entry per rpc key and invokes it with the payload", async () => {
    const handlers = Protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) });
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const services = yield* Layer.build(handlers);
          const rpc = Protocol.requests.get("echo")!;
          const entry = Context.getOrUndefinedUnsafe(services, rpc.key);
          assert.ok(entry, "an entry exists under the rpc key");
          const payload = { value: { marker: {} } };
          return yield* entry.handler(payload, {
            rpc,
            requestId: "1",
            headers: {},
            client: undefined,
          }) as Effect.Effect<unknown>;
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
          const rpc = Protocol.requests.get("echo")!;
          const entry = Context.getOrUndefinedUnsafe(services, rpc.key);
          assert.ok(entry, "an entry exists under the rpc key");
          const call = () =>
            entry.handler({ value: "world" }, metadataFor(rpc)) as Effect.Effect<unknown>;
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
