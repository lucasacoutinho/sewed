import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Context, Deferred, Effect, Exit, Scope } from "effect";
import * as Resource from "../src/internal/Resource.ts";

const waitFor = async (predicate: () => boolean, description: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
};

const emptyOwner = <A, E>() => Resource.make<A, E, never>(Context.empty());

test("interruption defects block replacement until explicitly acknowledged", async () => {
  const started = Deferred.makeUnsafe<void>();
  const owner = emptyOwner<string, never>();
  const pending = owner.createStore(() =>
    Deferred.succeed(started, undefined).pipe(
      Effect.andThen(Effect.never),
      Effect.ensuring(Effect.die("interruption cleanup failed")),
    ),
  );
  let acquisitions = 0;
  const replacement = owner.createStore(() => Effect.sync(() => String(++acquisitions)));
  const stopPending = pending.subscribe(() => undefined);
  await waitFor(() => Deferred.isDoneUnsafe(started), "pending acquisition");
  const stopReplacement = replacement.subscribe(() => undefined);
  stopPending();
  await waitFor(() => replacement.getSnapshot().status === "failure", "interruption failure");
  const failure = replacement.getSnapshot();
  if (failure.status === "failure")
    assert.match(Cause.pretty(failure.cause), /interruption cleanup failed/);
  assert.equal(acquisitions, 0);
  replacement.reload();
  await waitFor(() => replacement.getSnapshot().status === "ready", "acknowledged replacement");
  assert.equal(acquisitions, 1);
  stopReplacement();
  await waitFor(() => replacement.getSnapshot().status === "released", "replacement cleanup");
});

test("manual release and acquisition failure remain latched across resubscription", async () => {
  let acquisitions = 0;
  const store = emptyOwner<string, string>().createStore(() => {
    acquisitions += 1;
    return acquisitions === 1 ? Effect.fail("failed") : Effect.succeed("ready");
  });
  let stop = store.subscribe(() => undefined);
  await waitFor(() => store.getSnapshot().status === "failure", "acquisition failure");
  stop();
  stop = store.subscribe(() => undefined);
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.equal(store.getSnapshot().status, "failure");
  assert.equal(acquisitions, 1);
  store.reload();
  await waitFor(() => store.getSnapshot().status === "ready", "explicit retry");
  store.release();
  await waitFor(() => store.getSnapshot().status === "released", "manual release");
  stop();
  stop = store.subscribe(() => undefined);
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.equal(store.getSnapshot().status, "released");
  assert.equal(acquisitions, 2);
  stop();
});

test("acquires a scoped value after subscription and releases it on unsubscribe", async () => {
  let acquired = 0;
  let released = 0;
  const owner = emptyOwner<string, never>();
  const store = owner.createStore(() =>
    Effect.acquireRelease(
      Effect.sync(() => {
        acquired += 1;
        return "value";
      }),
      () =>
        Effect.sync(() => {
          released += 1;
        }),
    ),
  );
  const unsubscribe = store.subscribe(() => undefined);

  await waitFor(() => store.getSnapshot().status === "ready", "resource acquisition");
  assert.deepEqual(store.getSnapshot(), { status: "ready", value: "value" });
  assert.equal(acquired, 1);
  assert.equal(released, 0);

  unsubscribe();
  await waitFor(() => store.getSnapshot().status === "released", "resource release");
  assert.equal(released, 1);
});

test("cancels pending acquisition and ignores its late completion", async () => {
  const started = Deferred.makeUnsafe<void>();
  const late = Deferred.makeUnsafe<string>();
  let acquired = 0;
  let released = 0;
  let interruptedExit: Exit.Exit<unknown, unknown> | undefined;
  const owner = emptyOwner<string, never>();
  const store = owner.createStore(() =>
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      yield* Scope.addFinalizerExit(scope, (exit) =>
        Effect.sync(() => {
          interruptedExit = exit;
        }),
      );
      yield* Effect.sync(() => Deferred.doneUnsafe(started, Effect.void));
      const value = yield* Deferred.await(late);
      return yield* Effect.acquireRelease(
        Effect.sync(() => {
          acquired += 1;
          return value;
        }),
        () =>
          Effect.sync(() => {
            released += 1;
          }),
      );
    }),
  );
  const unsubscribe = store.subscribe(() => undefined);

  await waitFor(() => Deferred.isDoneUnsafe(started), "pending acquisition");
  unsubscribe();
  await waitFor(
    () => store.getSnapshot().status === "released",
    "pending acquisition cancellation",
  );
  Deferred.doneUnsafe(late, Effect.succeed("late"));
  await new Promise<void>((resolve) => setTimeout(resolve, 20));

  assert.equal(acquired, 0);
  assert.equal(released, 0);
  assert.ok(interruptedExit !== undefined && Exit.isFailure(interruptedExit));
  assert.deepEqual(store.getSnapshot(), { status: "released" });
});

test("waits for an old finalizer before acquiring a replacement", async () => {
  const releaseGate = Deferred.makeUnsafe<void>();
  let releaseStarted = false;
  const acquired: Array<string> = [];
  const released: Array<string> = [];
  const owner = emptyOwner<string, never>();
  const storeFor = (key: string) =>
    owner.createStore(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          acquired.push(key);
          return key;
        }),
        () =>
          Effect.gen(function* () {
            releaseStarted = true;
            yield* Deferred.await(releaseGate);
            released.push(key);
          }),
      ),
    );
  const first = storeFor("first");
  const replacement = storeFor("replacement");
  const stopFirst = first.subscribe(() => undefined);
  await waitFor(() => first.getSnapshot().status === "ready", "first acquisition");

  const stopReplacement = replacement.subscribe(() => undefined);
  stopFirst();
  await waitFor(() => releaseStarted, "old finalizer to start");
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(acquired, ["first"]);
  assert.deepEqual(released, []);
  assert.equal(replacement.getSnapshot().status, "loading");

  Deferred.doneUnsafe(releaseGate, Effect.void);
  await waitFor(() => replacement.getSnapshot().status === "ready", "replacement acquisition");
  assert.deepEqual(released, ["first"]);
  assert.deepEqual(acquired, ["first", "replacement"]);
  stopReplacement();
  await waitFor(() => replacement.getSnapshot().status === "released", "replacement release");
});

test("reports cleanup defects while cancelling an acquisition", async () => {
  const started = Deferred.makeUnsafe<void>();
  const late = Deferred.makeUnsafe<string>();
  const owner = emptyOwner<string, never>();
  const store = owner.createStore(() =>
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      yield* Scope.addFinalizerExit(scope, () => Effect.die("cancel cleanup failed"));
      yield* Effect.sync(() => Deferred.doneUnsafe(started, Effect.void));
      return yield* Deferred.await(late);
    }),
  );
  const unsubscribe = store.subscribe(() => undefined);

  await waitFor(() => Deferred.isDoneUnsafe(started), "pending acquisition");
  unsubscribe();
  await waitFor(() => store.getSnapshot().status === "failure", "cancel cleanup failure");
  const failure = store.getSnapshot();
  assert.equal(failure.status, "failure");
  if (failure.status === "failure") {
    assert.match(Cause.pretty(failure.cause), /cancel cleanup failed/);
  }
  Deferred.doneUnsafe(late, Effect.succeed("late"));
});

test("coalesces repeated dependency replacements while cleanup is pending", async () => {
  const releaseGate = Deferred.makeUnsafe<void>();
  const events: Array<string> = [];
  const owner = emptyOwner<string, never>();
  const storeFor = (key: string) =>
    owner.createStore(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          events.push(`acquire:${key}`);
          return key;
        }),
        () =>
          key === "first"
            ? Effect.gen(function* () {
                events.push(`release:${key}`);
                yield* Deferred.await(releaseGate);
              })
            : Effect.sync(() => {
                events.push(`release:${key}`);
              }),
      ),
    );
  const first = storeFor("first");
  const skipped = storeFor("skipped");
  const last = storeFor("last");
  const stopFirst = first.subscribe(() => undefined);
  await waitFor(() => first.getSnapshot().status === "ready", "first acquisition");

  const stopSkipped = skipped.subscribe(() => undefined);
  stopFirst();
  await waitFor(() => events.includes("release:first"), "first finalizer to start");
  const stopLast = last.subscribe(() => undefined);
  stopSkipped();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, ["acquire:first", "release:first"]);
  assert.equal(skipped.getSnapshot().status, "released");
  assert.equal(last.getSnapshot().status, "loading");

  Deferred.doneUnsafe(releaseGate, Effect.void);
  await waitFor(() => last.getSnapshot().status === "ready", "last acquisition");
  assert.deepEqual(events, ["acquire:first", "release:first", "acquire:last"]);

  stopLast();
  await waitFor(() => last.getSnapshot().status === "released", "last release");
});

test("exposes failure and retries only after an explicit reload", async () => {
  let attempts = 0;
  let released = 0;
  const owner = emptyOwner<string, string>();
  const store = owner.createStore(() => {
    attempts += 1;
    return attempts === 1
      ? Effect.fail("first attempt")
      : Effect.acquireRelease(Effect.succeed("reloaded"), () =>
          Effect.sync(() => {
            released += 1;
          }),
        );
  });
  const unsubscribe = store.subscribe(() => undefined);

  await waitFor(() => store.getSnapshot().status === "failure", "failed acquisition");
  const failure = store.getSnapshot();
  assert.equal(failure.status, "failure");
  if (failure.status === "failure") {
    const reason = failure.cause.reasons[0];
    assert.ok(reason !== undefined && Cause.isFailReason(reason));
    if (reason !== undefined && Cause.isFailReason(reason))
      assert.equal(reason.error, "first attempt");
  }
  assert.equal(attempts, 1);

  unsubscribe();
  const resubscribed = store.subscribe(() => undefined);
  assert.equal(store.getSnapshot().status, "failure");
  assert.equal(attempts, 1);

  store.reload();
  await waitFor(() => store.getSnapshot().status === "ready", "explicit reload");
  assert.deepEqual(store.getSnapshot(), { status: "ready", value: "reloaded" });
  assert.equal(attempts, 2);
  resubscribed();
  await waitFor(() => store.getSnapshot().status === "released", "reloaded value release");
  assert.equal(released, 1);
});

test("coalesces repeated reloads while the current finalizer is blocked", async () => {
  const releaseGate = Deferred.makeUnsafe<void>();
  let releaseStarted = false;
  let acquired = 0;
  let released = 0;
  const owner = emptyOwner<string, never>();
  const store = owner.createStore(() =>
    Effect.acquireRelease(
      Effect.sync(() => {
        acquired += 1;
        return `value-${acquired}`;
      }),
      () =>
        Effect.gen(function* () {
          releaseStarted = true;
          yield* Deferred.await(releaseGate);
          released += 1;
        }),
    ),
  );
  const unsubscribe = store.subscribe(() => undefined);

  await waitFor(() => store.getSnapshot().status === "ready", "initial value");
  for (let index = 0; index < 100; index += 1) store.reload();
  await waitFor(() => releaseStarted, "blocked finalizer");
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.equal(acquired, 1);
  assert.equal(released, 0);
  assert.equal(store.getSnapshot().status, "releasing");

  Deferred.doneUnsafe(releaseGate, Effect.void);
  await waitFor(() => store.getSnapshot().status === "ready", "coalesced reload");
  assert.equal(acquired, 2);
  assert.equal(released, 1);

  unsubscribe();
  await waitFor(() => store.getSnapshot().status === "released", "final value release");
  assert.equal(released, 2);
});

test("release closes the value and reload opens it again", async () => {
  let acquired = 0;
  let released = 0;
  const owner = emptyOwner<string, never>();
  const store = owner.createStore(() =>
    Effect.acquireRelease(
      Effect.sync(() => {
        acquired += 1;
        return `value-${acquired}`;
      }),
      () =>
        Effect.sync(() => {
          released += 1;
        }),
    ),
  );
  const unsubscribe = store.subscribe(() => undefined);
  await waitFor(() => store.getSnapshot().status === "ready", "initial value");

  store.release();
  await waitFor(() => store.getSnapshot().status === "released", "explicit release");
  assert.equal(acquired, 1);
  assert.equal(released, 1);

  store.reload();
  await waitFor(() => store.getSnapshot().status === "ready", "reload after release");
  assert.deepEqual(store.getSnapshot(), { status: "ready", value: "value-2" });
  unsubscribe();
  await waitFor(() => store.getSnapshot().status === "released", "final release");
  assert.equal(released, 2);
});

test("strict-mode unsubscribe and resubscribe do not leak the scoped value", async () => {
  let acquired = 0;
  let released = 0;
  const owner = emptyOwner<string, never>();
  const store = owner.createStore(() =>
    Effect.acquireRelease(
      Effect.sync(() => {
        acquired += 1;
        return "strict";
      }),
      () =>
        Effect.sync(() => {
          released += 1;
        }),
    ),
  );
  const first = store.subscribe(() => undefined);
  first();
  const second = store.subscribe(() => undefined);
  await waitFor(() => store.getSnapshot().status === "ready", "resubscribed value");
  assert.ok(acquired >= 1);
  second();
  await waitFor(() => store.getSnapshot().status === "released", "strict-mode cleanup");
  assert.equal(released, acquired);
});

test("late callbacks from a superseded store cannot update the replacement", async () => {
  let resume: ((effect: Effect.Effect<string>) => void) | undefined;
  const owner = emptyOwner<string, never>();
  const oldStore = owner.createStore(() =>
    Effect.callback<string>((continueWith) => {
      resume = continueWith;
    }),
  );
  const newStore = owner.createStore(() => Effect.succeed("new"));
  const stopOld = oldStore.subscribe(() => undefined);
  await waitFor(() => resume !== undefined, "old callback registration");
  const stopNew = newStore.subscribe(() => undefined);
  stopOld();
  await waitFor(() => newStore.getSnapshot().status === "ready", "replacement value");

  resume?.(Effect.succeed("late"));
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(newStore.getSnapshot(), { status: "ready", value: "new" });
  stopNew();
  await waitFor(() => newStore.getSnapshot().status === "released", "replacement cleanup");
});

test("stale store actions cannot release or reload the current replacement", async () => {
  let oldReleased = 0;
  let newAcquired = 0;
  let newReleased = 0;
  const owner = emptyOwner<string, never>();
  const oldStore = owner.createStore(() =>
    Effect.acquireRelease(Effect.succeed("old"), () =>
      Effect.sync(() => {
        oldReleased += 1;
      }),
    ),
  );
  const newStore = owner.createStore(() =>
    Effect.acquireRelease(
      Effect.sync(() => {
        newAcquired += 1;
        return "new";
      }),
      () =>
        Effect.sync(() => {
          newReleased += 1;
        }),
    ),
  );
  const stopOld = oldStore.subscribe(() => undefined);
  await waitFor(() => oldStore.getSnapshot().status === "ready", "old value");
  const staleRelease = oldStore.release;
  const staleReload = oldStore.reload;

  const stopNew = newStore.subscribe(() => undefined);
  await waitFor(() => newStore.getSnapshot().status === "ready", "new value");
  assert.equal(oldReleased, 1);
  assert.equal(newAcquired, 1);

  staleRelease();
  staleReload();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(newStore.getSnapshot(), { status: "ready", value: "new" });
  assert.equal(newAcquired, 1);
  assert.equal(newReleased, 0);

  stopOld();
  stopNew();
  await waitFor(() => newStore.getSnapshot().status === "released", "new value cleanup");
  assert.equal(newReleased, 1);
});

test("acknowledges cleanup failure before fresh replacement acquisition", async () => {
  let replacementAcquired = 0;
  let oldReleaseAttempts = 0;
  const owner = emptyOwner<string, never>();
  const oldStore = owner.createStore(() =>
    Effect.acquireRelease(Effect.succeed("old"), () =>
      Effect.gen(function* () {
        oldReleaseAttempts += 1;
        return yield* Effect.die("cleanup failed");
      }),
    ),
  );
  const replacement = owner.createStore(() =>
    Effect.sync(() => {
      replacementAcquired += 1;
      return "new";
    }),
  );
  const stopOld = oldStore.subscribe(() => undefined);
  await waitFor(() => oldStore.getSnapshot().status === "ready", "old value");
  const stopReplacement = replacement.subscribe(() => undefined);
  stopOld();

  await waitFor(
    () => replacement.getSnapshot().status === "failure",
    "replacement cleanup failure",
  );
  assert.equal(replacementAcquired, 0);
  assert.equal(oldReleaseAttempts, 1);
  const replacementFailure = replacement.getSnapshot();
  assert.equal(replacementFailure.status, "failure");
  if (replacementFailure.status === "failure") {
    assert.match(Cause.pretty(replacementFailure.cause), /cleanup failed/);
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.equal(replacementAcquired, 0);

  replacement.reload();
  await waitFor(
    () => replacement.getSnapshot().status === "ready",
    "explicit failure acknowledgement",
  );
  assert.equal(replacementAcquired, 1);
  assert.equal(oldReleaseAttempts, 1);
  stopReplacement();
  await waitFor(() => replacement.getSnapshot().status === "released", "replacement release");
});

test("passes an acquisition failure exit to scoped finalizers", async () => {
  let finalizerExit: Exit.Exit<unknown, unknown> | undefined;
  const owner = emptyOwner<string, string>();
  const store = owner.createStore(() =>
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      yield* Scope.addFinalizerExit(scope, (exit) =>
        Effect.sync(() => {
          finalizerExit = exit;
        }),
      );
      return yield* Effect.fail("acquisition failed");
    }),
  );
  const unsubscribe = store.subscribe(() => undefined);

  await waitFor(() => store.getSnapshot().status === "failure", "failed acquisition");
  assert.ok(finalizerExit !== undefined);
  if (finalizerExit !== undefined && Exit.isFailure(finalizerExit)) {
    assert.match(Cause.pretty(finalizerExit.cause), /acquisition failed/);
  }
  unsubscribe();
});

test("a failed resource finalizer reports failure instead of remaining in releasing", async () => {
  const owner = emptyOwner<string, never>();
  const store = owner.createStore(() =>
    Effect.acquireRelease(Effect.succeed("value"), () => Effect.die("release failed")),
  );
  const unsubscribe = store.subscribe(() => undefined);
  try {
    await waitFor(() => store.getSnapshot().status === "ready", "initial value");
    store.release();
    await waitFor(() => store.getSnapshot().status === "failure", "release failure");
    const state = store.getSnapshot();
    assert.equal(state.status, "failure");
    if (state.status === "failure") assert.match(Cause.pretty(state.cause), /release failed/);
  } finally {
    unsubscribe();
  }
});
