import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Cause, Effect, Exit, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, SewedError } from "sewed";
import * as Action from "../src/internal/Action.ts";
import type * as Connection from "../src/internal/Connection.ts";
import { RuntimeProvider, useAction, useClient, useResource, useStream } from "../src/index.ts";
import { emptyRuntime, sourceOf } from "./runtime.ts";

const Protocol = RpcGroup.make(
  Rpc.make("read", { payload: { key: Schema.String }, success: Schema.Number }),
  Rpc.make("changes", { success: Schema.Number, stream: true }),
);
const Slot = Binding.slot("hooks-test", Protocol);

const waitFor = async (predicate: () => boolean, description: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
};

/**
 * `renderToString` never calls `useSyncExternalStore`'s `subscribe` (there is no live DOM to
 * react to changes on the server), so the per-hook stores this package builds on `subscribe`
 * (`useStream`, `useAction`, `useResource`) never activate during a server render regardless of
 * whether the runtime is connecting or unavailable: their SSR-visible state is always the same
 * synchronous default (`idle`/`loading`). That default is what these tests pin. The reactive
 * transition into `failure`/`success` as the runtime actually settles is proven where a real
 * subscription exists: `useClient`'s returned operations need no subscription and are exercised
 * directly here; `Resource.make`'s and `Action.make`'s own runtime-flatMap behavior — what
 * `useResource` and `useAction` delegate to — are pinned directly against those modules
 * (`resource.test.ts`'s "a failing runtime yields failure" test, and this file's plain
 * `Action.make` test below); the full connecting → ready, no-remount lifecycle is the
 * playground verifier's job (a real browser over CDP), not a `renderToString` unit test.
 */
type ProtocolRpcs = typeof Slot extends Binding.Slot<infer Rpcs> ? Rpcs : never;
let captured: { readonly client: Binding.Client<ProtocolRpcs> } | undefined;
const renderedHooks = () => {
  assert.ok(captured, "the probe rendered");
  return captured;
};

const Probe = () => {
  const client = useClient(Slot);
  const action = useAction((key: string) => client.read({ key }));
  const stream = useStream(() => client.changes(), [client]);
  const resource = useResource(() => client.read({ key: "resource" }), [client]);
  captured = { client };
  return (
    <div data-action={action.status} data-stream={stream.status} data-resource={resource.status} />
  );
};

const neverStore: Connection.RuntimeStore = {
  subscribe: () => () => {},
  getSnapshot: () => ({ status: "connecting" }),
  close: () => {},
  runtime: Effect.never,
  run: () => new Promise(() => {}),
};

test("renders without throwing while the runtime is connecting: idle and loading", () => {
  captured = undefined;
  const html = renderToString(
    <RuntimeProvider store={neverStore}>
      <Probe />
    </RuntimeProvider>,
  );
  assert.match(html, /data-action="idle"/);
  assert.match(html, /data-stream="loading"/);
  assert.match(html, /data-resource="loading"/);
  assert.ok(captured);
});

test("renders without throwing while the runtime is unavailable: the same idle/loading marks, and useClient fails Closed", async () => {
  captured = undefined;
  const cause = Cause.fail(new Error("no runtime"));
  const unavailableStore: Connection.RuntimeStore = {
    subscribe: () => () => {},
    getSnapshot: () => ({ status: "unavailable", cause }),
    close: () => {},
    runtime: Effect.fail(
      new SewedError({ code: "Closed", message: "The Sewed runtime is unavailable" }),
    ),
    run: () => Promise.reject(new SewedError({ code: "Closed", message: "unavailable" })),
  };
  const connectingHtml = renderToString(
    <RuntimeProvider store={neverStore}>
      <Probe />
    </RuntimeProvider>,
  );
  const unavailableHtml = renderToString(
    <RuntimeProvider store={unavailableStore}>
      <Probe />
    </RuntimeProvider>,
  );
  // Same component, same props, two different runtime stores: an identical render proves no
  // hook was conditionally skipped because of the store's status (React would throw a hook-count
  // mismatch on a real remount otherwise; here it proves the SSR-visible shape never branches).
  assert.equal(unavailableHtml, connectingHtml);
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const context = yield* emptyRuntime;
      return yield* renderedHooks().client.read({ key: "x" }).pipe(Effect.provideContext(context));
    }).pipe(Effect.scoped),
  );
  assert.ok(Exit.isFailure(exit));
  if (Exit.isFailure(exit)) {
    const reason = exit.cause.reasons[0];
    assert.ok(reason !== undefined && Cause.isFailReason(reason));
    if (reason !== undefined && Cause.isFailReason(reason)) {
      assert.ok(reason.error instanceof SewedError && reason.error.code === "Closed");
    }
  }
});

test("useAction's run fails Closed when the runtime it was memoized on is unavailable", async () => {
  const closed = new SewedError({ code: "Closed", message: "The Sewed runtime is unavailable" });
  const store = Action.make<number, never>(sourceOf(Effect.fail(closed)));
  const unsubscribe = store.subscribe(() => undefined);
  store.run(() => Effect.succeed(1), "latest");
  await waitFor(() => store.getSnapshot().status === "failure", "action Closed failure");
  const state = store.getSnapshot();
  assert.equal(state.status, "failure");
  if (state.status === "failure") {
    const reason = state.cause.reasons[0];
    assert.ok(reason !== undefined && Cause.isFailReason(reason));
    if (reason !== undefined && Cause.isFailReason(reason)) {
      assert.ok(reason.error instanceof SewedError && reason.error.code === "Closed");
    }
  }
  unsubscribe();
});
