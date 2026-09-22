import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Effect, Exit, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import { store } from "../src/testing.ts";
import { RuntimeProvider, useClient } from "../src/index.tsx";

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
  Rpc.make("changes", { success: Schema.Number, stream: true }),
);
const Slot = Binding.slot("react-testing-store", Protocol);

const fixture = () => ({
  handlers: Protocol.toLayer({
    echo: ({ value }: { readonly value: string }) => Effect.succeed(value),
    changes: () => Stream.make(1, 2, 3),
  }),
});

test("store(bindings) over Testing.host answers ready at once, with no connecting phase", async () => {
  const current = fixture();
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, current.handlers).pipe(
      Scope.provide(scope),
      Effect.provide(Testing.main),
    ),
  );
  const desktop = store([Binding.to(Slot, host)]);
  assert.equal(desktop.getSnapshot().status, "ready");
  desktop.close();
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("store.run reaches the host, for an Effect-shaped and a stream-shaped operation", async () => {
  const current = fixture();
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, current.handlers).pipe(
      Scope.provide(scope),
      Effect.provide(Testing.main),
    ),
  );
  const desktop = store([Binding.to(Slot, host)]);
  const echoed = await desktop.run(
    Effect.gen(function* () {
      const client = yield* Slot();
      return yield* client.echo({ value: "ping" });
    }),
  );
  assert.equal(echoed, "ping");
  const collected = await desktop.run(
    Effect.gen(function* () {
      const client = yield* Slot();
      return yield* Stream.runCollect(client.changes());
    }),
  );
  assert.deepEqual([...collected], [1, 2, 3]);
  desktop.close();
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("a component rendered with react-dom/server under RuntimeProvider renders without throwing, and useClient reaches the host", async () => {
  const current = fixture();
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, current.handlers).pipe(
      Scope.provide(scope),
      Effect.provide(Testing.main),
    ),
  );
  const desktop = store([Binding.to(Slot, host)]);

  type ProtocolRpcs = typeof Slot extends Binding.Slot<infer Rpcs> ? Rpcs : never;
  let captured: { readonly client: Binding.Client<ProtocolRpcs> } | undefined;
  const Probe = () => {
    const client = useClient(Slot);
    captured = { client };
    return <div data-probe="rendered" />;
  };

  const html = renderToString(
    <RuntimeProvider store={desktop}>
      <Probe />
    </RuntimeProvider>,
  );
  assert.match(html, /data-probe="rendered"/);
  assert.ok(captured, "the component rendered and useClient ran unconditionally");
  // `useClient`'s own client parks each call on the store's runtime; running it here through
  // `desktop.run` (exactly what "outside React" code does per Ruling 2) is what supplies the
  // connected `ClientContext`, proving the SSR-rendered client is wired to the real in-process
  // host, not a detached stand-in.
  const echoed = captured
    ? await desktop.run(captured.client.echo({ value: "over ssr" }))
    : undefined;
  assert.equal(echoed, "over ssr");

  desktop.close();
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("close() closes the store's own scope: run and the runtime fail Closed afterward", async () => {
  let released = false;
  const handlers = Protocol.toLayer(
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          released = true;
        }),
      );
      return {
        echo: ({ value }: { readonly value: string }) => Effect.succeed(value),
        changes: () => Stream.make(1, 2, 3),
      };
    }),
  );
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const desktop = store([Binding.to(Slot, host)]);

  const before = await desktop.run(
    Effect.gen(function* () {
      const client = yield* Slot();
      return yield* client.echo({ value: "before close" });
    }),
  );
  assert.equal(before, "before close");

  desktop.close();
  assert.equal(desktop.getSnapshot().status, "unavailable");
  await assert.rejects(
    desktop.run(Effect.succeed(1)),
    (error: unknown) => error instanceof SewedError && error.code === "Closed",
  );
  const runtimeExit = await Effect.runPromiseExit(desktop.runtime);
  assert.ok(Exit.isFailure(runtimeExit));

  // The host's own services live in the scope `Testing.host` was built in — this test's own
  // `scope`, not the store's. `store.close()` only ever closes the client-side connection scope
  // it owns (proven above: every call through it now fails Closed); the host is released the
  // same way any other `Testing.host` use releases it, by closing the scope that built it.
  await Effect.runPromise(Scope.close(scope, Exit.void));
  assert.equal(released, true, "the host's own scope released when this test closed it");
});

test("onConnect runs once, when the store's context is built", async () => {
  const current = fixture();
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, current.handlers).pipe(
      Scope.provide(scope),
      Effect.provide(Testing.main),
    ),
  );
  let connects = 0;
  const desktop = store([Binding.to(Slot, host)], {
    onConnect: () => {
      connects += 1;
    },
  });
  assert.equal(connects, 1);
  await desktop.run(
    Effect.gen(function* () {
      const client = yield* Slot();
      return yield* client.echo({ value: "a" });
    }),
  );
  await desktop.run(
    Effect.gen(function* () {
      const client = yield* Slot();
      return yield* client.echo({ value: "b" });
    }),
  );
  assert.equal(
    connects,
    1,
    "the store's own context is built once; onConnect does not repeat per call",
  );
  desktop.close();
  await Effect.runPromise(Scope.close(scope, Exit.void));
});
