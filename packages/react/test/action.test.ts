import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Deferred, Effect, Exit, Scope } from "effect";
import { SewedError } from "sewed";
import * as Action from "../src/internal/Action.ts";
import * as Connection from "../src/internal/Connection.ts";
import { emptyRuntime, sourceOf } from "./runtime.ts";

const waitFor = async (predicate: () => boolean, description: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
};

const lifecycle = () => {
  let state: Connection.RuntimeState = { status: "ready" };
  const listeners = new Set<() => void>();
  const store = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    store,
    disconnect: (cause: Cause.Cause<unknown>) => {
      state = { status: "unavailable", cause };
      for (const listener of listeners) listener();
    },
  };
};

const runtime = emptyRuntime;

test("cancel waits for an uninterruptible action fiber before closing its scope", async () => {
  const gate = Deferred.makeUnsafe<void>();
  const events: Array<string> = [];
  let continuedBeforeRelease: boolean | undefined;
  let actionExit: Exit.Exit<unknown, unknown> | undefined;
  const action = Action.make<string, never>(sourceOf(runtime));
  const unsubscribe = action.subscribe(() => undefined);

  action.run(
    () =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const scope = yield* Scope.Scope;
          yield* Scope.addFinalizerExit(scope, (exit) =>
            Effect.sync(() => {
              actionExit = exit;
            }),
          );
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              events.push("acquire");
              return "resource";
            }),
            () =>
              Effect.sync(() => {
                events.push("release");
              }),
          );
          yield* Deferred.await(gate);
          continuedBeforeRelease = events.includes("release");
          events.push("continued");
          return "done";
        }),
      ),
    "latest",
  );

  await waitFor(() => events.includes("acquire"), "action resource acquisition");
  action.cancel();
  assert.deepEqual(action.getSnapshot(), { status: "interrupted" });
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, ["acquire"]);

  Deferred.doneUnsafe(gate, Effect.void);
  await waitFor(() => events.includes("release"), "action resource cleanup");
  assert.deepEqual(events, ["acquire", "continued", "release"]);
  assert.equal(continuedBeforeRelease, false);
  assert.ok(actionExit !== undefined, "the action scope closed");
  assert.ok(actionExit !== undefined && Exit.isFailure(actionExit));
  if (actionExit !== undefined && Exit.isFailure(actionExit))
    assert.equal(Cause.hasInterruptsOnly(actionExit.cause), true);
  assert.deepEqual(action.getSnapshot(), { status: "interrupted" });
  unsubscribe();
});

test("latest coalesces replacements until the prior uninterruptible fiber and scope finish", async () => {
  const gate = Deferred.makeUnsafe<void>();
  const events: Array<string> = [];
  let continuedBeforeRelease: boolean | undefined;
  const action = Action.make<string, never>(sourceOf(runtime));
  const unsubscribe = action.subscribe(() => undefined);

  action.run(
    () =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            events.push("acquire:first");
            return "first";
          }),
          () =>
            Effect.sync(() => {
              events.push("release:first");
            }),
        );
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            yield* Deferred.await(gate);
            continuedBeforeRelease = events.includes("release:first");
            events.push("continued:first");
          }),
        );
        return "first";
      }),
    "latest",
  );

  await waitFor(() => events.includes("acquire:first"), "first action resource");
  const replacements: readonly ["skipped", "also-skipped", "latest"] = [
    "skipped",
    "also-skipped",
    "latest",
  ];
  for (const name of replacements) {
    action.run(
      () =>
        Effect.sync(() => {
          events.push(`acquire:${name}`);
          return name;
        }),
      "latest",
    );
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, ["acquire:first"]);
  assert.deepEqual(action.getSnapshot(), { status: "running" });

  Deferred.doneUnsafe(gate, Effect.void);
  await waitFor(() => action.getSnapshot().status === "success", "latest action completion");
  assert.deepEqual(action.getSnapshot(), { status: "success", value: "latest" });
  assert.deepEqual(events, ["acquire:first", "continued:first", "release:first", "acquire:latest"]);
  assert.equal(continuedBeforeRelease, false);
  unsubscribe();
});

test("unmount returns while an uninterruptible action finishes before its scope closes", async () => {
  const gate = Deferred.makeUnsafe<void>();
  const events: Array<string> = [];
  let continuedBeforeRelease: boolean | undefined;
  const action = Action.make<string, never>(sourceOf(runtime));
  const unsubscribe = action.subscribe(() => undefined);

  action.run(
    () =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            events.push("acquire");
            return "resource";
          }),
          () =>
            Effect.sync(() => {
              events.push("release");
            }),
        );
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            yield* Deferred.await(gate);
            continuedBeforeRelease = events.includes("release");
            events.push("continued");
          }),
        );
        return "done";
      }),
    "latest",
  );

  await waitFor(() => events.includes("acquire"), "action resource acquisition");
  unsubscribe();
  assert.deepEqual(action.getSnapshot(), { status: "idle" });
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, ["acquire"]);

  Deferred.doneUnsafe(gate, Effect.void);
  await waitFor(() => events.includes("release"), "unmounted action cleanup");
  assert.deepEqual(events, ["acquire", "continued", "release"]);
  assert.equal(continuedBeforeRelease, false);
  assert.deepEqual(action.getSnapshot(), { status: "idle" });
});

test("runtime loss closes a live action and publishes Closed after its finalizer", async () => {
  const connection = lifecycle();
  const runtimeFailure = new Error("renderer exited");
  let acquired = 0;
  let released = 0;
  const action = Action.make<string, never>({ runtime, ...connection.store });
  const unsubscribe = action.subscribe(() => undefined);

  action.run(
    () =>
      Effect.acquireRelease(
        Effect.sync(() => {
          acquired += 1;
          return "resource";
        }),
        () =>
          Effect.sync(() => {
            released += 1;
          }),
      ).pipe(Effect.andThen(Effect.never)),
    "latest",
  );
  await waitFor(() => acquired === 1, "action resource acquisition");
  connection.disconnect(Cause.fail(runtimeFailure));
  await waitFor(() => action.getSnapshot().status === "failure", "Closed action failure");

  assert.equal(released, 1);
  assert.equal(acquired, 1);
  const state = action.getSnapshot();
  assert.equal(state.status, "failure");
  if (state.status === "failure") {
    const reason = state.cause.reasons[0];
    assert.ok(reason !== undefined && Cause.isFailReason(reason));
    if (reason !== undefined && Cause.isFailReason(reason)) {
      assert.ok(reason.error instanceof SewedError);
      assert.equal(reason.error.code, "Closed");
      assert.equal(String(reason.error.cause), String(runtimeFailure));
    }
  }
  unsubscribe();
});

test("a failed finalizer blocks a latest replacement and remains observable", async () => {
  let acquired = false;
  let replacementAcquired = false;
  const action = Action.make<string, never>(sourceOf(runtime));
  const unsubscribe = action.subscribe(() => undefined);

  action.run(
    () =>
      Effect.acquireRelease(
        Effect.sync(() => {
          acquired = true;
          return "resource";
        }),
        () => Effect.die("action cleanup failed"),
      ).pipe(Effect.andThen(Effect.never)),
    "latest",
  );
  await waitFor(() => acquired, "action acquisition");
  action.run(
    () =>
      Effect.sync(() => {
        replacementAcquired = true;
        return "replacement";
      }),
    "latest",
  );
  await waitFor(() => action.getSnapshot().status === "failure", "cleanup failure");

  assert.equal(replacementAcquired, false);
  const state = action.getSnapshot();
  assert.equal(state.status, "failure");
  if (state.status === "failure") assert.match(Cause.pretty(state.cause), /action cleanup failed/);
  unsubscribe();
});
