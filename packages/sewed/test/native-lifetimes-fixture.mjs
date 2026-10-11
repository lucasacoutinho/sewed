import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";
import { Deferred, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Binding from "../lib/Binding.js";
import { SewedError } from "../lib/SewedError.js";
import { MainContext, mainIdentity } from "../lib/RuntimeContext.js";

class Port extends EventEmitter {
  closed = false;
  postMessage() {}
  start() {}
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit("close");
  }
}
class Channel {
  port1 = new Port();
  port2 = new Port();
}
class Notification extends EventEmitter {
  static last;
  closes = 0;
  constructor() {
    super();
    Notification.last = this;
  }
  show() {
    throw new Error("native notification show failed");
  }
  close() {
    this.closes++;
  }
}
mock.module("electron", {
  namedExports: {
    MessageChannelMain: Channel,
    TouchBar: class {},
    nativeImage: {},
    Notification,
    BrowserWindow: class {},
    screen: {},
  },
});
const { mainBridge } = await import("../lib/internal/MainBridge.js");
const { make: touchBar } = await import("../lib/internal/TouchBar.js");
const { show: showNotification } = await import("../lib/internal/Notification.js");
const slot = Binding.slot(
  "bridge-lifetime",
  RpcGroup.make(Rpc.make("read", { success: Schema.Void })),
);
const id = "00000000-0000-0000-0000-000000000001";
const waitFor = async (predicate, description) => {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
};
const setup = (connect) => {
  const scope = Scope.makeUnsafe();
  const contents = new EventEmitter();
  contents.id = 1;
  contents.mainFrame = { url: "https://example.test/" };
  contents.isDestroyed = () => false;
  contents.send = () => {};
  const transferred = [];
  contents.postMessage = (_name, message, ports) => transferred.push({ message, ports });
  const ipc = new EventEmitter();
  const handlers = new Map();
  ipc.handle = (name, handler) => handlers.set(name, handler);
  ipc.removeHandler = (name) => handlers.delete(name);
  contents.ipc = ipc;
  const bridge = mainBridge(contents, scope, undefined);
  bridge.configure(new URL(contents.mainFrame.url), [
    Binding.makeBound(slot, "owner", { connect }),
  ]);
  const event = { senderFrame: contents.mainFrame };
  const session = handlers.get("sewed:hello")(event).session;
  return {
    scope,
    contents,
    ipc,
    transferred,
    session,
    event,
    open: () => handlers.get("sewed:open")(event, session, slot.key, id),
    close: () => ipc.emit("sewed:close", event, session, id),
  };
};
const transport = () => ({ send() {}, close() {}, subscribe: () => () => {} });

for (const boundary of ["connection", "document", "owner"]) {
  test(`${boundary} closure cancels a pending connection acquisition`, async () => {
    const gate = Deferred.makeUnsafe();
    let started = false;
    let continued = false;
    const state = setup(
      Effect.sync(() => {
        started = true;
      }).pipe(
        Effect.andThen(Deferred.await(gate)),
        Effect.andThen(
          Effect.sync(() => {
            continued = true;
            return transport();
          }),
        ),
      ),
    );
    let failure;
    let settled = false;
    const pending = state.open().then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        failure = error;
      },
    );
    try {
      await waitFor(() => started, "acquisition starts");
      if (boundary === "connection") state.close();
      else if (boundary === "document")
        state.ipc.emit("sewed:disconnect", state.event, state.session);
      else await Effect.runPromise(Scope.close(state.scope, Exit.void));
      await waitFor(() => settled, "acquisition rejects after closure");
      assert.ok(failure instanceof SewedError && failure.code === "Closed");
      assert.equal(continued, false);
      assert.equal(state.transferred.length, 0);
    } finally {
      Deferred.doneUnsafe(gate, Effect.void);
      await pending;
      await Effect.runPromise(Scope.close(state.scope, Exit.void));
    }
  });
}

test("a cancelled uninterruptible acquisition cannot replace or close a reused connection id", async () => {
  const gate = Deferred.makeUnsafe();
  let attempts = 0;
  let started = false;
  const state = setup(
    Effect.suspend(() => {
      attempts++;
      if (attempts > 1) return Effect.succeed(transport());
      return Effect.sync(() => {
        started = true;
      }).pipe(Effect.andThen(Deferred.await(gate)), Effect.as(transport()), Effect.uninterruptible);
    }),
  );
  const first = state.open().then(
    () => undefined,
    (error) => error,
  );
  try {
    await waitFor(() => started, "first acquisition starts");
    state.close();
    assert.equal(await state.open(), id);
    assert.equal(state.transferred.length, 1);
    const active = state.transferred[0].ports[0];
    Deferred.doneUnsafe(gate, Effect.void);
    const failure = await first;
    assert.ok(failure instanceof SewedError && failure.code === "Closed");
    assert.equal(state.transferred.length, 1);
    assert.equal(active.closed, false);
  } finally {
    Deferred.doneUnsafe(gate, Effect.void);
    await first;
    await Effect.runPromise(Scope.close(state.scope, Exit.void));
  }
});

test("a failed acquisition preserves its typed error and allows another connection", async () => {
  const original = new SewedError({ code: "Native", message: "owner acquisition failed" });
  let attempts = 0;
  const state = setup(
    Effect.suspend(() => (++attempts === 1 ? Effect.fail(original) : Effect.succeed(transport()))),
  );
  try {
    await assert.rejects(state.open(), (error) => error === original);
    assert.equal(await state.open(), id);
    assert.equal(state.transferred.length, 1);
  } finally {
    await Effect.runPromise(Scope.close(state.scope, Exit.void));
  }
});

test("a failed renderer close notification cannot prevent connection cleanup", async () => {
  let released = 0;
  const state = setup(
    Effect.acquireRelease(Effect.succeed(transport()), () =>
      Effect.sync(() => {
        released++;
      }),
    ),
  );
  try {
    await state.open();
    state.contents.send = () => {
      throw new Error("renderer cannot receive");
    };
    assert.doesNotThrow(() => state.close());
    await waitFor(() => released === 1, "connection release after failed notification");
  } finally {
    state.contents.send = () => {};
    await Effect.runPromise(Scope.close(state.scope, Exit.void));
  }
});

test("owner shutdown preserves its exit in acquired resource finalizers", async () => {
  let observed;
  const state = setup(
    Effect.addFinalizer((exit) =>
      Effect.sync(() => {
        observed = exit;
      }),
    ).pipe(Effect.as(transport())),
  );
  const failure = Exit.fail(new Error("owner failed"));
  try {
    await state.open();
    await Effect.runPromise(Scope.close(state.scope, failure));
    assert.equal(observed, failure);
  } finally {
    await Effect.runPromise(Scope.close(state.scope, Exit.void));
  }
});

test("closing waits for uninterruptible acquisition before releasing its resources", async () => {
  const gate = Deferred.makeUnsafe();
  let started = false;
  let released = 0;
  let settled = false;
  const state = setup(
    Effect.acquireRelease(
      Effect.sync(() => {
        started = true;
      }),
      () =>
        Effect.sync(() => {
          released++;
        }),
    ).pipe(Effect.andThen(Deferred.await(gate)), Effect.as(transport()), Effect.uninterruptible),
  );
  const pending = state.open().then(
    () => undefined,
    (error) => {
      settled = true;
      return error;
    },
  );
  try {
    await waitFor(() => started, "uninterruptible acquisition starts");
    state.close();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(released, 0);
    assert.equal(settled, false);
    Deferred.doneUnsafe(gate, Effect.void);
    const error = await pending;
    assert.ok(error instanceof SewedError && error.code === "Closed");
    assert.equal(released, 1);
    assert.equal(state.transferred.length, 0);
  } finally {
    Deferred.doneUnsafe(gate, Effect.void);
    await pending;
    await Effect.runPromise(Scope.close(state.scope, Exit.void));
  }
});

test("a stale acquisition failure cannot close the replacement using its old id", async () => {
  const gate = Deferred.makeUnsafe();
  const failure = new SewedError({ code: "Native", message: "late owner failure" });
  let started = false;
  let attempts = 0;
  const state = setup(
    Effect.suspend(() =>
      ++attempts > 1
        ? Effect.succeed(transport())
        : Effect.sync(() => {
            started = true;
          }).pipe(
            Effect.andThen(Deferred.await(gate)),
            Effect.andThen(Effect.fail(failure)),
            Effect.uninterruptible,
          ),
    ),
  );
  const first = state.open().then(
    () => undefined,
    (error) => error,
  );
  try {
    await waitFor(() => started, "first acquisition starts");
    state.close();
    assert.equal(await state.open(), id);
    const active = state.transferred[0].ports[0];
    Deferred.doneUnsafe(gate, Effect.void);
    assert.equal(await first, failure);
    assert.equal(active.closed, false);
    assert.equal(state.transferred.length, 1);
  } finally {
    Deferred.doneUnsafe(gate, Effect.void);
    await first;
    await Effect.runPromise(Scope.close(state.scope, Exit.void));
  }
});

test("touch bar observers end when their window closes", async () => {
  const closed = Deferred.makeUnsafe();
  let windowClosed = false;
  const handle = touchBar({}, () => windowClosed, closed);
  const fiber = Effect.runFork(
    Stream.runDrain(handle.interactions).pipe(Effect.provideService(MainContext, mainIdentity)),
  );
  let completed = false;
  fiber.addObserver(() => {
    completed = true;
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    windowClosed = true;
    Deferred.doneUnsafe(closed, Effect.void);
    await waitFor(() => completed, "touch bar observation ends");
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }
});

test("a notification that fails to show releases its native object and listeners immediately", async () => {
  const scope = Scope.makeUnsafe();
  try {
    const result = await Effect.runPromiseExit(
      showNotification({ title: "test" }).pipe(
        Scope.provide(scope),
        Effect.provideService(MainContext, mainIdentity),
      ),
    );
    assert.ok(Exit.isFailure(result));
    assert.equal(Notification.last.closes, 1);
    assert.equal(Notification.last.eventNames().length, 0);
    await Effect.runPromise(Scope.close(scope, Exit.void));
    assert.equal(Notification.last.closes, 1);
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

const { make: makeWindow } = await import("../lib/internal/Window.js");

class Window extends EventEmitter {
  destroyed = false;
  fullScreen = false;
  menuBarVisible = true;
  bounds = { x: 0, y: 0, width: 480, height: 320 };
  contentBounds = { x: 0, y: 26, width: 480, height: 294 };
  reads = 0;
  title = "event ordering";
  isDestroyed() {
    return this.destroyed;
  }
  destroy() {
    this.destroyed = true;
    this.emit("closed");
  }
  getBounds() {
    this.reads++;
    return this.bounds;
  }
  getNormalBounds() {
    return this.bounds;
  }
  getContentBounds() {
    return this.contentBounds;
  }
  isVisible() {
    return true;
  }
  isFocused() {
    return false;
  }
  isMinimized() {
    return false;
  }
  isMaximized() {
    return false;
  }
  isFullScreen() {
    return this.fullScreen;
  }
  isSimpleFullScreen() {
    return false;
  }
  getTitle() {
    return this.title;
  }
  setTitle(title) {
    this.title = title;
  }
  isAlwaysOnTop() {
    return false;
  }
  getOpacity() {
    return 1;
  }
  isResizable() {
    return true;
  }
  isMovable() {
    return true;
  }
  isMinimizable() {
    return true;
  }
  isMaximizable() {
    return true;
  }
  isClosable() {
    return true;
  }
  isFullScreenable() {
    return true;
  }
  isMenuBarVisible() {
    return this.menuBarVisible;
  }
  isKiosk() {
    return false;
  }
}

const stateWindow = async () => {
  const native = new Window();
  const scope = Scope.makeUnsafe();
  const handle = await Effect.runPromise(
    makeWindow(native).pipe(Scope.provide(scope), Effect.provideService(MainContext, mainIdentity)),
  );
  return { native, scope, handle };
};

test("state subscriptions read fresh native state after unobserved mutations", async () => {
  const { native, scope, handle } = await stateWindow();
  try {
    native.fullScreen = true;
    const first = await Effect.runPromise(
      handle.state.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.provideService(MainContext, mainIdentity),
      ),
    );
    assert.equal(first[0].fullScreen, true);
    native.fullScreen = false;
    native.title = "changed while unobserved";
    const second = await Effect.runPromise(
      handle.state.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.provideService(MainContext, mainIdentity),
      ),
    );
    assert.equal(second[0].fullScreen, false);
    assert.equal(second[0].title, "changed while unobserved");
    const current = await Effect.runPromise(
      handle.current.pipe(Effect.provideService(MainContext, mainIdentity)),
    );
    assert.deepEqual(second[0], current);
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test("state observation lasts until its final subscriber releases", async () => {
  const { native, scope, handle } = await stateWindow();
  const first = [];
  const second = [];
  let one;
  let two;
  try {
    one = Effect.runFork(
      Stream.runForEach(handle.state, (value) =>
        Effect.sync(() => {
          first.push(value);
        }),
      ).pipe(Effect.provideService(MainContext, mainIdentity)),
    );
    await waitFor(() => first.length > 0, "first state subscription");
    two = Effect.runFork(
      Stream.runForEach(handle.state, (value) =>
        Effect.sync(() => {
          second.push(value);
        }),
      ).pipe(Effect.provideService(MainContext, mainIdentity)),
    );
    await waitFor(() => second.length > 0, "second state subscription");
    await Effect.runPromise(Fiber.interrupt(one));
    native.bounds = { ...native.bounds, width: 960 };
    native.emit("resize");
    await waitFor(() => second.at(-1).bounds.width === 960, "remaining subscriber sees resize");
    await Effect.runPromise(Fiber.interrupt(two));
    const reads = native.reads;
    await Effect.runPromise(
      handle.setTitle("no state observers").pipe(Effect.provideService(MainContext, mainIdentity)),
    );
    native.emit("resize");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(native.reads, reads, "unobserved mutations do not query a snapshot");
    const resumed = await Effect.runPromise(
      handle.state.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.provideService(MainContext, mainIdentity),
      ),
    );
    assert.equal(resumed[0].title, "no state observers");
    assert.equal(resumed[0].bounds.width, 960);
  } finally {
    if (one) await Effect.runPromise(Fiber.interrupt(one));
    if (two) await Effect.runPromise(Fiber.interrupt(two));
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test("a native event burst publishes one final state and releases queued refreshes", async () => {
  const { native, scope, handle } = await stateWindow();
  const values = [];
  let fiber;
  try {
    fiber = Effect.runFork(
      Stream.runForEach(handle.state, (value) =>
        Effect.sync(() => {
          values.push(value);
        }),
      ).pipe(Effect.provideService(MainContext, mainIdentity)),
    );
    await waitFor(() => values.length === 1, "initial state");
    const reads = native.reads;
    native.emit("resize");
    native.bounds = { ...native.bounds, width: 1920 };
    native.emit("move");
    native.fullScreen = true;
    native.emit("enter-full-screen");
    native.menuBarVisible = false;
    await waitFor(() => values.at(-1).fullScreen, "final burst state");
    assert.equal(values.length, 2);
    assert.equal(native.reads - reads, 1);
    assert.equal(values[1].bounds.width, 1920);
    assert.equal(values[1].menuBarVisible, false);
    native.emit("resize");
    await Effect.runPromise(Fiber.interrupt(fiber));
    const releasedReads = native.reads;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(native.reads, releasedReads, "released observation cannot refresh later");
  } finally {
    if (fiber) await Effect.runPromise(Fiber.interrupt(fiber));
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test("an observed setting cancels the pending native-event refresh", async () => {
  const { native, scope, handle } = await stateWindow();
  const values = [];
  let fiber;
  try {
    fiber = Effect.runFork(
      Stream.runForEach(handle.state, (value) =>
        Effect.sync(() => {
          values.push(value);
        }),
      ).pipe(Effect.provideService(MainContext, mainIdentity)),
    );
    await waitFor(() => values.length === 1, "initial setting state");
    const reads = native.reads;
    native.emit("resize");
    Effect.runSync(
      handle.setTitle("synchronous update").pipe(Effect.provideService(MainContext, mainIdentity)),
    );
    await waitFor(() => values.at(-1).title === "synchronous update", "setting state");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(values.length, 2);
    assert.equal(native.reads - reads, 1);
  } finally {
    if (fiber) await Effect.runPromise(Fiber.interrupt(fiber));
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

for (const event of ["enter-full-screen", "leave-full-screen", "resize"]) {
  test(`${event} publishes state after the native event's mutation finishes`, async () => {
    const native = new Window();
    const entering = event !== "leave-full-screen";
    native.fullScreen = !entering;
    native.menuBarVisible = entering;
    const scope = Scope.makeUnsafe();
    let fiber;
    const values = [];
    try {
      const handle = await Effect.runPromise(
        makeWindow(native).pipe(
          Scope.provide(scope),
          Effect.provideService(MainContext, mainIdentity),
        ),
      );
      fiber = Effect.runFork(
        Stream.runForEach(handle.state, (value) =>
          Effect.sync(() => {
            values.push(value);
          }),
        ).pipe(Effect.provideService(MainContext, mainIdentity)),
      );
      await waitFor(() => values.length === 1, "initial window state");
      native.emit(event);
      native.fullScreen = entering;
      native.menuBarVisible = !entering;
      native.contentBounds = entering
        ? { x: 0, y: 0, width: 1920, height: 1080 }
        : { x: 0, y: 26, width: 480, height: 294 };
      await new Promise((resolve) => setImmediate(resolve));
      await waitFor(() => values.length > 1, "native transition state");
      assert.equal(values.at(-1).fullScreen, entering);
      assert.equal(values.at(-1).menuBarVisible, !entering);
      assert.deepEqual(values.at(-1).contentBounds, native.contentBounds);
      native.emit(event);
      await Effect.runPromise(Scope.close(scope, Exit.void));
      const readsAtClosure = native.reads;
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(native.reads, readsAtClosure, "queued callbacks cannot read a closed window");
      assert.equal(native.listenerCount(event), 0);
    } finally {
      if (fiber) await Effect.runPromise(Fiber.interrupt(fiber));
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });
}
