import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause } from "effect";
import { Renderer } from "sewed";
import { connect } from "../src/index.tsx";

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
