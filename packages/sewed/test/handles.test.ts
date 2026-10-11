import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents } from "electron";
import { Cause, Effect, Exit } from "effect";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as Handles from "../src/internal/Handles.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import { core, type Core } from "../src/internal/WebContentsCore.ts";
import type { Handle as ViewHandle } from "../src/internal/WebContentsView.ts";

class FakeContents extends EventEmitter {
  url = "";
  destroyedNow = false;
  devToolsHost: unknown = undefined;
  opened: unknown[] = [];
  setWindowOpenHandler = () => {};
  isDestroyed = () => this.destroyedNow;
  getOSProcessId = () => 42;
  getURL = () => this.url;
  isLoadingMainFrame = () => false;
  getZoomFactor = () => 1;
  isAudioMuted = () => false;
  isCurrentlyAudible = () => false;
  navigationHistory = {
    getAllEntries: () => [],
    getActiveIndex: () => 0,
    canGoBack: () => false,
    canGoForward: () => false,
  };
  setDevToolsWebContents = (host: unknown) => {
    this.devToolsHost = host;
  };
  openDevTools = (options: unknown) => {
    this.opened.push(options);
  };
}

// Test-only bridges: the core reads these members structurally, and a view handle is only a key.
const native = (contents: FakeContents) => contents as unknown as WebContents;
const viewHandle = () => ({}) as unknown as ViewHandle;
const coreHandle = () => ({}) as unknown as Core;

const errorOf = <A, E>(exit: Exit.Exit<A, E>) => {
  assert.ok(Exit.isFailure(exit));
  const error = Cause.squash(exit.cause);
  assert.ok(error instanceof SewedError);
  return error;
};

const withCore = <A>(
  use: (inspected: FakeContents, web: Core) => Effect.Effect<A, never, MainContext>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const inspected = new FakeContents();
        const { contents: web } = yield* core(native(inspected), {
          registry: Registry.make({ owner: "contents" }),
          blocked: () => {},
          displayScaleFactor: () => 1,
          imageOf: () => {
            throw new Error("no image module in this test");
          },
        });
        return yield* use(inspected, web);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );

test("a published handle is found by id until it is closed or withdrawn", () => {
  const table = Handles.contents;
  let closed = false;
  const first = coreHandle();
  const withdraw = table.publish("a", first, () => closed);
  assert.equal(table.find("a"), first);
  assert.equal(table.find("b"), undefined);
  closed = true;
  assert.equal(table.find("a"), undefined);
  closed = false;
  // A later owner under the same id is not removed by the earlier one's withdrawal.
  const second = coreHandle();
  const withdrawSecond = table.publish("a", second, () => false);
  withdraw();
  assert.equal(table.find("a"), second);
  withdrawSecond();
  assert.equal(table.find("a"), undefined);
});

test("DevTools open inside a fresh view the program owns", async () => {
  await withCore((inspected, web) =>
    Effect.gen(function* () {
      const host = new FakeContents();
      const view = viewHandle();
      Handles.registerView(view, native(host));
      yield* Effect.orDie(web.openDevToolsIn(view, { activate: false }));
      assert.equal(inspected.devToolsHost, host);
      assert.deepEqual(inspected.opened, [{ mode: "detach", activate: false }]);
    }),
  );
});

test("a DevTools host that is unknown, closed, loaded or mistyped is refused", async () => {
  await withCore((inspected, web) =>
    Effect.gen(function* () {
      assert.equal(errorOf(yield* Effect.exit(web.openDevToolsIn(viewHandle()))).code, "Protocol");
      const gone = new FakeContents();
      gone.destroyedNow = true;
      const goneView = viewHandle();
      Handles.registerView(goneView, native(gone));
      assert.equal(errorOf(yield* Effect.exit(web.openDevToolsIn(goneView))).code, "Closed");
      const loaded = new FakeContents();
      loaded.url = "http://host/";
      const loadedView = viewHandle();
      Handles.registerView(loadedView, native(loaded));
      assert.equal(errorOf(yield* Effect.exit(web.openDevToolsIn(loadedView))).code, "Protocol");
      const own = viewHandle();
      Handles.registerView(own, native(inspected));
      assert.equal(errorOf(yield* Effect.exit(web.openDevToolsIn(own))).code, "Protocol");
      const fresh = viewHandle();
      Handles.registerView(fresh, native(new FakeContents()));
      const mistyped: object = { activate: "yes" };
      assert.equal(
        errorOf(yield* Effect.exit(web.openDevToolsIn(fresh, mistyped))).code,
        "Protocol",
      );
      assert.deepEqual(inspected.opened, []);
    }),
  );
});
