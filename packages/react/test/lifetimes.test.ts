import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Cause, Context, Deferred, Effect, Stream } from "effect";
import { SewedError } from "sewed";
import * as Action from "../src/internal/Action.ts";
import * as Connection from "../src/internal/Connection.ts";
import * as Streams from "../src/internal/Stream.ts";
import * as Store from "../src/internal/Store.ts";
import * as Resource from "../src/internal/Resource.ts";
import * as Testing from "../src/testing.ts";
import { sourceOf } from "./runtime.ts";

const testStore = Testing.store([]);
const runtime = testStore.runtime;
after(() => testStore.close());
const waitFor = async (predicate: () => boolean, description: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
};

test("run observes an abort fired by synchronous acquisition before its fiber is returned", async () => {
  const controller = new AbortController();
  let finalized = 0;
  const pending = Connection.runWith(
    testStore,
    Effect.acquireRelease(
      Effect.sync(() => controller.abort()),
      () =>
        Effect.sync(() => {
          finalized++;
        }),
    ).pipe(Effect.andThen(Effect.never)),
    { signal: controller.signal },
  );
  const rejected = assert.rejects(pending, /interrupt/i);
  try {
    await waitFor(() => finalized === 1, "startup abort cleanup");
  } finally {
    // Also terminates the baseline's leaked fiber if the regression fails.
    controller.signal.dispatchEvent(new Event("abort"));
    await rejected;
  }
});

test("an abort during uninterruptible startup waits for the program before closing its scope", async () => {
  const gate = Deferred.makeUnsafe<void>();
  const controller = new AbortController();
  const events: string[] = [];
  const pending = Connection.runWith(
    testStore,
    Effect.acquireRelease(
      Effect.sync(() => {
        events.push("acquire");
        controller.abort();
      }),
      () =>
        Effect.sync(() => {
          events.push("release");
        }),
    ).pipe(Effect.andThen(Deferred.await(gate)), Effect.uninterruptible),
    { signal: controller.signal },
  );
  const rejected = assert.rejects(pending, /interrupt/i);
  assert.deepEqual(events, ["acquire"]);
  Deferred.doneUnsafe(gate, Effect.void);
  await rejected;
  assert.deepEqual(events, ["acquire", "release"]);
});

test("an action can cancel itself during acquisition without leaking its invocation scope", async () => {
  let finalized = 0;
  const action = Action.make<void, never>(testStore);
  const unsubscribe = action.subscribe(() => {});
  try {
    action.run(
      () =>
        Effect.acquireRelease(Effect.void, () =>
          Effect.sync(() => {
            finalized++;
          }),
        ).pipe(Effect.andThen(Effect.sync(() => action.cancel())), Effect.andThen(Effect.never)),
      "latest",
    );
    await waitFor(() => finalized === 1, "self-cancelled action cleanup");
    assert.equal(action.getSnapshot().status, "interrupted");
  } finally {
    unsubscribe();
  }
});

for (const mode of ["latest", "exhaust"] as const) {
  test(`a ${mode} action triggered from the starting invocation obeys its replacement policy`, async () => {
    const events: string[] = [];
    const action = Action.make<string, never>(testStore);
    const unsubscribe = action.subscribe(() => {});
    try {
      action.run(
        () =>
          Effect.acquireRelease(
            Effect.sync(() => {
              events.push("acquire:first");
              return "first";
            }),
            () =>
              Effect.sync(() => {
                events.push("release:first");
              }),
          ).pipe(
            Effect.tap(() =>
              Effect.sync(() =>
                action.run(
                  () =>
                    Effect.sync(() => {
                      events.push("acquire:second");
                      return "second";
                    }),
                  mode,
                ),
              ),
            ),
            Effect.andThen(Effect.never),
          ),
        mode,
      );
      await waitFor(() => events.includes("acquire:first"), "first action acquisition");
      if (mode === "latest") {
        await waitFor(
          () => action.getSnapshot().status === "success",
          "replacement action completion",
        );
        assert.deepEqual(events, ["acquire:first", "release:first", "acquire:second"]);
        assert.deepEqual(action.getSnapshot(), { status: "success", value: "second" });
      } else {
        action.cancel();
        await waitFor(() => events.includes("release:first"), "exhausted action cleanup");
        assert.deepEqual(events, ["acquire:first", "release:first"]);
      }
    } finally {
      unsubscribe();
    }
  });
}

test("a replacement requested by a running-state subscriber is not cancelled by the superseded run", async () => {
  const acquired: string[] = [];
  const action = Action.make<string, never>(testStore);
  let replaced = false;
  const unsubscribe = action.subscribe(() => {
    if (action.getSnapshot().status !== "running" || replaced) return;
    replaced = true;
    action.run(
      () =>
        Effect.sync(() => {
          acquired.push("replacement");
          return "replacement";
        }),
      "latest",
    );
  });
  try {
    action.run(
      () =>
        Effect.sync(() => {
          acquired.push("superseded");
          return "superseded";
        }),
      "latest",
    );
    await waitFor(() => action.getSnapshot().status === "success", "subscriber's replacement");
    assert.deepEqual(acquired, ["replacement"]);
  } finally {
    unsubscribe();
  }
});

test("a run requested by a cancellation subscriber survives that earlier cancellation", async () => {
  const action = Action.make<string, never>(testStore);
  const unsubscribe = action.subscribe(() => {
    if (action.getSnapshot().status !== "interrupted") return;
    action.run(() => Effect.succeed("after cancellation"), "latest");
  });
  try {
    action.cancel();
    await waitFor(() => action.getSnapshot().status === "success", "run after cancellation");
    assert.deepEqual(action.getSnapshot(), { status: "success", value: "after cancellation" });
  } finally {
    unsubscribe();
  }
});

test("runtime loss triggered from an action's factory closes its scope and reports Closed", async () => {
  const desktop = Testing.store([]);
  let finalized = 0;
  const action = Action.make<void, never>(desktop);
  const unsubscribe = action.subscribe(() => {});
  try {
    action.run(
      () =>
        Effect.acquireRelease(Effect.void, () =>
          Effect.sync(() => {
            finalized++;
          }),
        ).pipe(Effect.andThen(Effect.sync(() => desktop.close())), Effect.andThen(Effect.never)),
      "latest",
    );
    await waitFor(() => action.getSnapshot().status === "failure", "startup runtime loss");
    assert.equal(finalized, 1);
    const state = action.getSnapshot();
    assert.ok(state.status === "failure");
    const error = Cause.squash(state.cause);
    assert.ok(error instanceof SewedError && error.code === "Closed");
  } finally {
    unsubscribe();
    desktop.close();
  }
});

for (const trigger of ["factory", "first value"] as const) {
  test(`runtime loss from a stream's ${trigger} cannot leave its startup fiber running`, async () => {
    let finalized = 0;
    let state: Connection.RuntimeState = { status: "ready" };
    let notify = () => {};
    const lose = () => {
      state = { status: "unavailable", cause: Cause.fail(new Error("startup runtime loss")) };
      notify();
    };
    const stream = Streams.make(
      {
        runtime,
        getSnapshot: () => state,
        subscribe: (listener) => {
          notify = listener;
          return () => {};
        },
      },
      () =>
        Stream.fromEffect(
          Effect.acquireRelease(Effect.succeed("value"), () =>
            Effect.sync(() => {
              finalized++;
            }),
          ).pipe(
            Effect.tap(() => (trigger === "factory" ? Effect.sync(() => lose()) : Effect.void)),
          ),
        ).pipe(Stream.concat(Stream.never)),
    );
    const unsubscribe = stream.subscribe(() => {
      if (trigger === "first value" && stream.getSnapshot().status === "value") lose();
    });
    try {
      await waitFor(() => stream.getSnapshot().status === "failure", "startup stream cancellation");
      assert.equal(finalized, 1);
      const state = stream.getSnapshot();
      assert.ok(state.status === "failure");
      const error = Cause.squash(state.cause);
      assert.ok(error instanceof SewedError && error.code === "Closed");
    } finally {
      unsubscribe();
    }
  });
}

test("subscribing the same listener twice cannot start a second activation or lose cleanup", () => {
  let activations = 0;
  let cleanups = 0;
  const store = Store.make(0, () => {
    activations++;
    return () => {
      cleanups++;
    };
  });
  const listener = () => {};
  const stop = store.subscribe(listener);
  const stopDuplicate = store.subscribe(listener);
  stopDuplicate();
  assert.equal(activations, 1);
  assert.equal(cleanups, 0);
  stop();
  stopDuplicate();
  assert.equal(cleanups, 1);
});

test("a stale unsubscribe cannot stop a newer subscription with the same callback", () => {
  let cleanups = 0;
  const store = Store.make(0, () => () => {
    cleanups++;
  });
  const listener = () => {};
  const first = store.subscribe(listener);
  first();
  const second = store.subscribe(listener);
  first();
  assert.equal(cleanups, 1);
  second();
  assert.equal(cleanups, 2);
});

test("a stale resource unsubscribe cannot release a newer subscription's lease", async () => {
  let acquisitions = 0;
  let releases = 0;
  const resource = Resource.make<number, never, never>(
    sourceOf(Effect.succeed(Context.empty())),
  ).createStore(() =>
    Effect.acquireRelease(
      Effect.sync(() => ++acquisitions),
      () =>
        Effect.sync(() => {
          releases++;
        }),
    ),
  );
  const listener = () => {};
  const first = resource.subscribe(listener);
  await waitFor(() => resource.getSnapshot().status === "ready", "first resource lease");
  first();
  await waitFor(() => resource.getSnapshot().status === "released", "first lease release");
  const second = resource.subscribe(listener);
  try {
    await waitFor(() => resource.getSnapshot().status === "ready", "second resource lease");
    first();
    assert.equal(resource.getSnapshot().status, "ready");
    assert.equal(releases, 1);
  } finally {
    second();
    await waitFor(() => releases === 2, "second lease release");
  }
});

test("a stale testing-runtime unsubscribe cannot remove its replacement listener", () => {
  const desktop = Testing.store([]);
  let notified = 0;
  const listener = () => {
    notified++;
  };
  const first = desktop.subscribe(listener);
  first();
  const second = desktop.subscribe(listener);
  first();
  desktop.close();
  second();
  assert.equal(notified, 1);
});

test("closing a runtime store cancels plain run work and waits for its finalizer", async () => {
  const desktop = Testing.store([]);
  const controller = new AbortController();
  const gate = Deferred.makeUnsafe<void>();
  let releasing = false;
  let released = false;
  let settled = false;
  const pending = desktop
    .run(
      Effect.acquireRelease(Effect.void, () =>
        Effect.sync(() => {
          releasing = true;
        }).pipe(
          Effect.andThen(Deferred.await(gate)),
          Effect.andThen(
            Effect.sync(() => {
              released = true;
            }),
          ),
        ),
      ).pipe(Effect.andThen(Effect.never)),
      { signal: controller.signal },
    )
    .then(
      () => {
        settled = true;
        return undefined;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
  desktop.close();
  try {
    await waitFor(() => releasing, "plain run cleanup on runtime loss");
    assert.equal(settled, false);
    assert.equal(released, false);
  } finally {
    controller.abort();
    Deferred.doneUnsafe(gate, Effect.void);
  }
  const error = await pending;
  assert.ok(error instanceof SewedError && error.code === "Closed");
  assert.equal(released, true);
});

test("runtime loss during synchronous plain run acquisition is observed before its fiber is returned", async () => {
  const desktop = Testing.store([]);
  const controller = new AbortController();
  let finalized = 0;
  const pending = desktop
    .run(
      Effect.acquireRelease(
        Effect.sync(() => desktop.close()),
        () =>
          Effect.sync(() => {
            finalized++;
          }),
      ).pipe(Effect.andThen(Effect.never)),
      { signal: controller.signal },
    )
    .catch((error: unknown) => error);
  try {
    await waitFor(() => finalized === 1, "reentrant plain run cancellation");
  } finally {
    controller.abort();
    desktop.close();
  }
  const error = await pending;
  assert.ok(error instanceof SewedError && error.code === "Closed");
});

test("plain run preserves a typed failure produced during runtime loss", async () => {
  const desktop = Testing.store([]);
  const original = new SewedError({
    code: "Unknown",
    message: "The operation may have been handled",
  });
  const error = await desktop
    .run(
      Effect.sync(() => desktop.close()).pipe(
        Effect.andThen(Effect.fail(original)),
        Effect.uninterruptible,
      ),
    )
    .catch((failure: unknown) => failure);
  assert.equal(error, original);
});

test("plain run preserves a cleanup defect when the runtime closes", async () => {
  const desktop = Testing.store([]);
  const defect = new Error("plain run cleanup failed");
  const pending = desktop.run(
    Effect.acquireRelease(Effect.void, () => Effect.die(defect)).pipe(Effect.andThen(Effect.never)),
  );
  const rejected = assert.rejects(pending, (error: unknown) => error === defect);
  desktop.close();
  await rejected;
});

test("plain run removes its runtime watcher after successful completion", async () => {
  let subscriptions = 0;
  let unsubscriptions = 0;
  const value = await Connection.runWith(
    {
      runtime,
      getSnapshot: () => ({ status: "ready" }),
      subscribe: () => {
        subscriptions++;
        return () => {
          unsubscriptions++;
        };
      },
    },
    Effect.succeed("done"),
  );
  assert.equal(value, "done");
  assert.equal(subscriptions, 1);
  assert.equal(unsubscriptions, 1);
});
