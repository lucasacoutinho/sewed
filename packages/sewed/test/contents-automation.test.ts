import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Cause, Effect, Schema } from "effect";
import type { MainContext } from "../src/RuntimeContext.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as ContentsAutomation from "../src/internal/ContentsAutomation.ts";

const control = {
  isClosed: () => false,
  closedError: () => new SewedError({ code: "Closed", message: "closed" }),
};

const fakeContents = () => {
  const calls: unknown[] = [];
  const debuggerEvents = new EventEmitter();
  let attached = false;
  let held = false;
  const contents: ContentsAutomation.Contents = {
    isDestroyed: () => false,
    executeJavaScript: (code) =>
      code === "throw" ? Promise.reject(new Error("boom")) : Promise.resolve({ n: 1 }),
    sendInputEvent: (event) => {
      calls.push(event);
    },
    debugger: {
      attach: () => {
        if (held) throw new Error("Another debugger is already attached to this target");
        attached = true;
      },
      detach: () => {
        attached = false;
        debuggerEvents.emit("detach", undefined, "target closed");
      },
      isAttached: () => attached,
      on: (event, listener) => {
        debuggerEvents.on(event, listener);
      },
      off: (event, listener) => {
        debuggerEvents.off(event, listener);
      },
      sendCommand: (method, params) => {
        calls.push([method, params]);
        return Promise.resolve({ ok: true });
      },
    },
  };
  return {
    contents,
    calls,
    attached: () => attached,
    detachListenerCount: () => debuggerEvents.listenerCount("detach"),
    hold: () => {
      held = true;
    },
    detachForeign: () => {
      attached = false;
      debuggerEvents.emit("detach", undefined, "target closed");
    },
    attachForeign: () => {
      attached = true;
    },
  };
};

const fakeContentsWithDestroyingDebugger = () => {
  const calls: unknown[] = [];
  const debuggerEvents = new EventEmitter();
  let attached = false;
  let destroyed = false;
  let debuggerReads = 0;
  const nativeDebugger: ContentsAutomation.DebuggerLike = {
    attach: () => {
      attached = true;
    },
    detach: () => {
      attached = false;
      debuggerEvents.emit("detach", undefined, "target closed");
    },
    isAttached: () => attached,
    on: (event, listener) => {
      debuggerEvents.on(event, listener);
    },
    off: (event, listener) => {
      debuggerEvents.off(event, listener);
    },
    sendCommand: (method, params) => {
      calls.push([method, params]);
      return Promise.resolve({ ok: true });
    },
  };
  const contents: ContentsAutomation.Contents = {
    isDestroyed: () => destroyed,
    executeJavaScript: () => Promise.resolve(undefined),
    sendInputEvent: () => undefined,
    get debugger() {
      debuggerReads += 1;
      if (destroyed) throw new Error("contents have been destroyed");
      return nativeDebugger;
    },
  };
  return {
    contents,
    calls,
    attached: () => attached,
    debuggerReads: () => debuggerReads,
    detachListenerCount: () => debuggerEvents.listenerCount("detach"),
    destroy: () => {
      destroyed = true;
    },
    detach: () => {
      attached = false;
      debuggerEvents.emit("detach", undefined, "target closed");
    },
  };
};

const run = <A, E>(effect: Effect.Effect<A, E, MainContext>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(Testing.main)));
const codeOf = (exit: { readonly _tag: string; readonly cause?: Cause.Cause<unknown> }) => {
  if (exit._tag !== "Failure" || exit.cause === undefined) return undefined;
  const error = Cause.squash(exit.cause);
  return error instanceof SewedError ? error.code : undefined;
};

test("evaluate decodes the page result with the caller's schema", async () => {
  const { contents, detachListenerCount } = fakeContents();
  const { automation } = ContentsAutomation.make({ evaluate: true } as const, contents, control);
  assert.equal(detachListenerCount(), 0);
  const exit = await run(automation.evaluate("1", Schema.Struct({ n: Schema.Finite })));
  assert.equal(detachListenerCount(), 0);
  assert.equal(exit._tag, "Success");
  assert.equal(
    codeOf(await run(automation.evaluate("1", Schema.Struct({ n: Schema.String })))),
    "Protocol",
  );
  assert.equal(codeOf(await run(automation.evaluate("throw", Schema.Unknown))), "Native");
});

test("devtools owns one attachment, enforces the allowlist, and rejects another automation owner", async () => {
  const { contents, calls, attached, detachListenerCount } = fakeContents();
  const { automation, release } = ContentsAutomation.make(
    { devtools: ["Runtime.evaluate"] } as const,
    contents,
    control,
  );
  assert.equal(detachListenerCount(), 0);
  const exit = await run(
    automation.devtools(
      "Runtime.evaluate",
      { expression: "1" },
      Schema.Struct({ ok: Schema.Boolean }),
    ),
  );
  assert.equal(exit._tag, "Success");
  assert.equal(attached(), true);
  assert.equal(detachListenerCount(), 1);
  assert.deepEqual(calls, [["Runtime.evaluate", { expression: "1" }]]);
  const wider = ContentsAutomation.make(
    { devtools: ["Runtime.evaluate", "DOM.getDocument"] } as const,
    contents,
    control,
  );
  assert.equal(
    codeOf(await run(wider.automation.devtools("Runtime.evaluate", undefined, Schema.Unknown))),
    "Limit",
  );
  wider.release();
  assert.equal(attached(), true);
  release();
  assert.equal(attached(), false);
  assert.equal(detachListenerCount(), 0);
});

test("external detach clears ownership before another debugger attaches", async () => {
  const { contents, calls, attached, detachForeign, attachForeign, detachListenerCount } =
    fakeContents();
  const { automation, release } = ContentsAutomation.make(
    { devtools: ["Runtime.evaluate"] } as const,
    contents,
    control,
  );
  assert.equal(
    (
      await run(
        automation.devtools(
          "Runtime.evaluate",
          { expression: "1" },
          Schema.Struct({ ok: Schema.Boolean }),
        ),
      )
    )._tag,
    "Success",
  );
  assert.equal(attached(), true);
  assert.equal(detachListenerCount(), 1);

  detachForeign();
  assert.equal(attached(), false);
  assert.equal(detachListenerCount(), 0);
  attachForeign();
  assert.equal(attached(), true);

  assert.equal(
    codeOf(await run(automation.devtools("Runtime.evaluate", undefined, Schema.Unknown))),
    "Limit",
  );
  assert.equal(detachListenerCount(), 0);
  release();
  assert.equal(attached(), true);
  assert.equal(detachListenerCount(), 0);
  assert.deepEqual(calls, [["Runtime.evaluate", { expression: "1" }]]);
});

test("detach observation and release use the captured debugger after contents destruction", async () => {
  const detached = fakeContentsWithDestroyingDebugger();
  const first = ContentsAutomation.make(
    { devtools: ["Runtime.evaluate"] } as const,
    detached.contents,
    control,
  );
  assert.equal(detached.debuggerReads(), 1);
  assert.equal(
    (await run(first.automation.devtools("Runtime.evaluate", undefined, Schema.Unknown)))._tag,
    "Success",
  );
  assert.equal(detached.debuggerReads(), 1);
  assert.equal(detached.detachListenerCount(), 1);
  detached.destroy();
  assert.doesNotThrow(detached.detach);
  assert.equal(detached.attached(), false);
  assert.equal(detached.detachListenerCount(), 0);
  assert.doesNotThrow(first.release);
  assert.equal(detached.debuggerReads(), 1);

  const released = fakeContentsWithDestroyingDebugger();
  const second = ContentsAutomation.make(
    { devtools: ["Runtime.evaluate"] } as const,
    released.contents,
    control,
  );
  assert.equal(
    (await run(second.automation.devtools("Runtime.evaluate", undefined, Schema.Unknown)))._tag,
    "Success",
  );
  assert.equal(released.detachListenerCount(), 1);
  released.destroy();
  assert.doesNotThrow(second.release);
  assert.equal(released.debuggerReads(), 1);
  assert.equal(released.detachListenerCount(), 0);
  assert.equal(released.attached(), true);
  assert.deepEqual(released.calls, [["Runtime.evaluate", undefined]]);
});

test("a debugger held by another client fails with Limit", async () => {
  const { contents, hold } = fakeContents();
  hold();
  const { automation } = ContentsAutomation.make(
    { devtools: ["DOM.getDocument"] } as const,
    contents,
    control,
  );
  assert.equal(
    codeOf(await run(automation.devtools("DOM.getDocument", undefined, Schema.Unknown))),
    "Limit",
  );
});

test("a pre-attached debugger conflicts with devtools and survives release", async () => {
  const { contents, calls, attached, attachForeign, detachListenerCount } = fakeContents();
  attachForeign();
  const { automation, release } = ContentsAutomation.make(
    { devtools: ["DOM.getDocument"] } as const,
    contents,
    control,
  );
  assert.equal(
    codeOf(await run(automation.devtools("DOM.getDocument", undefined, Schema.Unknown))),
    "Limit",
  );
  assert.deepEqual(calls, []);
  assert.equal(detachListenerCount(), 0);
  release();
  assert.equal(attached(), true);
  assert.equal(detachListenerCount(), 0);
});

test("evaluate, input, undeclared devtools, and release leave a foreign debugger attached", async () => {
  const { contents, attached, attachForeign } = fakeContents();
  attachForeign();
  const { automation, release } = ContentsAutomation.make(
    { evaluate: true, input: true } as const,
    contents,
    control,
  );
  assert.equal(
    (await run(automation.evaluate("1", Schema.Struct({ n: Schema.Finite }))))._tag,
    "Success",
  );
  assert.equal((await run(automation.input({ type: "keyDown", keyCode: "a" })))._tag, "Success");
  const members: Record<string, unknown> = automation;
  const devtools = members.devtools;
  if (typeof devtools === "function")
    assert.equal(
      codeOf(await run(devtools("Runtime.evaluate", undefined, Schema.Unknown))),
      "Protocol",
    );
  assert.equal(attached(), true);
  release();
  assert.equal(attached(), true);
});

test("undeclared members exist at runtime and fail with Protocol", async () => {
  const { contents, detachListenerCount } = fakeContents();
  const { automation } = ContentsAutomation.make(undefined, contents, control);
  assert.equal(detachListenerCount(), 0);
  const members: Record<string, unknown> = automation;
  const evaluate = members.evaluate;
  assert.equal(typeof evaluate, "function");
  if (typeof evaluate === "function")
    assert.equal(codeOf(await run(evaluate("1", Schema.Unknown))), "Protocol");
  const devtools = members.devtools;
  if (typeof devtools === "function")
    assert.equal(
      codeOf(await run(devtools("Runtime.evaluate", undefined, Schema.Unknown))),
      "Protocol",
    );
  assert.equal(detachListenerCount(), 0);
});

test("input decodes the event, copies it, and rejects an invalid one", async () => {
  const { contents, calls, detachListenerCount } = fakeContents();
  const { automation } = ContentsAutomation.make({ input: true } as const, contents, control);
  assert.equal(detachListenerCount(), 0);
  const sent = await run(automation.input({ type: "keyDown", keyCode: "a", modifiers: ["shift"] }));
  assert.equal(detachListenerCount(), 0);
  assert.equal(sent._tag, "Success");
  assert.deepEqual(calls, [{ type: "keyDown", keyCode: "a", modifiers: ["shift"] }]);
  const invalid: unknown = { type: "keyDown" };
  const members: Record<string, unknown> = automation;
  const input = members.input;
  if (typeof input === "function") assert.equal(codeOf(await run(input(invalid))), "Protocol");
  assert.equal(detachListenerCount(), 0);
});
