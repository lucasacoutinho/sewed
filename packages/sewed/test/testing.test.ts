import assert from "node:assert/strict";
import { test } from "node:test";
import { Binding } from "sewed";
import * as Testing from "sewed/testing";
import { Context, Effect, Fiber, Layer, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

class Rejected extends Schema.TaggedError<Rejected>()("TestingRejected", {
  message: Schema.String,
}) {}

const Protocol = RpcGroup.make(
  Rpc.make("echo", {
    payload: { value: Schema.String },
    success: Schema.String,
  }),
  Rpc.make("reject", { error: Rejected }),
  Rpc.make("status", {
    success: Schema.Struct({
      active: Schema.Number,
      released: Schema.Number,
      alive: Schema.Boolean,
    }),
  }),
  Rpc.make("events", { success: Schema.Number, stream: true }),
);
const Tasks = Binding.slot("testing", Protocol);

class Business extends Context.Service<Business, { readonly prefix: string }>()(
  "testing/Business",
) {}

const business = Layer.succeed(Business, { prefix: "business" });

const fixture = () => {
  let active = 0;
  let released = 0;
  let ownerReleased = false;

  const handlers = Protocol.toLayer(
    Effect.gen(function* () {
      const service = yield* Business;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          ownerReleased = true;
        }),
      );
      return {
        echo: ({ value }) => Effect.succeed(`${service.prefix}:${value}`),
        reject: () => Effect.fail(new Rejected({ message: "typed failure" })),
        status: () => Effect.succeed({ active, released, alive: !ownerReleased }),
        events: () =>
          Stream.unwrap(
            Effect.acquireRelease(
              Effect.sync(() => {
                active += 1;
              }),
              () =>
                Effect.sync(() => {
                  active -= 1;
                  released += 1;
                }),
            ).pipe(Effect.map(() => Stream.never)),
          ),
      };
    }),
  );

  return {
    handlers,
    ownerReleased: () => ownerReleased,
  };
};

test("Testing.host exposes a real in-process owner through public modules", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Testing.host(Protocol, current.handlers);
        yield* Effect.gen(function* () {
          const client = yield* Tasks();
          assert.equal(yield* client.echo({ value: "host" }), "business:host");
        }).pipe(Effect.provide(Binding.layer([Binding.to(Tasks, owner)])));
      }).pipe(Effect.provide(Testing.main), Effect.provide(business)),
    ),
  );
});

test("Testing.layer runs successful and typed-error calls through the public RPC path", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Tasks();
        assert.equal(yield* client.echo({ value: "call" }), "business:call");
        const error = yield* client.reject().pipe(Effect.flip);
        assert.ok(error instanceof Rejected);
        assert.equal(error.message, "typed failure");
      }).pipe(Effect.provide(Testing.layer(Tasks, current.handlers)), Effect.provide(business)),
    ),
  );
});

test("stream interruption releases a handler while the in-process owner stays usable", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Tasks();
        const pending = yield* client.events().pipe(Stream.runDrain, Effect.forkScoped);
        let status = yield* client.status();
        for (let attempt = 0; attempt < 100 && status.active === 0; attempt += 1) {
          yield* Effect.sleep(10);
          status = yield* client.status();
        }
        assert.equal(status.active, 1);

        yield* Fiber.interrupt(pending);
        status = yield* client.status();
        for (let attempt = 0; attempt < 100 && status.released === 0; attempt += 1) {
          yield* Effect.sleep(10);
          status = yield* client.status();
        }
        assert.equal(status.active, 0);
        assert.equal(status.released, 1);
        assert.equal(status.alive, true);
        assert.equal(
          yield* client.echo({ value: "after cancellation" }),
          "business:after cancellation",
        );
      }).pipe(Effect.provide(Testing.layer(Tasks, current.handlers)), Effect.provide(business)),
    ),
  );
});

test("Testing.layer releases its handler layer when the surrounding scope closes", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Tasks();
        assert.equal(yield* client.echo({ value: "cleanup" }), "business:cleanup");
      }).pipe(Effect.provide(Testing.layer(Tasks, current.handlers)), Effect.provide(business)),
    ),
  );
  assert.equal(current.ownerReleased(), true);
});
