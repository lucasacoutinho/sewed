import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Schema, Stream } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import * as Binding from "../src/PublicBinding.ts";
import * as Capability from "../src/Capability.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as WindowControls from "../src/WindowControls.ts";
import * as Controls from "../src/internal/WindowControls.ts";

const bounds = { x: 10, y: 20, width: 800, height: 600 };
const state = {
  bounds,
  normalBounds: bounds,
  contentBounds: { x: 10, y: 48, width: 800, height: 572 },
  visible: true,
  focused: true,
  minimized: false,
  maximized: false,
  fullScreen: false,
  title: "Sewed",
  alwaysOnTop: false,
  opacity: 1,
  resizable: true,
  movable: true,
  minimizable: true,
  maximizable: true,
  closable: true,
  fullScreenable: true,
  menuBarVisible: true,
  kiosk: false,
};

test("window state carries the content area bounds", () => {
  const decoded = Schema.decodeUnknownSync(WindowControls.State)(state);
  assert.deepEqual(decoded.contentBounds, state.contentBounds);
  const { contentBounds: _contentBounds, ...withoutContentBounds } = state;
  assert.equal(
    Schema.decodeUnknownExit(WindowControls.State)(withoutContentBounds)._tag,
    "Failure",
  );
});

// A window stands in for the one the capability is served for. `native` takes this structure, so
// the rules a renderer meets are exercised here without Electron and without a desktop.
const page = (calls: string[]): Controls.Contents<never> => ({
  zoom: Stream.make({ factor: 1 }),
  setZoom: (factor) =>
    Effect.sync(() => {
      calls.push(`setZoom:${factor}`);
    }),
  audio: Stream.make({ muted: false, audible: false }),
  setAudioMuted: (muted) =>
    Effect.sync(() => {
      calls.push(`setAudioMuted:${muted}`);
    }),
  history: Stream.make({ index: 0, entries: [], canGoBack: false, canGoForward: false }),
  back: Effect.sync(() => {
    calls.push("back");
  }),
  forward: Effect.sync(() => {
    calls.push("forward");
  }),
  find: () =>
    Effect.succeed({ results: Stream.empty, next: () => Effect.void, stop: () => Effect.void }),
  findNext: () => Effect.void,
  stopFind: () => Effect.void,
});

const fakeWindow = (title: string, options: { readonly page?: boolean } = {}) => {
  const calls: string[] = [];
  let closed = false;
  let current: WindowControls.State = { ...state, title };
  const closedError = () => new SewedError({ code: "Closed", message: "Window is closed" });
  const command = (name: string, apply: () => void = () => {}) =>
    Effect.suspend(() => {
      if (closed) return Effect.fail(closedError());
      calls.push(name);
      apply();
      return Effect.void;
    });
  const contents = options.page === false ? undefined : page(calls);
  const core: Controls.Core<never> = {
    show: command("show"),
    showInactive: command("showInactive"),
    hide: command("hide"),
    focus: command("focus"),
    minimize: command("minimize"),
    maximize: command("maximize"),
    restore: command("restore"),
    close: command("close", () => {
      closed = true;
    }),
    setBounds: (update) => command(`setBounds:${update.width ?? "-"}`),
    setFullScreen: (fullScreen) => command(`setFullScreen:${fullScreen}`),
    setTitle: (next) =>
      command(`setTitle:${next}`, () => {
        current = { ...current, title: next };
      }),
    setAlwaysOnTop: (alwaysOnTop, level) =>
      command(`setAlwaysOnTop:${alwaysOnTop}:${level ?? "-"}`),
    setOpacity: (opacity) => command(`setOpacity:${opacity}`),
    setProgress: (progress, mode) => command(`setProgress:${progress}:${mode ?? "-"}`),
    flash: (flash) => command(`flash:${flash}`),
    current: Effect.suspend(() => (closed ? Effect.fail(closedError()) : Effect.succeed(current))),
    state: Stream.unwrap(
      Effect.suspend(() =>
        closed ? Effect.fail(closedError()) : Effect.succeed(Stream.make(current)),
      ),
    ),
    ...(contents === undefined ? {} : { webContents: contents }),
  };
  return {
    core,
    calls,
    close: () => {
      closed = true;
    },
  };
};

type Client = Capability.Operations<RpcGroup.Rpcs<typeof WindowControls.protocol>>;

/** Serves one window's capability and reaches it the way a bound renderer does. */
const withClient = <A, E>(
  window: Controls.Core<never>,
  use: (controls: Client) => Effect.Effect<A, E, never>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Capability.serve(WindowControls.capability);
        const bound = Binding.to(WindowControls.capability.slot, owner);
        return yield* Effect.gen(function* () {
          const controls = yield* WindowControls.capability;
          return yield* use(controls);
        }).pipe(
          Effect.provide(Capability.client(WindowControls.capability)),
          Effect.provide(Binding.layer([bound])),
        );
      }).pipe(Effect.provide(Controls.native(window)), Effect.provide(Testing.main)),
    ),
  );

const codeOf = (exit: { readonly _tag: string; readonly cause?: Cause.Cause<unknown> }) => {
  if (exit._tag !== "Failure" || exit.cause === undefined) return undefined;
  const error = Cause.squash(exit.cause);
  return error instanceof SewedError ? error.code : undefined;
};

test("a served window capability drives the window it was built for", async () => {
  const window = fakeWindow("First");
  const exit = await withClient(window.core, (controls) =>
    Effect.gen(function* () {
      yield* controls.show();
      yield* controls.setTitle({ title: "Renamed" });
      yield* controls.setBounds({ width: 640 });
      yield* controls.maximize();
      const snapshot = yield* controls.state();
      const observed = yield* Stream.runCollect(Stream.take(controls.changes(), 1));
      return [snapshot.title, [...observed][0]?.title] as const;
    }),
  );
  assert.equal(exit._tag, "Success");
  if (exit._tag === "Success") assert.deepEqual(exit.value, ["Renamed", "Renamed"]);
  assert.deepEqual(window.calls, ["show", "setTitle:Renamed", "setBounds:640", "maximize"]);
});

test("two windows are two owners, and each client drives only its own", async () => {
  const first = fakeWindow("First");
  const second = fakeWindow("Second");
  const owners = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const one = yield* Capability.serve(WindowControls.capability).pipe(
          Effect.provide(Controls.native(first.core)),
        );
        const two = yield* Capability.serve(WindowControls.capability).pipe(
          Effect.provide(Controls.native(second.core)),
        );
        return [one.id, two.id] as const;
      }).pipe(Effect.provide(Testing.main)),
    ),
  );
  assert.notEqual(owners[0], owners[1]);
  await withClient(first.core, (controls) => controls.minimize());
  await withClient(second.core, (controls) => controls.maximize());
  assert.deepEqual(first.calls, ["minimize"]);
  assert.deepEqual(second.calls, ["maximize"]);
});

test("a closed window's client fails with Closed", async () => {
  const window = fakeWindow("First");
  window.close();
  assert.equal(codeOf(await withClient(window.core, (controls) => controls.show())), "Closed");
  assert.equal(codeOf(await withClient(window.core, (controls) => controls.state())), "Closed");
  assert.equal(
    codeOf(await withClient(window.core, (controls) => Stream.runCollect(controls.changes()))),
    "Closed",
  );
  assert.deepEqual(window.calls, []);
});

test("a window with no web contents fails its page operations inside their own result", async () => {
  const window = fakeWindow("First", { page: false });
  assert.equal(
    codeOf(await withClient(window.core, (controls) => controls.setZoom({ factor: 1.5 }))),
    "Protocol",
  );
  // A streaming operation must report the missing page on its stream, never before it.
  assert.equal(
    codeOf(await withClient(window.core, (controls) => Stream.runCollect(controls.zoom()))),
    "Protocol",
  );
  assert.equal(
    codeOf(await withClient(window.core, (controls) => Stream.runCollect(controls.history()))),
    "Protocol",
  );
});

test("the page operations reach the window's web contents", async () => {
  const window = fakeWindow("First");
  const exit = await withClient(window.core, (controls) =>
    Effect.gen(function* () {
      yield* controls.setZoom({ factor: 1.5 });
      yield* controls.back();
      return yield* Stream.runCollect(Stream.take(controls.zoom(), 1));
    }),
  );
  assert.equal(exit._tag, "Success");
  assert.deepEqual(window.calls, ["setZoom:1.5", "back"]);
});
