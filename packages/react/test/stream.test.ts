import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Stream } from "effect";
import { Renderer, SewedError } from "sewed";
import * as Connection from "../src/internal/Connection.ts";
import * as StreamOwner from "../src/internal/Stream.ts";
import { emptyRuntime } from "./runtime.ts";

const waitFor = async (predicate: () => boolean, description: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
};

const entry = Renderer.entry(new URL("http://localhost/"), { bindings: [] });
const listeners = { addEventListener: () => {}, removeEventListener: () => {} };
const helloResult = { session: "s1", runtimeId: "r1", tracing: false, bindings: [] };

const connected = async () => {
  Object.defineProperty(globalThis, "window", {
    value: {
      ...listeners,
      sewed: {
        hello: async () => helloResult,
        disconnect: () => {},
        open: async () => undefined,
        observe: async () => undefined,
        close: () => {},
        subscribe: () => () => {},
        pathOf: () => "",
      },
    },
    configurable: true,
    writable: true,
  });
  const runtime = Connection.connect(entry);
  await waitFor(() => runtime.getSnapshot().status === "ready", "connected renderer runtime");
  return runtime;
};

const storeFor = <A, E>(
  runtime: Connection.RuntimeStore,
  factory: () => Stream.Stream<A, E, import("../src/internal/Action.ts").ActionServices>,
) => StreamOwner.make<A, E>(runtime, factory);

const hasClosed = (cause: Cause.Cause<unknown>): boolean =>
  cause.reasons.some(
    (reason) =>
      Cause.isFailReason(reason) &&
      reason.error instanceof SewedError &&
      reason.error.code === "Closed",
  );

test("stream stores stay inert until subscribed and release their scope on unsubscribe", async () => {
  const runtime = await connected();
  let acquisitions = 0;
  let releases = 0;
  const store = storeFor(runtime, () => {
    acquisitions += 1;
    return Stream.concat(
      Stream.fromEffect(
        Effect.acquireRelease(Effect.succeed("value"), () =>
          Effect.sync(() => {
            releases += 1;
          }),
        ),
      ),
      Stream.never,
    );
  });

  assert.equal(acquisitions, 0);
  const unsubscribe = store.subscribe(() => undefined);
  await waitFor(() => store.getSnapshot().status === "value", "stream value");
  assert.equal(acquisitions, 1);
  unsubscribe();
  await waitFor(() => releases === 1, "stream finalizer on unsubscribe");
  assert.equal(releases, 1);
  assert.deepEqual(store.getSnapshot(), { status: "loading" });
  runtime.close();
});

test("a synchronous unavailable watcher prevents stream factory acquisition", () => {
  const connectionCause = Cause.fail(new Error("renderer was already closed"));
  let factoryRuns = 0;
  let acquisitions = 0;
  let watcherUnsubscribes = 0;
  const store = StreamOwner.make(
    {
      runtime: emptyRuntime,
      getSnapshot: () => ({ status: "unavailable", cause: connectionCause }),
      subscribe: () => () => {
        watcherUnsubscribes += 1;
      },
    },
    () => {
      factoryRuns += 1;
      return Stream.concat(
        Stream.fromEffect(
          Effect.sync(() => {
            acquisitions += 1;
            return "never acquired";
          }),
        ),
        Stream.never,
      );
    },
  );

  const unsubscribe = store.subscribe(() => undefined);
  const state = store.getSnapshot();
  assert.equal(state.status, "failure");
  if (state.status === "failure") assert.equal(hasClosed(state.cause), true);
  assert.equal(factoryRuns, 0);
  assert.equal(acquisitions, 0);
  unsubscribe();
  assert.equal(watcherUnsubscribes, 1);
});

test("runtime closure interrupts a stream after a value and finalizes before Closed", async () => {
  const runtime = await connected();
  let releases = 0;
  const store = storeFor(runtime, () =>
    Stream.concat(
      Stream.fromEffect(
        Effect.acquireRelease(Effect.succeed("value"), () =>
          Effect.sync(() => {
            releases += 1;
          }),
        ),
      ),
      Stream.never,
    ),
  );
  const unsubscribe = store.subscribe(() => undefined);
  await waitFor(() => store.getSnapshot().status === "value", "stream value");

  runtime.close();
  await waitFor(() => store.getSnapshot().status === "failure", "Closed stream failure");

  const state = store.getSnapshot();
  assert.equal(releases, 1);
  assert.equal(state.status, "failure");
  if (state.status === "failure") assert.equal(hasClosed(state.cause), true);
  unsubscribe();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.equal(releases, 1);
});

test("runtime closure preserves a stream cleanup defect with Closed", async () => {
  const runtime = await connected();
  const store = storeFor(runtime, () =>
    Stream.concat(
      Stream.fromEffect(
        Effect.acquireRelease(Effect.succeed("value"), () => Effect.die("stream cleanup defect")),
      ),
      Stream.never,
    ),
  );
  const unsubscribe = store.subscribe(() => undefined);
  await waitFor(() => store.getSnapshot().status === "value", "stream value");

  runtime.close();
  await waitFor(() => store.getSnapshot().status === "failure", "combined stream failure");

  const state = store.getSnapshot();
  assert.equal(state.status, "failure");
  if (state.status === "failure") {
    assert.match(Cause.pretty(state.cause), /stream cleanup defect/);
    assert.equal(hasClosed(state.cause), true);
  }
  unsubscribe();
});
