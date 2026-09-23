import assert from "node:assert/strict";
import { test } from "node:test";
import { Binding, Capability, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import { Cause, Context, Effect, Exit, Fiber, Layer, Schema, Stream } from "effect";
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

test("Testing.client serves a capability over the real JSON path, and refuses what fromHandlers accepts", async () => {
  const Strict = Capability.define(
    "strict",
    RpcGroup.make(Rpc.make("value", { success: Schema.Literal("ok") })),
  );
  const lying = (implement: typeof Strict.protocol.toLayer) =>
    implement({ value: () => Effect.succeed("not ok" as never) });
  const honest = (implement: typeof Strict.protocol.toLayer) =>
    implement({ value: () => Effect.succeed("ok" as const) });
  const program = Effect.gen(function* () {
    const strict = yield* Strict;
    return yield* strict.value();
  });

  const inProcess = await Effect.runPromiseExit(
    program.pipe(Effect.provide(Capability.fromHandlers(Strict, lying))),
  );
  assert.ok(
    Exit.isSuccess(inProcess),
    "fromHandlers proves behaviour only: the value is not encoded",
  );

  const overWire = await Effect.runPromiseExit(
    Effect.scoped(program.pipe(Effect.provide(Testing.client(Strict, lying)))),
  );
  assert.ok(Exit.isFailure(overWire), "Testing.client proves the host's own values encode");
  const overWireCause = Exit.isFailure(overWire) ? overWire.cause : Cause.empty;
  // The owner's own encode of the response against the success schema is what refuses "not ok".
  // It reaches the caller as a defect (Cause.hasDies), not as a typed protocol failure, so a
  // consumer who sees this test learns that shape too: assert on the schema's own rejection
  // text, not on an incidental string any transport failure would also carry.
  assert.ok(
    Cause.hasDies(overWireCause) && !Cause.hasFails(overWireCause),
    "a host value its own success schema forbids dies rather than failing typed",
  );
  assert.match(Cause.pretty(overWireCause), /Expected "ok"/);

  // The control: the same program, over the same Testing.client composition, with a host whose
  // value the schema accepts. This rules out "Testing.client is simply broken" as the reason the
  // lying host's call above failed.
  const honestWire = await Effect.runPromiseExit(
    Effect.scoped(program.pipe(Effect.provide(Testing.client(Strict, honest)))),
  );
  assert.ok(Exit.isSuccess(honestWire), "Testing.client succeeds when the host's value encodes");
  const honestValue = Exit.isSuccess(honestWire) ? honestWire.value : undefined;
  assert.equal(honestValue, "ok");
});

test("a payload the client's own schema refuses fails Protocol, naming the operation and the path, before the host runs", async () => {
  const Strict = Capability.define(
    "strict-payload",
    RpcGroup.make(Rpc.make("value", { payload: { name: Schema.String }, success: Schema.String })),
  );
  let calls = 0;
  const handlers = Strict.protocol.toLayer({
    value: ({ name }) => {
      calls += 1;
      return Effect.succeed(name);
    },
  });

  const error = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const strict = yield* Strict;
        // Bypassing the payload's own type is the point: this is what "the client's own schema
        // refuses" means for a caller that reached past the compiler, exactly as a `*.test.ts`
        // file is allowed to (`as never`).
        return yield* strict.value({ name: undefined as never }).pipe(Effect.flip);
      }).pipe(Effect.provide(Testing.client(Strict, handlers))),
    ),
  );
  assert.ok(error instanceof SewedError);
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /^value: /);
  assert.match(error.message, /\["name"\]/);
  assert.equal(calls, 0, "the host never ran for a payload its own client already refused");
});

test("a payload the client's own schema refuses fails Protocol on a stream-shaped operation, naming the operation and the path, before the host runs", async () => {
  const Strict = Capability.define(
    "strict-stream-payload",
    RpcGroup.make(
      Rpc.make("events", {
        payload: { filter: Schema.String },
        success: Schema.Number,
        stream: true,
      }),
    ),
  );
  let calls = 0;
  const handlers = Strict.protocol.toLayer({
    events: () => {
      calls += 1;
      return Stream.make(1, 2, 3);
    },
  });

  const error = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const strict = yield* Strict;
        // Bypassing the payload's own type is the point, exactly as the Effect-shaped refusal
        // test above does: a stream-shaped operation's payload is checked eagerly, before the
        // Stream value even exists, so the refusal must surface as a typed Stream.fail, not a
        // thrown exception.
        return yield* strict
          .events({ filter: undefined as never })
          .pipe(Stream.runCollect, Effect.flip);
      }).pipe(Effect.provide(Testing.client(Strict, handlers))),
    ),
  );
  assert.ok(error instanceof SewedError);
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /^events: /);
  assert.match(error.message, /\["filter"\]/);
  assert.equal(calls, 0, "the host never ran for a payload its own client already refused");
});

test("a refusal names the schema it violated when the schema carries a title or identifier, and keeps the issue as its cause", async () => {
  // A `Schema.declare` with no annotation formats as the generic "Expected <Declaration>"; one
  // with an `identifier` (a `Schema.Class` reads the same way) should name itself instead.
  const Identified = Schema.declare(
    (value): value is Map<unknown, unknown> => value instanceof Map,
  ).annotate({ identifier: "AnIdentifiedPayload" });
  const Strict = Capability.define(
    "strict-identified-payload",
    RpcGroup.make(Rpc.make("value", { payload: { data: Identified }, success: Schema.String })),
  );
  const handlers = Strict.protocol.toLayer({
    value: () => Effect.succeed("ok"),
  });

  const error = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const strict = yield* Strict;
        return yield* strict.value({ data: "not a map" as never }).pipe(Effect.flip);
      }).pipe(Effect.provide(Testing.client(Strict, handlers))),
    ),
  );
  assert.ok(error instanceof SewedError);
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /^value: /);
  assert.match(error.message, /AnIdentifiedPayload/);
  assert.ok(error.cause !== undefined, "the schema issue is retained as the cause");
});

test("a refusal names a titled Schema.Class field, read back from the declaring struct's own property signature", async () => {
  class Point extends Schema.Class("Point")({ x: Schema.Number, y: Schema.Number }) {}
  const TitledPoint = Point.annotate({ title: "A titled point" });
  const Strict = Capability.define(
    "strict-titled-class-payload",
    RpcGroup.make(Rpc.make("value", { payload: { data: TitledPoint }, success: Schema.String })),
  );
  const handlers = Strict.protocol.toLayer({
    value: () => Effect.succeed("ok"),
  });

  const error = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const strict = yield* Strict;
        return yield* strict.value({ data: "not a point" as never }).pipe(Effect.flip);
      }).pipe(Effect.provide(Testing.client(Strict, handlers))),
    ),
  );
  assert.ok(error instanceof SewedError);
  assert.equal(error.code, "Protocol");
  assert.match(error.message, /^value: /);
  assert.match(error.message, /A titled point/);
  assert.ok(error.cause !== undefined, "the schema issue is retained as the cause");
});

test("a refusal whose name comes from a titled struct around an untitled Schema.declare field replaces the formatter's own <Declaration> placeholder, instead of naming the struct twice", async () => {
  // The bug this pins: `refusalMessage` used to prefix the found name onto the formatter's own
  // text unconditionally, so a schema like this one — its own struct titled, the field that
  // actually fails an untitled `Schema.declare` — read as `"value: A titled container: Expected
  // <Declaration> at [...]"`: the title once, then the formatter's own generic, unfilled-in
  // placeholder right beside it. Fixed, the placeholder itself carries the name instead.
  const Bare = Schema.declare((value): value is Map<unknown, unknown> => value instanceof Map);
  const Container = Schema.Struct({ inner: Bare }).annotate({ title: "A titled container" });
  const Strict = Capability.define(
    "strict-titled-container-field",
    RpcGroup.make(Rpc.make("value", { payload: { data: Container }, success: Schema.String })),
  );
  const handlers = Strict.protocol.toLayer({
    value: () => Effect.succeed("ok"),
  });

  const error = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const strict = yield* Strict;
        return yield* strict.value({ data: { inner: "not a map" } } as never).pipe(Effect.flip);
      }).pipe(Effect.provide(Testing.client(Strict, handlers))),
    ),
  );
  assert.ok(error instanceof SewedError);
  assert.equal(error.code, "Protocol");
  assert.equal(error.message, 'value: Expected A titled container\n  at ["data"]["inner"]');
  assert.ok(error.cause !== undefined, "the schema issue is retained as the cause");
});

test("Testing.client accepts the bare handlers Layer and passes onConnect through", async () => {
  const Calculator = Capability.define(
    "calculator",
    RpcGroup.make(
      Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
    ),
  );
  const handlers = Calculator.protocol.toLayer({
    double: ({ value }) => Effect.succeed(value * 2),
  });
  let connects = 0;
  const results = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const calculator = yield* Calculator;
        const first = yield* calculator.double({ value: 1 });
        const second = yield* calculator.double({ value: 2 });
        return [first, second];
      }).pipe(
        Effect.provide(
          Testing.client(Calculator, handlers, {
            onConnect: () => {
              connects += 1;
            },
          }),
        ),
      ),
    ),
  );
  assert.deepEqual(results, [2, 4]);
  assert.equal(connects, 1, "two calls under one scope share one connection");
});
