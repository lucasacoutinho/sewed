import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Exit, Fiber, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, Diagnostics, SewedError } from "../lib/index.js";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import { pair, type Connection } from "../lib/internal/Transport.js";
import * as Testing from "../lib/Testing.js";
import { waitUntil } from "./wait.ts";

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
          const shared = yield* Binding.deferred(Service);
          assert.equal(yield* echo(shared, "a"), "a");
          assert.equal(yield* echo(shared, "b"), "b");
          const perCall = yield* Binding.deferred(Service, { connection: "per-call" });
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

/**
 * An owner whose connect waits on a gate the test opens, and fails while `failures` lasts: a
 * shared client's build the test can hold open, interrupt around, or make fail.
 */
const gatedOwner = (options: { readonly failures?: number } = {}) =>
  Effect.gen(function* () {
    const services = yield* Layer.build(
      Protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) }),
    );
    const runtime = yield* server(Protocol, { ownerId: "gated-owner" }).pipe(
      Effect.provideContext(services),
    );
    const gate = yield* Deferred.make<void>();
    const counts = { started: 0, connected: 0 };
    let failures = options.failures ?? 0;
    const handle = makeOwner(
      "gated-owner",
      Protocol,
      {
        connect: Effect.gen(function* () {
          counts.started++;
          yield* Deferred.await(gate);
          if (failures > 0) {
            failures--;
            return yield* Effect.fail(new SewedError({ code: "Closed", message: "refused" }));
          }
          return yield* scopedConnection(() => {
            counts.connected++;
            const [client, serverSide] = pair();
            runtime.accept(serverSide);
            return client;
          });
        }),
      },
      {},
    );
    return { handle, gate, counts };
  });

const overGated = <A, E>(
  options: { readonly failures?: number },
  use: (
    shared: Binding.Client<RpcGroup.Rpcs<typeof Protocol>>,
    owner: Effect.Success<ReturnType<typeof gatedOwner>>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gated = yield* gatedOwner(options);
        return yield* Effect.gen(function* () {
          const shared = yield* Binding.deferred(Service);
          return yield* use(shared, gated);
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Service, gated.handle)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );

test("a shared client's build outlives its first caller being interrupted", async () => {
  const result = await overGated({}, (shared, { gate, counts }) =>
    Effect.gen(function* () {
      const first = yield* echo(shared, "first").pipe(Effect.forkScoped);
      yield* Effect.promise(() => waitUntil(() => counts.started === 1, "the build to start"));
      // The first caller goes away mid-build, as a component unmounting mid-connect does.
      yield* Fiber.interrupt(first);
      yield* Deferred.succeed(gate, undefined);
      const second = yield* echo(shared, "second").pipe(Effect.timeoutOption("3 seconds"));
      return { second, counts: { ...counts } };
    }),
  );
  assert.equal(result.second._tag, "Some", "the second call never answered");
  assert.equal(result.second._tag === "Some" ? result.second.value : undefined, "second");
  assert.deepEqual(result.counts, { started: 1, connected: 1 });
});

test("a failed shared build evicts its entry, and the next call builds again", async () => {
  const result = await overGated({ failures: 1 }, (shared, { gate, counts }) =>
    Effect.gen(function* () {
      yield* Deferred.succeed(gate, undefined);
      const first = yield* Effect.exit(echo(shared, "first"));
      const second = yield* echo(shared, "second").pipe(Effect.timeoutOption("3 seconds"));
      return { first, second, counts: { ...counts } };
    }),
  );
  assert.ok(Exit.isFailure(result.first), "the refused build answered");
  assert.equal(result.second._tag === "Some" ? result.second.value : undefined, "second");
  assert.deepEqual(result.counts, { started: 2, connected: 1 });
});

test("two first callers on one slot share one build", async () => {
  const result = await overGated({}, (shared, { gate, counts }) =>
    Effect.gen(function* () {
      const a = yield* echo(shared, "a").pipe(Effect.forkScoped);
      const b = yield* echo(shared, "b").pipe(Effect.forkScoped);
      yield* Effect.promise(() => waitUntil(() => counts.started === 1, "the build to start"));
      yield* Deferred.succeed(gate, undefined);
      const answers = yield* Effect.all([Fiber.join(a), Fiber.join(b)]).pipe(
        Effect.timeoutOption("3 seconds"),
      );
      return { answers, counts: { ...counts } };
    }),
  );
  assert.deepEqual(result.answers._tag === "Some" ? result.answers.value : undefined, ["a", "b"]);
  assert.deepEqual(result.counts, { started: 1, connected: 1 });
});
