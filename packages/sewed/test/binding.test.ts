import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding, ClientContext, Diagnostics, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import { pair } from "../lib/internal/Transport.js";

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
);
const Tasks = Binding.slot("pending/tasks", Protocol);
const handlers = Protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) });

// A hand-built owner, the same shape shared-connection.test.ts uses, so per-call diagnostics
// (distinct clientIds) are observable the way Binding.deferred's own per-call test observes them.
const owner = Effect.gen(function* () {
  const services = yield* Layer.build(handlers);
  const runtime = yield* server(Protocol, { ownerId: "pending-percall-owner" }).pipe(
    Effect.provideContext(services),
  );
  const handle = makeOwner(
    "pending-percall-owner",
    Protocol,
    {
      connect: scopedConnection(() => {
        const [client, serverSide] = pair();
        runtime.accept(serverSide);
        return client;
      }),
    },
    {},
  );
  return { handle };
});

const echo = (client: Binding.Client<RpcGroup.Rpcs<typeof Protocol>>, value: string) =>
  Effect.scoped(client.echo({ value }));

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

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const first = yield* Effect.flip(client.echo({ value: "a" }));
        const second = yield* Effect.flip(client.echo({ value: "b" }));
        assert.equal(first, closed);
        assert.equal(second, closed);
      }).pipe(Effect.provide(Testing.layer(Tasks, handlers))),
    ),
  );
});

test("a per-call connection works through Binding.pending, one connection per call", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make();
        const { handle } = yield* owner.pipe(Effect.provide(diagnostics.layer));
        yield* Effect.gen(function* () {
          const context = yield* ClientContext;
          const perCall = Binding.pending(Tasks, {
            context: Effect.succeed(context),
            connection: "per-call",
          });
          assert.equal(yield* echo(perCall, "c"), "c");
          assert.equal(yield* echo(perCall, "d"), "d");
          const clients = (yield* diagnostics.snapshot).events.flatMap(({ event }) =>
            event._tag === "RequestStarted" && event.ownerId === handle.id ? [event.clientId] : [],
          );
          assert.equal(clients.length, 2);
          assert.notEqual(
            clients[0],
            clients[1],
            "each call through pending opens its own connection",
          );
        }).pipe(
          Effect.provide(
            Layer.provideMerge(Binding.layer([Binding.to(Tasks, handle)]), Testing.main),
          ),
        );
      }),
    ),
  );
});

for (const connection of ["shared", "per-call"] as const) {
  test(`${connection} pending calls re-evaluate context when an Effect or Stream is reused`, async () => {
    const protocol = RpcGroup.make(
      Rpc.make("check", { payload: { value: Schema.String }, success: Schema.String }),
      Rpc.make("values", { success: Schema.String, stream: true }),
    );
    const slot = Binding.slot(`pending/reused-${connection}`, protocol);
    const handled: string[] = [];
    const handlers = protocol.toLayer({
      check: ({ value }) =>
        Effect.sync(() => {
          handled.push(`check:${value}`);
          return `accepted:${value}`;
        }),
      values: () =>
        Stream.fromEffect(
          Effect.sync(() => {
            handled.push("values");
            return "first";
          }),
        ).pipe(Stream.concat(Stream.make("last"))),
    });
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* ClientContext;
          const unavailable = new SewedError({
            code: "Closed",
            message: "Context is unavailable",
            reason: "binding-test/context-unavailable",
          });
          let available = true;
          const client = Binding.pending(slot, {
            context: Effect.suspend(() =>
              available ? Effect.succeed(context) : Effect.fail(unavailable),
            ),
            connection,
          });
          const request = Effect.scoped(client.check({ value: "item" }));
          const values = client.values();
          const read = Effect.scoped(Stream.runCollect(values));
          assert.equal(yield* request, "accepted:item");
          assert.deepEqual(yield* read, ["first", "last"]);
          available = false;
          assert.equal(yield* Effect.flip(request), unavailable);
          assert.equal(yield* Effect.flip(read), unavailable);
          assert.deepEqual(handled, ["check:item", "values"]);
          available = true;
          assert.equal(yield* request, "accepted:item");
          assert.deepEqual(yield* read, ["first", "last"]);
          assert.deepEqual(handled, ["check:item", "values", "check:item", "values"]);
        }).pipe(Effect.provide(Testing.layer(slot, handlers))),
      ),
    );
  });
}
