import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Fiber, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, ClientContext, SewedError } from "sewed";
import * as Testing from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
);
const Tasks = Binding.slot("pending/tasks", Protocol);
const handlers = Protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) });

test("Binding.pending parks a call until its context resolves, then dispatches", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contextDeferred = yield* Deferred.make<ClientContext["Service"], SewedError>();
        const client = Binding.pending(Tasks, { context: Deferred.await(contextDeferred) });
        const echoBeforeResolution = client.echo;

        const call = yield* client.echo({ value: "later" }).pipe(Effect.forkScoped);
        // The call closes over `context`, an Effect that has not resolved yet: it parks there
        // rather than dispatching. `pollUnsafe` right after the fork is deterministic, not a
        // race — a fiber that suspends on an unresolved Deferred cannot make further progress
        // before this thread of the test yields control back to it, which only happens below.
        assert.equal(
          call.pollUnsafe(),
          undefined,
          "the call parks on its context, not dispatching",
        );

        // The runtime the call is waiting for: the same identity `Testing.layer` already built
        // and provided ambiently, handed to `contextDeferred` only now, well after the fork.
        const context = yield* ClientContext;
        yield* Deferred.succeed(contextDeferred, context);

        assert.equal(yield* Fiber.join(call), "later");
        assert.equal(client.echo, echoBeforeResolution, "one operations object serves every state");
      }).pipe(Effect.provide(Testing.layer(Tasks, handlers))),
    ),
  );
});

test("Binding.pending fails every call Closed when its context Effect has already failed", async () => {
  const closed = new SewedError({ code: "Closed", message: "no runtime yet" });
  const client = Binding.pending(Tasks, { context: Effect.fail(closed) });

  const first = await Effect.runPromise(Effect.flip(client.echo({ value: "a" })));
  const second = await Effect.runPromise(Effect.flip(client.echo({ value: "b" })));

  assert.equal(first, closed);
  assert.equal(second, closed);
});
