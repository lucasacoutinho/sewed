import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, Diagnostics, SewedError } from "../lib/index.js";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import { pair, type Connection } from "../lib/internal/Transport.js";
import * as Testing from "../lib/Testing.js";

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
);
const Service = Binding.slot("shared/service", Protocol);

const owner = Effect.gen(function* () {
  const services = yield* Layer.build(
    Protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) }),
  );
  const runtime = yield* server(Protocol, { ownerId: "shared-owner" }).pipe(
    Effect.provideContext(services),
  );
  const accepted: Connection[] = [];
  const handle = makeOwner(
    "shared-owner",
    Protocol,
    {
      connect: scopedConnection(() => {
        const [client, serverSide] = pair();
        accepted.push(serverSide);
        runtime.accept(serverSide);
        return client;
      }),
    },
    {},
  );
  return { handle, accepted };
});

const echo = (client: Binding.Client<RpcGroup.Rpcs<typeof Protocol>>, value: string) =>
  Effect.scoped(client.echo({ value }));

test("a shared deferred client reuses one connection per slot", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const diagnostics = yield* Diagnostics.make();
        const { handle } = yield* owner.pipe(Effect.provide(diagnostics.layer));
        yield* Effect.gen(function* () {
          const shared = yield* Binding.deferred(Service, { connection: "shared" });
          assert.equal(yield* echo(shared, "a"), "a");
          assert.equal(yield* echo(shared, "b"), "b");
          const perCall = yield* Binding.deferred(Service);
          assert.equal(yield* echo(perCall, "c"), "c");
          assert.equal(yield* echo(perCall, "d"), "d");
          const clients = (yield* diagnostics.snapshot).events.flatMap(({ event }) =>
            event._tag === "RequestStarted" && event.ownerId === handle.id ? [event.clientId] : [],
          );
          assert.equal(clients.length, 4);
          assert.equal(clients[0], clients[1]);
          assert.notEqual(clients[2], clients[3]);
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Service, handle)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );
});

test("a shared deferred client replaces a lost connection on its next operation", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { handle, accepted } = yield* owner;
        yield* Effect.gen(function* () {
          const shared = yield* Binding.deferred(Service, { connection: "shared" });
          assert.equal(yield* echo(shared, "a"), "a");
          assert.equal(accepted.length, 1);
          accepted[0]!.close();
          assert.equal(yield* echo(shared, "b"), "b");
          assert.equal(accepted.length, 2);
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Service, handle)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );
});

test("a shared deferred client fails after its runtime closes", async () => {
  const shared = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { handle } = yield* owner;
        return yield* Effect.gen(function* () {
          const client = yield* Binding.deferred(Service, { connection: "shared" });
          assert.equal(yield* echo(client, "a"), "a");
          return client;
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Service, handle)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );
  const failure = await Effect.runPromise(
    Effect.scoped(
      Effect.flip(shared.echo({ value: "late" })).pipe(
        Effect.provide(Binding.layer([])),
        Effect.provide(Testing.main),
      ),
    ),
  );
  assert.ok(failure instanceof SewedError);
  assert.equal(failure.code, "Closed");
});
