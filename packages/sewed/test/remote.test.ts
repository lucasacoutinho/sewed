import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Schema,
  Scope,
  Stream,
} from "effect";
import * as Headers from "effect/http/Headers";
import { Rpc, RpcClient, RpcGroup, RpcMiddleware } from "effect/rpc";
import * as Binding from "../src/Binding.ts";
import * as Remote from "../src/Remote.ts";
import * as Testing from "../src/Testing.ts";
import { SewedError } from "../src/SewedError.ts";
import type { ClientContext } from "../src/RuntimeContext.ts";
import type { HandlerServices } from "../src/Runtime.ts";
import type { Connection } from "../src/internal/Transport.ts";

class AcquisitionFailure extends Schema.TaggedError<AcquisitionFailure>()(
  "RemoteTestAcquisitionFailure",
  {
    message: Schema.String,
  },
) {}

class MethodFailure extends Schema.TaggedError<MethodFailure>()("RemoteTestMethodFailure", {
  message: Schema.String,
}) {}

class ResourceState extends Context.Service<
  ResourceState,
  { readonly id: number; readonly path: string }
>()("remote-test/ResourceState") {}

class AuthMarker extends Context.Service<AuthMarker, { readonly value: string }>()(
  "remote-test/AuthMarker",
) {}

class ResourceAuth extends RpcMiddleware.Service<
  ResourceAuth,
  { readonly requires: ResourceState; readonly provides: AuthMarker }
>()("remote-test/ResourceAuth") {}

const Methods = RpcGroup.make(
  Rpc.make("read", {
    payload: { suffix: Schema.String },
    success: Schema.String,
  }).middleware(ResourceAuth),
  Rpc.make("wait", {
    success: Schema.String,
  }).middleware(ResourceAuth),
  Rpc.make("events", {
    success: Schema.Finite,
    stream: true,
  }).middleware(ResourceAuth),
  Rpc.make("reject", {
    error: MethodFailure,
  }).middleware(ResourceAuth),
);

const Definition = Remote.make({
  payload: Schema.Struct({ path: Schema.String }),
  protocol: Methods,
  error: AcquisitionFailure,
});
const Readers = Binding.slot("remote-test/readers", Definition.protocol);
type WireRpcs = RpcGroup.Rpcs<typeof Definition.protocol>;
type RemoteHandlers = Layer.Layer<
  HandlerServices<WireRpcs>,
  AcquisitionFailure | SewedError,
  Rpc.ServicesServer<WireRpcs>
>;

type Stats = {
  created: number;
  cleaned: number;
  cleanupStarted: Deferred.Deferred<void>;
  allowCleanup: Deferred.Deferred<void>;
  buildStarted: Deferred.Deferred<void>;
  allowBuild: Deferred.Deferred<void>;
  waitStarted: Deferred.Deferred<void>;
  waitCalls: number;
  streamHeader: string | undefined;
};

const fixture = (
  delayedCleanup = false,
): { readonly handlers: RemoteHandlers; readonly stats: Stats } => {
  let nextId = 0;
  const stats: Stats = {
    created: 0,
    cleaned: 0,
    cleanupStarted: Deferred.makeUnsafe<void>(),
    allowCleanup: Deferred.makeUnsafe<void>(),
    buildStarted: Deferred.makeUnsafe<void>(),
    allowBuild: Deferred.makeUnsafe<void>(),
    waitStarted: Deferred.makeUnsafe<void>(),
    waitCalls: 0,
    streamHeader: undefined,
  };
  if (!delayedCleanup) Deferred.doneUnsafe(stats.allowCleanup, Effect.void);
  const handlers: RemoteHandlers = Remote.layer(Definition, ({ path }) => {
    const stateLayer = Layer.effect(
      ResourceState,
      Effect.acquireRelease(
        Effect.sync(() => {
          const state = { id: ++nextId, path };
          stats.created += 1;
          return state;
        }),
        () =>
          Deferred.succeed(stats.cleanupStarted, undefined).pipe(
            Effect.andThen(delayedCleanup ? Deferred.await(stats.allowCleanup) : Effect.void),
            Effect.tap(() =>
              Effect.sync(() => {
                stats.cleaned += 1;
              }),
            ),
          ),
      ),
    );
    const auth = Layer.succeed(ResourceAuth, (effect, options) =>
      Effect.sync(() => {
        if (options.rpc._tag === "events") {
          stats.streamHeader = Option.getOrUndefined(Headers.get(options.headers, "x-remote-test"));
        }
      }).pipe(
        Effect.andThen(
          Effect.flatMap(ResourceState, (state) =>
            Effect.provideService(effect, AuthMarker, {
              value: `authorized:${state.path}:${state.id}`,
            }),
          ),
        ),
      ),
    );
    const methodLayer = Methods.toLayer(
      Effect.gen(function* () {
        if (path === "pending") {
          yield* Deferred.succeed(stats.buildStarted, undefined);
          yield* Deferred.await(stats.allowBuild);
        }
        const state = yield* ResourceState;
        if (path === "reject") {
          return yield* new AcquisitionFailure({ message: "resource rejected" });
        }
        return {
          read: ({ suffix }) => Effect.map(AuthMarker, (marker) => `${marker.value}:${suffix}`),
          wait: () =>
            Effect.gen(function* () {
              stats.waitCalls += 1;
              if (stats.waitCalls === 32) {
                yield* Deferred.succeed(stats.waitStarted, undefined);
              }
              return yield* Effect.never;
            }),
          events: () => Stream.fromEffectRepeat(Effect.succeed(state.id)),
          reject: () => Effect.fail(new MethodFailure({ message: "method failed" })),
        };
      }),
    );
    return Layer.mergeAll(methodLayer.pipe(Layer.provideMerge(stateLayer)), auth);
  });
  return { handlers, stats };
};

const provideReader = <A, E>(
  program: Effect.Effect<A, E, ClientContext | Scope.Scope>,
  handlers: ReturnType<typeof fixture>["handlers"],
): Effect.Effect<A, E | AcquisitionFailure | SewedError, Scope.Scope> =>
  program.pipe(Effect.provide(Testing.layer(Readers, handlers)));

const allowCleanup = (stats: Stats) => Deferred.succeed(stats.allowCleanup, undefined);

test("Remote acquisitions keep separate resource contexts and release finalizers", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const first = yield* Remote.acquire(Definition, Readers, { path: "first" });
          const second = yield* Remote.acquire(Definition, Readers, { path: "second" });
          assert.equal(yield* first.client.read({ suffix: "x" }), "authorized:first:1:x");
          assert.equal(yield* second.client.read({ suffix: "y" }), "authorized:second:2:y");
          const methodError = yield* first.client.reject().pipe(Effect.flip);
          assert.ok(methodError instanceof MethodFailure);
          yield* first.release;
          yield* second.release;
          yield* allowCleanup(current.stats);
        }),
        current.handlers,
      ),
    ),
  );
  assert.equal(current.stats.created, 2);
  assert.equal(current.stats.cleaned, 2);
});

test("Remote acquisition errors close the pending resource scope", async () => {
  const current = fixture();
  await assert.rejects(
    () =>
      Effect.runPromise(
        Effect.scoped(
          provideReader(
            Effect.gen(function* () {
              yield* Remote.acquire(Definition, Readers, { path: "reject" });
            }),
            current.handlers,
          ),
        ),
      ),
    (cause: unknown) => {
      assert.ok(cause instanceof AcquisitionFailure || cause instanceof SewedError);
      return true;
    },
  );
  await Effect.runPromise(allowCleanup(current.stats));
  assert.equal(current.stats.created, 1);
  assert.equal(current.stats.cleaned, 1);
});

test("Remote release interrupts active calls and waits for resource finalizers", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const handle = yield* Remote.acquire(Definition, Readers, { path: "active" });
          const pending = yield* handle.client.wait().pipe(Effect.forkScoped);
          yield* Effect.sleep(20);
          const release = yield* handle.release.pipe(Effect.forkScoped);
          yield* Deferred.await(current.stats.cleanupStarted);
          const early = release.pollUnsafe();
          assert.equal(early, undefined);
          yield* allowCleanup(current.stats);
          yield* Fiber.join(release);
          const pendingExit = yield* Fiber.await(pending);
          assert.equal(pendingExit._tag, "Failure");
        }),
        current.handlers,
      ),
    ),
  );
  assert.equal(current.stats.cleaned, 1);
});

test("Remote release is idempotent and closes the resource client", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const handle = yield* Remote.acquire(Definition, Readers, { path: "closed" });
          const release = yield* handle.release.pipe(Effect.forkScoped);
          yield* Deferred.await(current.stats.cleanupStarted);
          yield* allowCleanup(current.stats);
          yield* Fiber.join(release);
          yield* handle.release;
          const closed = yield* handle.client.read({ suffix: "after" }).pipe(Effect.flip);
          assert.ok(closed instanceof SewedError);
          assert.equal(closed.code, "Closed");
        }),
        current.handlers,
      ),
    ),
  );
  assert.equal(current.stats.cleaned, 1);
});

test("Remote caller scope cleanup releases before the binding closes", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const handle = yield* Remote.acquire(Definition, Readers, { path: "scope" });
          assert.equal(
            yield* handle.client.read({ suffix: "cleanup" }),
            "authorized:scope:1:cleanup",
          );
        }),
        current.handlers,
      ),
    ),
  );
  assert.equal(current.stats.cleaned, 1);
});

test("Remote explicit release completes while a stream consumer is suspended", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const handle = yield* Remote.acquire(Definition, Readers, { path: "stream" });
          const consumer = yield* Stream.runForEach(
            handle.client.events(),
            () => Effect.never,
          ).pipe(Effect.forkScoped);
          yield* Effect.sleep(50);
          const release = yield* handle.release.pipe(Effect.timeout("2 seconds"));
          assert.equal(release, undefined);
          yield* allowCleanup(current.stats);
          yield* Fiber.interrupt(consumer);
        }),
        current.handlers,
      ),
    ),
  );
  assert.equal(current.stats.cleaned, 1);
});

test("Remote streamed methods preserve caller headers", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const handle = yield* Remote.acquire(Definition, Readers, { path: "stream-headers" });
          const head = yield* Stream.runHead(
            Stream.provideService(
              handle.client.events(),
              RpcClient.CurrentHeaders,
              Headers.fromInput([["x-remote-test", "caller"]]),
            ),
          );
          assert.equal(Option.isSome(head), true);
          assert.equal(current.stats.streamHeader, "caller");
          yield* handle.release;
        }),
        current.handlers,
      ),
    ),
  );
  assert.equal(current.stats.cleaned, 1);
});

test("Remote cancels a pending acquisition while the caller scope remains usable", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const pending = yield* Remote.acquire(Definition, Readers, { path: "pending" }).pipe(
            Effect.forkScoped,
          );
          yield* Deferred.await(current.stats.buildStarted);
          yield* Fiber.interrupt(pending);
          const handle = yield* Remote.acquire(Definition, Readers, { path: "after-pending" });
          assert.equal(
            yield* handle.client.read({ suffix: "usable" }),
            "authorized:after-pending:2:usable",
          );
          yield* handle.release;
          yield* Deferred.succeed(current.stats.allowBuild, undefined);
        }),
        current.handlers,
      ),
    ),
  );
  assert.equal(current.stats.created, 2);
  assert.equal(current.stats.cleaned, 2);
});

test("Remote keeps a release lane available at method saturation", async () => {
  const current = fixture(true);
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const handle = yield* Remote.acquire(Definition, Readers, { path: "saturated" });
          const pending: Array<Fiber.Fiber<string, SewedError>> = [];
          for (let index = 0; index < 62; index += 1) {
            pending.push(yield* handle.client.wait().pipe(Effect.forkScoped));
          }
          yield* Deferred.await(current.stats.waitStarted).pipe(Effect.timeout("2 seconds"));
          yield* Effect.sleep(20);

          const overflow = yield* handle.client
            .wait()
            .pipe(Effect.flip, Effect.timeout("2 seconds"));
          assert.ok(overflow instanceof SewedError);
          assert.equal(overflow.code, "Limit");

          const release = yield* handle.release.pipe(Effect.forkScoped);
          yield* Deferred.await(current.stats.cleanupStarted).pipe(Effect.timeout("2 seconds"));
          assert.equal(release.pollUnsafe(), undefined);
          yield* allowCleanup(current.stats);
          yield* Fiber.join(release).pipe(Effect.timeout("2 seconds"));

          const outcomes = yield* Effect.forEach(pending, (fiber) => Fiber.await(fiber), {
            concurrency: "unbounded",
          }).pipe(Effect.timeout("2 seconds"));
          assert.equal(outcomes.filter((exit) => exit._tag === "Failure").length, 62);

          const reusable = yield* Remote.acquire(Definition, Readers, { path: "reusable" });
          assert.equal(
            yield* reusable.client.read({ suffix: "after-saturation" }),
            "authorized:reusable:2:after-saturation",
          );
          yield* reusable.release;
        }),
        current.handlers,
      ),
    ),
  );
  assert.equal(current.stats.cleaned, 2);
});

test("Remote closes its lease scope when connection setup fails", async () => {
  let closed = false;
  const connection: Connection = {
    send: () => undefined,
    subscribe: () => {
      throw new Error("connection setup failed");
    },
    close: () => undefined,
  };
  const slot = Binding.slot("remote-test/interrupted-connection", Definition.protocol);
  const bound = Binding.makeBound(slot, "interrupted-owner", {
    connect: Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          closed = true;
        }),
      );
      return connection;
    }),
  });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const result = yield* Remote.acquire(Definition, slot, { path: "interrupted" }).pipe(
          Effect.exit,
        );
        assert.equal(result._tag, "Failure");
        assert.equal(closed, true);
      }).pipe(Effect.provide(Layer.provideMerge(Binding.layer([bound]), Testing.main))),
    ),
  );
});

test("Remote rejects cross-client and stale lease headers", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      provideReader(
        Effect.gen(function* () {
          const first = yield* Binding.client(Readers);
          const second = yield* Binding.client(Readers);
          const dynamic = first as unknown as Record<string, (input: unknown) => unknown>;
          const acquire = dynamic["__sewed_remote_acquire"];
          if (typeof acquire !== "function") throw new Error("Remote acquire client is missing");
          const stream = acquire({ path: "headers" }) as Stream.Stream<string, unknown>;
          const tokenReady = Deferred.makeUnsafe<string>();
          const acquisition = yield* Stream.runForEach(stream, (token) =>
            Deferred.succeed(tokenReady, token).pipe(Effect.asVoid),
          ).pipe(Effect.forkScoped);
          const token = yield* Deferred.await(tokenReady);
          const headers = [["x-sewed-remote-lease", token]] as const;
          const crossClient = yield* RpcClient.withHeaders(
            second.read({ suffix: "cross" }),
            headers,
          ).pipe(Effect.flip);
          assert.ok(crossClient instanceof SewedError);
          assert.equal(crossClient.code, "Closed");
          const own = yield* RpcClient.withHeaders(first.read({ suffix: "own" }), headers);
          assert.equal(own, "authorized:headers:1:own");
          const release = dynamic["__sewed_remote_release"];
          if (typeof release !== "function") throw new Error("Remote release client is missing");
          const releaseValue = release(undefined);
          if (!Effect.isEffect(releaseValue)) throw new Error("Remote release client is invalid");
          yield* RpcClient.withHeaders(releaseValue as Effect.Effect<unknown, unknown>, headers);
          yield* Fiber.join(acquisition);
          const stale = yield* RpcClient.withHeaders(first.read({ suffix: "stale" }), headers).pipe(
            Effect.flip,
          );
          assert.ok(stale instanceof SewedError);
          assert.equal(stale.code, "Closed");
        }),
        current.handlers,
      ),
    ),
  );
});

test("Remote owner loss finalizes a lease without recreating it", async () => {
  const current = fixture();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const ownerScope = yield* Scope.fork(yield* Effect.scope, "sequential");
        const owner = yield* Scope.provide(ownerScope)(
          Testing.host(Definition.protocol, current.handlers),
        );
        const call = Effect.gen(function* () {
          const handle = yield* Remote.acquire(Definition, Readers, { path: "owner-loss" });
          yield* Scope.close(ownerScope, Exit.void);
          const failure = yield* handle.client.read({ suffix: "after" }).pipe(Effect.flip);
          assert.ok(failure instanceof SewedError);
          const release = yield* handle.release.pipe(Effect.flip);
          assert.ok(release instanceof SewedError);
        }).pipe(Effect.provide(Binding.layer([Binding.to(Readers, owner)])));
        yield* call;
        yield* allowCleanup(current.stats);
      }).pipe(Effect.provide(Testing.main)),
    ),
  );
  assert.equal(current.stats.cleaned, 1);
});
