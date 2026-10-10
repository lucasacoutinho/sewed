import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { View as NativeView } from "electron";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Scope } from "effect";
import { MainContext, mainIdentity } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as View from "../src/internal/View.ts";

/**
 * A structural stand-in for Electron's `View`, minimal enough for `internal/View.ts`'s attach,
 * detach, `current`, and `raise` — no real Electron needed. `children` mirrors the real
 * `View.children` array `.artifacts/probe-wave-5/children-order.mjs` reads: `addChildView` moves
 * an already-present child to the end (the topmost slot) rather than appending a duplicate.
 */
class FakeNativeView extends EventEmitter {
  bounds = { x: 0, y: 0, width: 0, height: 0 };
  visible = false;
  children: FakeNativeView[] = [];
  addChildView(child: FakeNativeView) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    this.children.push(child);
  }
  removeChildView(child: FakeNativeView) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
  }
  getBounds() {
    return this.bounds;
  }
  setBounds(bounds: typeof this.bounds) {
    this.bounds = bounds;
  }
  getVisible() {
    return this.visible;
  }
  setVisible(visible: boolean) {
    this.visible = visible;
  }
  setBackgroundColor() {}
  setBorderRadius() {}
}

/** What `View.make` would have registered, over a fake native view instead of a real one. */
const registerFake = (nativeView: FakeNativeView, finalizer: Effect.Effect<void> = Effect.void) =>
  Effect.gen(function* () {
    const base = yield* View.lifecycle(nativeView as unknown as NativeView, () => false);
    yield* Scope.addFinalizer(base.lifetime, finalizer);
    const handle: View.Attachable = { [View.viewIdentity]: true, id: base.id };
    View.register(handle, base.state);
    return handle;
  });

const run = <A>(effect: Effect.Effect<A, unknown, MainContext | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(Testing.main)));

const bounds = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

test("attachment.current answers bounds and visible fresh, after setBounds and setVisible", async () => {
  const parent = new FakeNativeView();
  const child = new FakeNativeView();
  await run(
    Effect.gen(function* () {
      const handle = yield* registerFake(child);
      const parents = View.makeParent({
        view: () => parent as unknown as NativeView,
        state: () => "open",
      });
      const attachment = yield* parents.attach(handle, {
        bounds: bounds(0, 0, 10, 10),
        visible: true,
      });
      assert.deepEqual(yield* attachment.current, { bounds: bounds(0, 0, 10, 10), visible: true });
      yield* attachment.setBounds(bounds(5, 5, 20, 20));
      yield* attachment.setVisible(false);
      assert.deepEqual(yield* attachment.current, { bounds: bounds(5, 5, 20, 20), visible: false });
    }),
  );
});

test("raise moves this attachment to the top of the parent's children, over any number of siblings", async () => {
  const parent = new FakeNativeView();
  const a = new FakeNativeView();
  const b = new FakeNativeView();
  const c = new FakeNativeView();
  await run(
    Effect.gen(function* () {
      const parents = View.makeParent({
        view: () => parent as unknown as NativeView,
        state: () => "open",
      });
      const handleA = yield* registerFake(a);
      const handleB = yield* registerFake(b);
      const handleC = yield* registerFake(c);
      const attachmentA = yield* parents.attach(handleA, { bounds: bounds(0, 0, 1, 1) });
      const attachmentB = yield* parents.attach(handleB, { bounds: bounds(0, 0, 1, 1) });
      yield* parents.attach(handleC, { bounds: bounds(0, 0, 1, 1) });
      assert.deepEqual(parent.children, [a, b, c], "attach order, last-added topmost");

      yield* attachmentA.raise;
      assert.deepEqual(
        parent.children,
        [b, c, a],
        "raise reorders `a` to the topmost slot, with no duplicate entry",
      );

      yield* attachmentB.raise;
      assert.deepEqual(
        parent.children,
        [c, a, b],
        "raise on the (now) middle attachment raises it too, not only the first one ever raised",
      );
    }),
  );
});

test("Effect.runSync completes setBounds, setVisible, raise, and detach: they are synchronous underneath", () => {
  const parent = new FakeNativeView();
  const child = new FakeNativeView();
  const context = Context.make(MainContext, mainIdentity);
  const runSync = Effect.runSyncWith(context);
  // A manually-owned scope, kept open across every call below: `Effect.scoped` would close the
  // attachment's own scope (and so detach it) the instant the attach step's Effect completed,
  // taking every later runSync with it. `instance.test.ts`'s own `Scope.Scope` idiom, run
  // synchronously instead of through `Effect.runPromise`.
  const scope = runSync(Scope.make());
  const withScope = <A>(effect: Effect.Effect<A, unknown, MainContext | Scope.Scope>) =>
    runSync(effect.pipe(Effect.provideService(Scope.Scope, scope)));

  const handle = withScope(registerFake(child));
  const parents = View.makeParent({
    view: () => parent as unknown as NativeView,
    state: () => "open",
  });
  const attachment = withScope(parents.attach(handle, { bounds: bounds(0, 0, 1, 1) }));

  runSync(attachment.setBounds(bounds(1, 1, 2, 2)));
  assert.deepEqual(child.bounds, bounds(1, 1, 2, 2));
  runSync(attachment.setVisible(true));
  assert.equal(child.visible, true);
  runSync(attachment.raise);
  assert.deepEqual(parent.children, [child]);
  runSync(attachment.detach);
  assert.deepEqual(parent.children, []);
  runSync(Scope.close(scope, Exit.void));
});

test("a closing container rejects new children while an existing child's finalizer waits", async () => {
  const context = Context.make(MainContext, mainIdentity);
  const runMain = Effect.runPromiseWith(context);
  const scope = Scope.makeUnsafe();
  const gate = Deferred.makeUnsafe<void>();
  const started = Deferred.makeUnsafe<void>();
  const parent = await runMain(
    View.fromNative(new FakeNativeView() as unknown as NativeView).pipe(Scope.provide(scope)),
  );
  const first = await runMain(
    registerFake(
      new FakeNativeView(),
      Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(gate))),
    ).pipe(Scope.provide(scope)),
  );
  const second = await runMain(registerFake(new FakeNativeView()).pipe(Scope.provide(scope)));
  await runMain(parent.attach(first, { bounds: bounds(0, 0, 1, 1) }).pipe(Scope.provide(scope)));
  const closing = Effect.runFork(parent.close.pipe(Effect.provideContext(context)));
  try {
    await Effect.runPromise(Deferred.await(started));
    const result = await Effect.runPromiseExit(
      parent
        .attach(second, { bounds: bounds(0, 0, 1, 1) })
        .pipe(Scope.provide(scope), Effect.provideContext(context)),
    );
    assert.ok(Exit.isFailure(result));
    const error = Cause.squash(result.cause);
    assert.ok(error instanceof SewedError && error.code === "Closed");
  } finally {
    Deferred.doneUnsafe(gate, Effect.void);
    await Effect.runPromise(Fiber.await(closing));
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test("container closure preserves a child's cleanup defect and still detaches its children", async () => {
  const context = Context.make(MainContext, mainIdentity);
  const runMain = Effect.runPromiseWith(context);
  const scope = Scope.makeUnsafe();
  const defect = new Error("child cleanup failed");
  const native = new FakeNativeView();
  const parent = await runMain(
    View.fromNative(native as unknown as NativeView).pipe(Scope.provide(scope)),
  );
  const child = await runMain(
    registerFake(new FakeNativeView(), Effect.die(defect)).pipe(Scope.provide(scope)),
  );
  await runMain(parent.attach(child, { bounds: bounds(0, 0, 1, 1) }).pipe(Scope.provide(scope)));
  try {
    const result = await Effect.runPromiseExit(parent.close.pipe(Effect.provideContext(context)));
    assert.ok(Exit.isFailure(result));
    assert.equal(Cause.squash(result.cause), defect);
    await runMain(parent.awaitClosed);
    assert.equal(native.children.length, 0);
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});
