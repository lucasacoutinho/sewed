import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Context, Deferred, Effect, Exit, Layer, Queue, Schema, Stream } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";
import { Binding, Capability, SewedError } from "sewed";
import * as Testing from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
);
const EchoProtocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.Unknown }, success: Schema.Unknown }),
);
const FailProtocol = RpcGroup.make(Rpc.make("fail", { payload: {}, error: SewedError }));
const TicksProtocol = RpcGroup.make(
  Rpc.make("ticks", { payload: {}, success: Schema.Unknown, stream: true }),
);
const PairProtocol = RpcGroup.make(
  Rpc.make("left", { payload: {}, success: Schema.Number }),
  Rpc.make("right", { payload: {}, success: Schema.Number }),
);
const LeftProtocol = RpcGroup.make(Rpc.make("left", { payload: {}, success: Schema.Number }));
const LaterProtocol = RpcGroup.make(Rpc.make("later", { payload: {}, success: Schema.Number }));
const CountProtocol = RpcGroup.make(Rpc.make("count", { payload: {}, success: Schema.Number }));

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  "capability/Greeting",
) {}

class Auth extends RpcMiddleware.Service<Auth>()("capability/Auth") {}
const GuardedProtocol = RpcGroup.make(
  Rpc.make("secure", { payload: {}, success: Schema.Number }).middleware(Auth),
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
            // Layer.provide, not provideMerge: the client Layer captures the client environment
            // when it is built, so a call needs nothing of it left in the composed environment.
            Capability.client(Calculator).pipe(
              Layer.provide(Testing.layer(Calculator.slot, handlers)),
            ),
          ),
        ),
      ),
    );
    assert.equal(result, 42);
  });

  it("serves whichever layer provides the capability", async () => {
    const Calculator = Capability.define("calculator", Protocol);
    const handlers = Protocol.toLayer({ double: ({ value }) => Effect.succeed(value * 2) });
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const owner = yield* Capability.serve(Calculator);
          const bound = Binding.to(Calculator.slot, owner);
          return yield* Effect.gen(function* () {
            const calculator = yield* Calculator;
            return yield* calculator.double({ value: 4 });
          }).pipe(
            Effect.provide(Capability.client(Calculator)),
            Effect.provide(Binding.layer([bound])),
          );
        }).pipe(
          Effect.provide(Capability.fromHandlers(Calculator, handlers)),
          Effect.provide(Testing.main),
        ),
      ),
    );
    assert.equal(result, 8);
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

  it("calls handlers in-process without copying the payload", async () => {
    const Echo = Capability.define("echo", EchoProtocol);
    const marker = { instance: true };
    const handlers = EchoProtocol.toLayer({ echo: ({ value }) => Effect.succeed(value) });
    const value = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const echo = yield* Echo;
          return yield* echo.echo({ value: marker });
        }).pipe(Effect.provide(Capability.fromHandlers(Echo, handlers))),
      ),
    );
    assert.equal(
      value,
      marker,
      "the native layer returns the same reference, so nothing was encoded",
    );
  });

  it("keeps handler failures typed", async () => {
    const Failing = Capability.define("failing", FailProtocol);
    const handlers = FailProtocol.toLayer({
      fail: () => Effect.fail(new SewedError({ code: "Protocol", message: "no" })),
    });
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.scoped(
          Effect.gen(function* () {
            const failing = yield* Failing;
            return yield* failing.fail({});
          }).pipe(Effect.provide(Capability.fromHandlers(Failing, handlers))),
        ),
      ),
    );
    assert.equal(exit._tag, "Failure");
  });

  it("streams in-process without copying the values", async () => {
    const Ticks = Capability.define("ticks", TicksProtocol);
    const marker = { instance: true };
    const handlers = TicksProtocol.toLayer({ ticks: () => Stream.make(marker) });
    const values = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const ticks = yield* Ticks;
          return yield* Stream.runCollect(ticks.ticks({}));
        }).pipe(Effect.provide(Capability.fromHandlers(Ticks, handlers))),
      ),
    );
    assert.equal(values.length, 1);
    assert.equal(values[0], marker, "a streamed value keeps its reference too");
  });

  it("names the capability and the method when a handler is missing", async () => {
    const Pair = Capability.define("pair", PairProtocol);
    // The compiler rejects a handler Layer that implements fewer methods than the protocol, so
    // this check is for layers assembled at runtime, where it cannot see the gap.
    const handlers = LeftProtocol.toLayer({ left: () => Effect.succeed(1) });
    const error = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const pair = yield* Pair;
          assert.equal(yield* pair.left({}), 1, "the methods that do have handlers still answer");
          return yield* Effect.flip(pair.right({}));
        }).pipe(Effect.provide(Capability.fromHandlers(Pair, handlers))),
      ),
    );
    assert.equal(error.code, "Protocol");
    assert.equal(error.message, "Capability sewed/binding/pair has no handler for right");
  });

  it("awaits a deferred answer, as the server does", async () => {
    const Later = Capability.define("later", LaterProtocol);
    const handlers = LaterProtocol.toLayer({
      later: () =>
        Effect.sync(() => {
          const deferred = Deferred.makeUnsafe<number>();
          Deferred.doneUnsafe(deferred, Effect.succeed(11));
          return deferred;
        }),
    });
    const value = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const later = yield* Later;
          return yield* later.later({});
        }).pipe(Effect.provide(Capability.fromHandlers(Later, handlers))),
      ),
    );
    assert.equal(value, 11);
  });

  // The handler resolves Greeting when it is called, so it can only come from the context the
  // handler Layer was built with — the caller never has it.
  it("provides the handler Layer's own services to a native call", async () => {
    const Echo = Capability.define("echo", EchoProtocol);
    const handlers = EchoProtocol.toLayer({
      echo: ({ value }) =>
        Effect.map(Greeting, (greeting) => `${greeting.prefix}:${String(value)}`),
    }).pipe(Layer.provide(Layer.succeed(Greeting, { prefix: "hello" })));
    const value = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const echo = yield* Echo;
          return yield* echo.echo({ value: "world" });
        }).pipe(Effect.provide(Capability.fromHandlers(Echo, handlers))),
      ),
    );
    assert.equal(value, "hello:world");
  });

  // RPC middleware is applied by the server that owns the transport, on a path a native call never
  // reaches. Rather than let one capability's two layers behave differently, such a protocol has no
  // capability at all, and the definition is where it says so.
  it("refuses a protocol that declares RPC middleware, at definition", () => {
    assert.throws(
      () => Capability.define("guarded", GuardedProtocol),
      (error: unknown) =>
        error instanceof SewedError &&
        error.code === "Protocol" &&
        error.message ===
          "Capability sewed/binding/guarded declares RPC middleware on secure, " +
            "which a capability cannot apply",
    );
  });

  it("does not refuse a protocol that declares no middleware", async () => {
    const Echo = Capability.define("echo", EchoProtocol);
    const handlers = EchoProtocol.toLayer({ echo: ({ value }) => Effect.succeed(value) });
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.scoped(
          Effect.gen(function* () {
            yield* Echo;
            return "built";
          }).pipe(Effect.provide(Capability.fromHandlers(Echo, handlers))),
        ),
      ),
    );
    assert.deepEqual(exit, Exit.succeed("built"));
  });

  // Nothing on the native path encodes, so nothing validates either: a handler that answers with
  // the wrong shape for its success schema hands that value straight to the caller. The schema
  // still governs what crosses a binding, where the server encodes the answer.
  it("does not check a handler's answer against its success schema", async () => {
    const Counter = Capability.define("counter", CountProtocol);
    const handlers = CountProtocol.toLayer({ count: () => Effect.succeed("twelve") });
    const value = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const counter = yield* Counter;
          return yield* counter.count({});
        }).pipe(Effect.provide(Capability.fromHandlers(Counter, handlers))),
      ),
    );
    assert.equal(value, "twelve");
  });

  // Effect's handler contract also lets a streaming handler answer with an Effect of a Queue. The
  // native path refuses that form rather than converting it, and says so on the stream.
  it("refuses a streaming handler that answers with a queue", async () => {
    const Ticks = Capability.define("ticks", TicksProtocol);
    const handlers = TicksProtocol.toLayer({ ticks: () => Queue.make<unknown>() });
    const error = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const ticks = yield* Ticks;
          return yield* Effect.flip(Stream.runCollect(ticks.ticks({})));
        }).pipe(Effect.provide(Capability.fromHandlers(Ticks, handlers))),
      ),
    );
    assert.equal(error.code, "Protocol");
    assert.equal(
      error.message,
      "Capability sewed/binding/ticks handler for ticks returned no stream",
    );
  });
});
