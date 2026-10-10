import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Effect, Exit, Schema, Scope } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding, Renderer, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import { store } from "../src/testing.ts";
import { connect, documentStore, RuntimeProvider, useRuntimeStatus } from "../src/index.ts";
import type { RuntimeState } from "../src/index.ts";

const waitFor = async (predicate: () => boolean, description: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
};

const entry = Renderer.entry(new URL("http://localhost/"), { bindings: [] });
const installWindow = (value: object) => {
  Object.defineProperty(globalThis, "window", { value, configurable: true, writable: true });
};
const listeners = { addEventListener: () => {}, removeEventListener: () => {} };
const helloResult = { session: "s1", runtimeId: "r1", tracing: false, bindings: [] };
const bridge = (hello: () => Promise<unknown>) => ({
  ...listeners,
  sewed: {
    hello,
    disconnect: () => {},
    open: async () => undefined,
    observe: async () => undefined,
    send: () => {},
    close: () => {},
    subscribe: () => () => {},
    pathOf: () => "",
  },
});
const closedFailure = (error: unknown) => error instanceof SewedError && error.code === "Closed";

// This file's own module load has registered nothing yet: every other test file gets the same
// clean slate, because `node --test` runs each file in its own process.
test("documentStore() before any connect in this process is the static unavailable store", () => {
  const before = documentStore();
  assert.equal(before.getSnapshot().status, "unavailable");
  assert.equal(
    documentStore(),
    before,
    "documentStore() answers the same store until something connects",
  );
});

test("connect(entry) registers its store as documentStore()'s", () => {
  installWindow({ ...listeners });
  const connected = connect(entry);
  assert.equal(documentStore(), connected);
  connected.close();
});

test("a second connect in one document replaces and closes the first", async () => {
  installWindow(bridge(async () => helloResult));
  const first = connect(entry);
  await waitFor(() => first.getSnapshot().status === "ready", "first ready");
  const second = connect(entry);
  assert.equal(documentStore(), second);
  assert.notEqual(documentStore(), first);
  await waitFor(() => first.getSnapshot().status === "unavailable", "first closed by the second");
  await assert.rejects(first.run(Effect.succeed(1)), closedFailure);
  second.close();
});

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
);
const Slot = Binding.slot("document-test-store", Protocol);
const handlers = Protocol.toLayer({
  echo: ({ value }: { readonly value: string }) => Effect.succeed(value),
});

test("store(bindings) registers itself as documentStore()'s store while open; close() restores what was there", async () => {
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const before = documentStore();
  const desktop = store([Binding.to(Slot, host)]);
  assert.equal(documentStore(), desktop);
  assert.notEqual(documentStore(), before);
  desktop.close();
  assert.equal(documentStore(), before);
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("two nested test stores unwind in order", async () => {
  const outerScope = await Effect.runPromise(Scope.make());
  const outerHost = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(outerScope), Effect.provide(Testing.main)),
  );
  const innerScope = await Effect.runPromise(Scope.make());
  const innerHost = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(innerScope), Effect.provide(Testing.main)),
  );
  const before = documentStore();
  const outer = store([Binding.to(Slot, outerHost)]);
  assert.equal(documentStore(), outer);
  const inner = store([Binding.to(Slot, innerHost)]);
  assert.equal(documentStore(), inner);
  inner.close();
  assert.equal(documentStore(), outer, "closing the inner store restores the outer one");
  outer.close();
  assert.equal(
    documentStore(),
    before,
    "closing the outer store restores what was there before it",
  );
  await Effect.runPromise(Scope.close(outerScope, Exit.void));
  await Effect.runPromise(Scope.close(innerScope, Exit.void));
});

test("stand-ins close in any order: the outer closing first still leaves the inner in front, and the inner closing last restores what was there before either opened", async () => {
  const outerScope = await Effect.runPromise(Scope.make());
  const outerHost = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(outerScope), Effect.provide(Testing.main)),
  );
  const innerScope = await Effect.runPromise(Scope.make());
  const innerHost = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(innerScope), Effect.provide(Testing.main)),
  );
  const before = documentStore();
  const outer = store([Binding.to(Slot, outerHost)]);
  const inner = store([Binding.to(Slot, innerHost)]);
  assert.equal(documentStore(), inner);
  // Out of order: the outer store closes while the inner one is still open.
  outer.close();
  assert.equal(
    documentStore(),
    inner,
    "closing the outer store first must not orphan the still-open inner one",
  );
  inner.close();
  assert.equal(
    documentStore(),
    before,
    "closing the inner store last restores what was there before either opened, not the already-closed outer store",
  );
  await Effect.runPromise(Scope.close(outerScope, Exit.void));
  await Effect.runPromise(Scope.close(innerScope, Exit.void));
});

test("connect() while a test store stands in leaves the stand-in in front, and reaches the new connection once it closes", async () => {
  installWindow(bridge(async () => helloResult));
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const testStore = store([Binding.to(Slot, host)]);
  assert.equal(documentStore(), testStore);
  const connected = connect(entry);
  assert.equal(
    documentStore(),
    testStore,
    "a stand-in open when a new connection lands keeps standing in front of it",
  );
  testStore.close();
  assert.equal(
    documentStore(),
    connected,
    "closing the stand-in reveals the connection it was standing in for, not a stale prior store",
  );
  connected.close();
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("closing a test store twice is a no-op the second time", async () => {
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const before = documentStore();
  const desktop = store([Binding.to(Slot, host)]);
  desktop.close();
  assert.equal(documentStore(), before);
  desktop.close();
  assert.equal(
    documentStore(),
    before,
    "a second close finds nothing left to remove and disturbs nothing",
  );
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("RuntimeProvider without a store prop renders over documentStore()", async () => {
  const scope = await Effect.runPromise(Scope.make());
  const host = await Effect.runPromise(
    Testing.host(Protocol, handlers).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const desktop = store([Binding.to(Slot, host)]);
  let captured: RuntimeState | undefined;
  const Probe = () => {
    captured = useRuntimeStatus();
    return <div data-probe="rendered" />;
  };
  const html = renderToString(
    <RuntimeProvider>
      <Probe />
    </RuntimeProvider>,
  );
  assert.match(html, /data-probe="rendered"/);
  assert.equal(captured?.status, "ready");
  desktop.close();
  await Effect.runPromise(Scope.close(scope, Exit.void));
});
