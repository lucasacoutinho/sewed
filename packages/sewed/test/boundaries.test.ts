import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding } from "../lib/index.js";
import * as Worker from "../lib/WorkerHost.js";
import { host } from "../lib/Host.js";
import { MainContext, mainIdentity } from "../lib/RuntimeContext.js";
import {
  clientProtocol,
  decodeClient,
  encode,
  maxMessageBytes,
} from "../lib/internal/Transport.js";
import { Protocol, Rejected } from "./protocol.mjs";

const Tasks = Binding.slot("tasks", Protocol);
const entry = Worker.entry(new URL("./worker.mjs", import.meta.url), Protocol);
const run = <A, E>(program: Effect.Effect<A, E, MainContext | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(program).pipe(Effect.provideService(MainContext, mainIdentity)));

test(
  "bindings use distinct real worker owners and preserve streamed results",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const first = yield* Worker.spawn(entry);
        const second = yield* Worker.spawn(entry);
        const Other = Binding.slot("other", Protocol);
        yield* Effect.gen(function* () {
          const firstClient = yield* Tasks();
          const secondClient = yield* Other();
          const a = yield* firstClient.info();
          const b = yield* secondClient.info();
          assert.ok(a.thread > 0);
          assert.equal(a.alive, true);
          assert.equal(b.alive, true);
          assert.ok(b.thread > 0);
          assert.notEqual(a.thread, b.thread);
          assert.equal(
            yield* firstClient.echo({ value: "over the boundary" }),
            "over the boundary",
          );
          const error = yield* firstClient.reject().pipe(Effect.flip);
          assert.ok(error instanceof Rejected);
          assert.equal(error.message, "typed failure");
          const values = yield* firstClient.events().pipe(Stream.take(3), Stream.runCollect);
          assert.deepEqual(values, [0, 1, 2]);
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Tasks, first), Binding.to(Other, second)])),
        );
      }),
    );
  },
);

test(
  "interruption reaches the worker and releases the handler without killing its owner",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const worker = yield* Worker.spawn(entry);
        yield* Effect.gen(function* () {
          const client = yield* Tasks();
          const pending = yield* client.wait({ milliseconds: 10000 }).pipe(Effect.forkScoped);
          let active = 0;
          for (let i = 0; i < 100 && active === 0; i++) {
            active = (yield* client.info()).active;
            if (!active) yield* Effect.sleep(10);
          }
          assert.equal(active, 1);
          yield* Fiber.interrupt(pending);
          let info = yield* client.info();
          for (let i = 0; i < 100 && info.released === 0; i++) {
            yield* Effect.sleep(10);
            info = yield* client.info();
          }
          assert.equal(info.active, 0);
          assert.equal(info.released, 1);
          assert.equal(yield* client.echo({ value: "still alive" }), "still alive");
        }).pipe(Effect.provide(Binding.layer([Binding.to(Tasks, worker)])));
      }),
    );
  },
);

test(
  "clients cannot escape their scope or move to another runtime",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const worker = yield* Worker.spawn(entry);
        yield* Effect.gen(function* () {
          const lease = yield* Scope.make();
          const client = yield* Tasks().pipe(Scope.provide(lease));
          const moved = yield* Effect.exit(
            client.info().pipe(Effect.provide(Binding.layer([Binding.to(Tasks, worker)]))),
          );
          assert.equal(moved._tag, "Failure");
          yield* Scope.close(lease, Exit.void);
          const expired = yield* Effect.exit(client.info());
          assert.equal(expired._tag, "Failure");
        }).pipe(Effect.provide(Binding.layer([Binding.to(Tasks, worker)])));
      }),
    );
  },
);

test("binding layers reject duplicate slot names", { timeout: 8000 }, async () => {
  await run(
    Effect.gen(function* () {
      const worker = yield* Worker.spawn(entry);
      const duplicate = Binding.to(Tasks, worker);
      const error = yield* Layer.build(Binding.layer([duplicate, duplicate])).pipe(Effect.flip);
      assert.equal(error.code, "Protocol");
      assert.equal(error.message, "Duplicate binding sewed/binding/tasks");
    }),
  );
});

test(
  "closing a binding layer rejects pending calls and leaves the worker and another layer usable",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const worker = yield* Worker.spawn(entry);
        const lifetime = yield* Effect.scope;
        const layerScope = yield* Scope.fork(lifetime);
        const callerScope = yield* Scope.fork(lifetime);
        const context = yield* Layer.buildWithScope(
          Binding.layer([Binding.to(Tasks, worker)]),
          layerScope,
        );
        const client = yield* Scope.provide(callerScope)(
          Tasks().pipe(Effect.provideContext(context)),
        );
        const otherLayerScope = yield* Scope.fork(lifetime);
        const otherCallerScope = yield* Scope.fork(lifetime);
        const otherContext = yield* Layer.buildWithScope(
          Binding.layer([Binding.to(Tasks, worker)]),
          otherLayerScope,
        );
        const otherClient = yield* Scope.provide(otherCallerScope)(
          Tasks().pipe(Effect.provideContext(otherContext)),
        );
        const pending = yield* Effect.forkIn(
          client
            .wait({ milliseconds: 10000 })
            .pipe(Effect.provideContext(context), Scope.provide(callerScope)),
          callerScope,
        );
        let active = 0;
        for (let i = 0; i < 100 && active === 0; i++) {
          active = (yield* otherClient
            .info()
            .pipe(Effect.provideContext(otherContext), Scope.provide(otherCallerScope))).active;
          if (!active) yield* Effect.sleep(10);
        }
        assert.equal(active, 1);

        yield* Scope.close(layerScope, Exit.void);
        assert.equal((yield* Fiber.await(pending))._tag, "Failure");
        assert.equal(
          (yield* Effect.exit(
            client
              .echo({ value: "closed layer" })
              .pipe(Effect.provideContext(context), Scope.provide(callerScope)),
          ))._tag,
          "Failure",
        );

        let info = yield* otherClient
          .info()
          .pipe(Effect.provideContext(otherContext), Scope.provide(otherCallerScope));
        for (let i = 0; i < 100 && info.released === 0; i++) {
          yield* Effect.sleep(10);
          info = yield* otherClient
            .info()
            .pipe(Effect.provideContext(otherContext), Scope.provide(otherCallerScope));
        }
        assert.equal(info.active, 0);
        assert.equal(info.released, 1);
        assert.equal(info.alive, true);
        assert.equal(
          yield* otherClient
            .echo({ value: "other layer" })
            .pipe(Effect.provideContext(otherContext), Scope.provide(otherCallerScope)),
          "other layer",
        );
        yield* Scope.close(otherCallerScope, Exit.void);
        yield* Scope.close(otherLayerScope, Exit.void);
        yield* Scope.close(callerScope, Exit.void);
      }),
    );
  },
);

test(
  "closing a caller scope releases its connection while the binding layer and worker remain usable",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const worker = yield* Worker.spawn(entry);
        const lifetime = yield* Effect.scope;
        const layerScope = yield* Scope.fork(lifetime);
        const context = yield* Layer.buildWithScope(
          Binding.layer([Binding.to(Tasks, worker)]),
          layerScope,
        );
        const callerScope = yield* Scope.fork(lifetime);
        const client = yield* Scope.provide(callerScope)(
          Tasks().pipe(Effect.provideContext(context)),
        );
        const pending = yield* client
          .wait({ milliseconds: 10000 })
          .pipe(Effect.provideContext(context), Scope.provide(callerScope), Effect.forkScoped);
        let active = 0;
        for (let i = 0; i < 100 && active === 0; i++) {
          active = (yield* client
            .info()
            .pipe(Effect.provideContext(context), Scope.provide(callerScope))).active;
          if (!active) yield* Effect.sleep(10);
        }
        assert.equal(active, 1);

        yield* Scope.close(callerScope, Exit.void);
        assert.equal((yield* Fiber.await(pending))._tag, "Failure");
        assert.equal(
          (yield* Effect.exit(
            client.info().pipe(Effect.provideContext(context), Scope.provide(callerScope)),
          ))._tag,
          "Failure",
        );

        const freshCallerScope = yield* Scope.fork(lifetime);
        const freshClient = yield* Scope.provide(freshCallerScope)(
          Tasks().pipe(Effect.provideContext(context)),
        );
        let info = yield* freshClient
          .info()
          .pipe(Effect.provideContext(context), Scope.provide(freshCallerScope));
        for (let i = 0; i < 100 && info.released === 0; i++) {
          yield* Effect.sleep(10);
          info = yield* freshClient
            .info()
            .pipe(Effect.provideContext(context), Scope.provide(freshCallerScope));
        }
        assert.equal(info.active, 0);
        assert.equal(info.released, 1);
        assert.equal(info.alive, true);
        assert.equal(
          yield* freshClient
            .echo({ value: "caller scope reopened" })
            .pipe(Effect.provideContext(context), Scope.provide(freshCallerScope)),
          "caller scope reopened",
        );
        yield* Scope.close(freshCallerScope, Exit.void);
        yield* Scope.close(layerScope, Exit.void);
      }),
    );
  },
);

test(
  "a failed invocation can close the scope that acquired its RPC client",
  { timeout: 8000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const worker = yield* Worker.spawn(entry);
        const lease = yield* Scope.make();
        const request = Effect.flatMap(Tasks(), (client) => client.reject()).pipe(
          Scope.provide(lease),
          Effect.onExit((exit) => Scope.close(lease, exit)),
          Effect.provide(Binding.layer([Binding.to(Tasks, worker)])),
        );
        assert.equal((yield* Effect.exit(request))._tag, "Failure");
      }),
    );
  },
);

test(
  "worker death rejects pending calls and does not rebind later calls",
  { timeout: 15000 },
  async () => {
    await run(
      Effect.gen(function* () {
        const worker = yield* Worker.spawn(entry);
        yield* Effect.gen(function* () {
          const client = yield* Tasks();
          const pending = yield* client.wait({ milliseconds: 10000 }).pipe(Effect.forkScoped);
          yield* Effect.sleep(40);
          yield* worker.terminate;
          assert.equal((yield* Fiber.await(pending))._tag, "Failure");
          assert.equal((yield* Effect.exit(Tasks()))._tag, "Failure");
          assert.equal((yield* Effect.exit(client.info()))._tag, "Failure");
        }).pipe(Effect.provide(Binding.layer([Binding.to(Tasks, worker)])));
      }),
    );
  },
);

test("transport rejects malformed envelopes and oversized messages", () => {
  assert.throws(() => decodeClient(JSON.stringify({ _tag: "Request", id: 1, tag: "echo" })));
  assert.throws(() => decodeClient(JSON.stringify({ _tag: "surprise" })));
  assert.throws(() => encode("x".repeat(maxMessageBytes)));
  assert.equal(decodeClient('{"_tag":"Ping"}')._tag, "Ping");
});

test(
  "a response received before the client run loop registers is buffered",
  { timeout: 4000 },
  async () => {
    const response = { _tag: "Exit", requestId: 7, exit: { _tag: "Success", value: "early" } };
    const value = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const received = yield* Deferred.make<unknown>();
          let receive: (message: unknown) => void = () => {};
          const transport = yield* clientProtocol({
            send() {
              receive(encode(response));
            },
            close() {},
            subscribe(onMessage) {
              receive = onMessage;
              return () => {};
            },
          });
          yield* transport.send(99, {
            _tag: "Request",
            id: 7,
            tag: "ping",
            payload: null,
            headers: [],
          });
          yield* Effect.sleep(10);
          yield* transport
            .run(99, (packet) => Deferred.succeed(received, packet))
            .pipe(Effect.forkScoped);
          return yield* Deferred.await(received).pipe(Effect.timeout("1 second"));
        }),
      ),
    );
    assert.deepEqual(value, response);
  },
);

test("handler layers are retained for their owner's lifetime", async () => {
  let released = false;
  const protocol = RpcGroup.make(Rpc.make("alive", { success: Schema.Boolean }));
  const handlers = protocol.toLayer(
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          released = true;
        }),
      );
      return { alive: () => Effect.sync(() => !released) };
    }),
  );
  await run(
    Effect.gen(function* () {
      const owner = yield* host(protocol, handlers);
      assert.equal(released, false);
      const slot = Binding.slot("scoped-handler", protocol);
      const result = yield* Effect.flatMap(slot(), (client) => client.alive()).pipe(
        Effect.provide(Binding.layer([Binding.to(slot, owner)])),
      );
      assert.equal(result, true);
    }),
  );
  assert.equal(released, true);
});
