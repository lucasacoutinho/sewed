import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Context, Effect } from "effect";
import { Renderer, RendererContext, SewedError } from "sewed";
import { connect } from "../src/index.ts";

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

test("a page without the Sewed preload reports unavailable with its cause", async () => {
  installWindow({ ...listeners });
  const store = connect(entry);
  await waitFor(() => store.getSnapshot().status === "unavailable", "unavailable state");
  const state = store.getSnapshot();
  assert.equal(state.status, "unavailable");
  if (state.status === "unavailable")
    assert.match(Cause.pretty(state.cause), /Sewed preload is missing/);
});

test("a bound page reports ready, notifies subscribers, and disconnects when closed", async () => {
  const disconnected: string[] = [];
  installWindow({
    ...listeners,
    sewed: {
      hello: async () => ({ session: "s1", runtimeId: "r1", tracing: false, bindings: [] }),
      disconnect: (session: string) => disconnected.push(session),
      open: async () => undefined,
      observe: async () => undefined,
      send: () => {},
      close: () => {},
      subscribe: () => () => {},
      pathOf: () => "",
    },
  });
  const store = connect(entry);
  assert.equal(store.getSnapshot().status, "connecting");
  let notified = 0;
  const stop = store.subscribe(() => {
    notified += 1;
  });
  await waitFor(() => store.getSnapshot().status === "ready", "ready state");
  assert.ok(notified >= 1, "subscribers hear the ready state");
  store.close();
  await waitFor(() => disconnected.length === 1, "bridge disconnect");
  assert.deepEqual(disconnected, ["s1"]);
  stop();
});

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

test("run executes an effect with the connected renderer runtime", async () => {
  installWindow(bridge(async () => helloResult));
  const store = connect(entry);
  await waitFor(() => store.getSnapshot().status === "ready", "ready state");
  assert.equal(
    await store.run(Effect.andThen(RendererContext, Effect.succeed("renderer"))),
    "renderer",
  );
  await assert.rejects(store.run(Effect.fail(new Error("boom"))), /boom/);
  store.close();
});

test("run waits while the handshake is still in progress", async () => {
  let answer: (value: unknown) => void = () => {};
  let asked = false;
  installWindow(
    bridge(
      () =>
        new Promise((resolve) => {
          asked = true;
          answer = resolve;
        }),
    ),
  );
  const store = connect(entry);
  const pending = store.run(Effect.succeed("after ready"));
  await waitFor(() => asked, "handshake request");
  assert.equal(store.getSnapshot().status, "connecting");
  answer(helloResult);
  assert.equal(await pending, "after ready");
  store.close();
});

test("run rejects with Closed when the page has no Sewed preload", async () => {
  installWindow({ ...listeners });
  const store = connect(entry);
  await assert.rejects(store.run(Effect.succeed(1)), closedFailure);
});

test("run rejects with Closed after the store closes", async () => {
  installWindow(bridge(async () => helloResult));
  const store = connect(entry);
  await waitFor(() => store.getSnapshot().status === "ready", "ready state");
  store.close();
  await waitFor(() => store.getSnapshot().status === "unavailable", "closed state");
  await assert.rejects(store.run(Effect.succeed(1)), closedFailure);
});

test("store.runtime succeeds at once once the store is ready", async () => {
  installWindow(bridge(async () => helloResult));
  const store = connect(entry);
  await waitFor(() => store.getSnapshot().status === "ready", "ready state");
  const context = await Effect.runPromise(store.runtime);
  assert.doesNotThrow(() => Context.get(context, RendererContext));
  store.close();
});

test("store.runtime waits while connecting and succeeds once the handshake resolves", async () => {
  let answer: (value: unknown) => void = () => {};
  let asked = false;
  installWindow(
    bridge(
      () =>
        new Promise((resolve) => {
          asked = true;
          answer = resolve;
        }),
    ),
  );
  const store = connect(entry);
  const pending = Effect.runPromise(store.runtime);
  await waitFor(() => asked, "handshake request");
  assert.equal(store.getSnapshot().status, "connecting");
  answer(helloResult);
  const context = await pending;
  assert.doesNotThrow(() => Context.get(context, RendererContext));
  store.close();
});

test("store.runtime fails Closed with the cause when the store is unavailable", async () => {
  installWindow({ ...listeners });
  const store = connect(entry);
  await assert.rejects(Effect.runPromise(store.runtime), closedFailure);
});

test("run(effect, { signal }) interrupts the fiber it started; the host finalizer runs", async () => {
  installWindow(bridge(async () => helloResult));
  const store = connect(entry);
  await waitFor(() => store.getSnapshot().status === "ready", "ready state");
  let acquired = false;
  let released = false;
  const controller = new AbortController();
  const held = Effect.acquireRelease(
    Effect.sync(() => {
      acquired = true;
      return "resource";
    }),
    () =>
      Effect.sync(() => {
        released = true;
      }),
  ).pipe(Effect.andThen(Effect.never));
  const pending = store.run(held, { signal: controller.signal });
  await waitFor(() => acquired, "resource acquisition");
  controller.abort();
  await assert.rejects(pending, /interrupt/i);
  await waitFor(() => released, "host finalizer");
  store.close();
});

test("run(effect, { signal }) with an already-aborted signal never runs the effect", async () => {
  installWindow(bridge(async () => helloResult));
  const store = connect(entry);
  await waitFor(() => store.getSnapshot().status === "ready", "ready state");
  let ran = false;
  const controller = new AbortController();
  controller.abort();
  const pending = store.run(
    Effect.sync(() => {
      ran = true;
    }),
    { signal: controller.signal },
  );
  await assert.rejects(pending, /interrupt/i);
  assert.equal(ran, false, "the effect's body never ran");
  store.close();
});

test("run(effect, { signal }) removes its abort listener once the fiber settles on its own", async () => {
  installWindow(bridge(async () => helloResult));
  const store = connect(entry);
  await waitFor(() => store.getSnapshot().status === "ready", "ready state");

  // A fake signal, not a real AbortSignal: it never actually aborts, and it only records what
  // run() adds and removes on it — the same shape a long-lived, never-aborted AbortController's
  // signal has across many run() calls over a component's lifetime (a realistic pattern, and the
  // one the leak showed up under: each call left its own listener behind).
  const added: Array<() => void> = [];
  const removed: Array<() => void> = [];
  const signal = {
    aborted: false,
    addEventListener: (_type: string, handler: () => void) => {
      added.push(handler);
    },
    removeEventListener: (_type: string, handler: () => void) => {
      removed.push(handler);
    },
  } as never as AbortSignal;

  await store.run(Effect.succeed(1), { signal });
  assert.equal(added.length, 1, "run registered exactly one abort listener");
  assert.equal(removed.length, 1, "the fiber's own settlement removed it — nothing is left behind");
  assert.equal(
    added[0],
    removed[0],
    "the exact handler that was added is the one removed, so a later abort on this signal " +
      "reaches no fiber: a real EventTarget never invokes a handler once removeEventListener " +
      "named it",
  );
  store.close();
});
