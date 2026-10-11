import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents } from "electron";
import { Cause, Effect, Exit, Fiber, Stream } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as ContentsRegistry from "../src/internal/ContentsRegistry.ts";
import * as ContentsWebviews from "../src/internal/ContentsWebviews.ts";

let nextId = 9000;

class FakeContents extends EventEmitter {
  readonly id = nextId++;
  readonly session = new EventEmitter();
  destroyedNow = false;
  setWindowOpenHandler = () => {};
  isDestroyed = () => this.destroyedNow;
  getOSProcessId = () => 42;
  url = "http://host/inner";
  stopped = 0;
  getURL = () => this.url;
  stop = () => {
    this.stopped++;
  };
  getUserAgent = () => "agent";
  isLoadingMainFrame = () => false;
  getZoomFactor = () => 1;
  isAudioMuted = () => false;
  isCurrentlyAudible = () => false;
  navigationHistory = {
    getAllEntries: () => [],
    getEntryAtIndex: () => (this.url === "" ? undefined : { url: this.url, title: "" }),
    getActiveIndex: () => 0,
    canGoBack: () => false,
    canGoForward: () => false,
    goToIndex: () => {},
  };
  destroy() {
    this.destroyedNow = true;
    this.emit("destroyed");
  }
}

// Test-only bridge: the owner and the core read these members structurally.
const native = (contents: FakeContents) => contents as unknown as WebContents;

const settled = (done: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 200 && !done(); attempt++) yield* Effect.sleep(5);
    assert.ok(done(), "the observer did not settle in time");
  });

/** Repeats `act` until `done`: a stream that replays nothing may not be subscribed to yet. */
const until = (done: () => boolean, act: () => void) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 400 && !done(); attempt++) {
      act();
      yield* Effect.sleep(5);
    }
    assert.ok(done(), "the observer did not settle in time");
  });

const errorOf = <A, E>(exit: Exit.Exit<A, E>) => {
  assert.ok(Exit.isFailure(exit));
  const error = Cause.squash(exit.cause);
  assert.ok(error instanceof SewedError);
  return error;
};

const navigation = (url: string) => {
  const event = {
    url,
    isMainFrame: true,
    prevented: false,
    preventDefault: () => {
      event.prevented = true;
    },
  };
  return event;
};

const withHost = <A, E>(
  use: (
    host: FakeContents,
    owned: () => readonly ContentsWebviews.Handle[],
  ) => Effect.Effect<A, E, MainContext>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const host = new FakeContents();
      const unregister = ContentsRegistry.register(host.id, "host-handle");
      const installed = ContentsWebviews.install(
        native(host),
        yield* Effect.context<MainContext>(),
        {
          displayScaleFactor: () => 1,
          imageOf: () => {
            throw new Error("no image module in this test");
          },
        },
      );
      const owned: ContentsWebviews.Handle[] = [];
      const watching = yield* installed.webviews.pipe(
        Stream.runForEach((handle) => Effect.sync(() => owned.push(handle))),
        Effect.forkChild,
      );
      // Attachments nobody keeps, until the subscription above is seen to be live.
      const warmups: FakeContents[] = [];
      yield* until(
        () => owned.length > 0,
        () => {
          const warmup = new FakeContents();
          warmups.push(warmup);
          host.emit("did-attach-webview", {}, native(warmup));
        },
      );
      yield* Effect.sleep(20);
      for (const warmup of warmups) warmup.destroy();
      owned.length = 0;
      const result = yield* use(host, () => owned);
      installed.release();
      yield* Fiber.await(watching);
      unregister();
      assert.equal(host.listenerCount("did-attach-webview"), 0);
      return result;
    }).pipe(Effect.provide(Testing.main)),
  );

test("an attached webview is published as a handle registered under its own id", async () => {
  await withHost((host, owned) =>
    Effect.gen(function* () {
      const guest = new FakeContents();
      host.emit("did-attach-webview", {}, native(guest));
      yield* settled(() => owned().length === 1);
      const [webview] = owned();
      assert.ok(webview !== undefined);
      assert.equal(webview.hostId, "host-handle");
      assert.equal(ContentsRegistry.handleIdOf(guest.id), webview.id);
      assert.equal(yield* webview.webContents.userAgent, "agent");
    }),
  );
});

test("a webview's navigation is denied and reported until a decider on it allows it", async () => {
  await withHost((host, owned) =>
    Effect.gen(function* () {
      const guest = new FakeContents();
      host.emit("did-attach-webview", {}, native(guest));
      yield* settled(() => owned().length === 1);
      const [webview] = owned();
      assert.ok(webview !== undefined);
      const blocked: unknown[] = [];
      const watching = yield* webview.blocked.pipe(
        Stream.runForEach((entry) => Effect.sync(() => blocked.push(entry))),
        Effect.forkChild,
      );
      const denied = navigation("http://elsewhere/");
      yield* until(
        () => blocked.length > 0,
        () => guest.emit("will-navigate", denied),
      );
      assert.equal(denied.prevented, true);
      assert.deepEqual(blocked[0], { kind: "navigation", url: "http://elsewhere/" });
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* webview.webContents.decide(
            Decidables.WebContents.Navigation,
            Decision.sync(() => "allow" as const),
          );
          const allowed = navigation("http://elsewhere/");
          guest.emit("will-navigate", allowed);
          assert.equal(allowed.prevented, false);
        }),
      );
      // The decider left with its scope: the denial is back.
      const again = navigation("http://elsewhere/");
      guest.emit("will-navigate", again);
      assert.equal(again.prevented, true);
      guest.destroy();
      yield* Fiber.await(watching);
    }),
  );
});

const hostLoad = (guest: FakeContents, url: string, extra: object = {}) =>
  guest.emit("did-start-navigation", {
    url,
    isMainFrame: true,
    isSameDocument: false,
    initiator: null,
    ...extra,
  });

test("a load the host page points a webview at is stopped until its decider allows it", async () => {
  await withHost((host, owned) =>
    Effect.gen(function* () {
      const guest = new FakeContents();
      guest.url = "";
      host.emit("did-attach-webview", {}, native(guest));
      yield* settled(() => owned().length === 1);
      const [webview] = owned();
      assert.ok(webview !== undefined);
      const blocked: unknown[] = [];
      const watching = yield* webview.blocked.pipe(
        Stream.runForEach((entry) => Effect.sync(() => blocked.push(entry))),
        Effect.forkChild,
      );
      // The first document is the one the attachment allowed.
      hostLoad(guest, "http://host/inner");
      assert.equal(guest.stopped, 0);
      guest.url = "http://host/inner";
      // A reload, a subframe, a same-document move and a page's own navigation ask nothing here.
      hostLoad(guest, "http://host/inner");
      hostLoad(guest, "http://elsewhere/", { isMainFrame: false });
      hostLoad(guest, "http://host/inner#part", { isSameDocument: true });
      hostLoad(guest, "http://elsewhere/", { initiator: {} });
      yield* Effect.sleep(20);
      assert.equal(guest.stopped, 0);
      yield* until(
        () => blocked.length > 0,
        () => hostLoad(guest, "http://elsewhere/"),
      );
      assert.deepEqual(blocked[0], { kind: "navigation", url: "http://elsewhere/" });
      yield* Effect.sleep(20);
      const stopped = guest.stopped;
      assert.ok(stopped >= 1, "the denied load was stopped");
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* webview.webContents.decide(
            Decidables.WebContents.Navigation,
            Decision.sync(() => "allow" as const),
          );
          hostLoad(guest, "http://elsewhere/");
          yield* Effect.sleep(20);
          assert.equal(guest.stopped, stopped);
        }),
      );
      guest.destroy();
      yield* Fiber.await(watching);
      assert.equal(guest.listenerCount("did-start-navigation"), 0);
    }),
  );
});

test("a destroyed webview closes its handle and releases what it held", async () => {
  await withHost((host, owned) =>
    Effect.gen(function* () {
      const guest = new FakeContents();
      host.emit("did-attach-webview", {}, native(guest));
      yield* settled(() => owned().length === 1);
      const [webview] = owned();
      assert.ok(webview !== undefined);
      guest.destroy();
      yield* webview.awaitClosed;
      assert.equal(errorOf(yield* Effect.exit(webview.webContents.userAgent)).code, "Closed");
      yield* settled(() => ContentsRegistry.handleIdOf(guest.id) === undefined);
      assert.equal(guest.listenerCount("before-input-event"), 0);
      assert.equal(guest.listenerCount("will-navigate"), 0);
      assert.equal(guest.session.listenerCount("will-download"), 0);
    }),
  );
});

test("a webview already destroyed when its attachment is reported is not owned", async () => {
  await withHost((host, owned) =>
    Effect.gen(function* () {
      const guest = new FakeContents();
      guest.destroyedNow = true;
      host.emit("did-attach-webview", {}, native(guest));
      yield* Effect.sleep(30);
      assert.equal(owned().length, 0);
    }),
  );
});
