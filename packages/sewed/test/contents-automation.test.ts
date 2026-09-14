import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Schema } from "effect";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as ContentsAutomation from "../src/internal/ContentsAutomation.ts";

const control = {
  isClosed: () => false,
  closedError: () => new SewedError({ code: "Closed", message: "closed" }),
};

const fakeContents = () => {
  const calls: unknown[] = [];
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
      },
      isAttached: () => attached,
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
    hold: () => {
      held = true;
    },
  };
};

const run = <A, E>(effect: Effect.Effect<A, E, unknown>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(Testing.main)));
const codeOf = (exit: { readonly _tag: string; readonly cause?: Cause.Cause<unknown> }) => {
  if (exit._tag !== "Failure" || exit.cause === undefined) return undefined;
  const error = Cause.squash(exit.cause);
  return error instanceof SewedError ? error.code : undefined;
};

test("evaluate decodes the page result with the caller's schema", async () => {
  const { contents } = fakeContents();
  const { automation } = ContentsAutomation.make({ evaluate: true } as const, contents, control);
  const exit = await run(automation.evaluate("1", Schema.Struct({ n: Schema.Number })));
  assert.equal(exit._tag, "Success");
  assert.equal(
    codeOf(await run(automation.evaluate("1", Schema.Struct({ n: Schema.String })))),
    "Protocol",
  );
  assert.equal(codeOf(await run(automation.evaluate("throw", Schema.Unknown))), "Native");
});

test("devtools attaches once, enforces the allowlist, and releases on demand", async () => {
  const { contents, calls, attached } = fakeContents();
  const { automation, release } = ContentsAutomation.make(
    { devtools: ["Runtime.evaluate"] } as const,
    contents,
    control,
  );
  const exit = await run(
    automation.devtools(
      "Runtime.evaluate",
      { expression: "1" },
      Schema.Struct({ ok: Schema.Boolean }),
    ),
  );
  assert.equal(exit._tag, "Success");
  assert.equal(attached(), true);
  assert.deepEqual(calls, [["Runtime.evaluate", { expression: "1" }]]);
  const wider = ContentsAutomation.make(
    { devtools: ["Runtime.evaluate", "DOM.getDocument"] } as const,
    contents,
    control,
  );
  assert.equal(
    codeOf(await run(wider.automation.devtools("Runtime.evaluate", undefined, Schema.Unknown))),
    undefined,
  );
  release();
  assert.equal(attached(), false);
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

test("undeclared members exist at runtime and fail with Protocol", async () => {
  const { contents } = fakeContents();
  const { automation } = ContentsAutomation.make(undefined, contents, control);
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
});

test("input decodes the event, copies it, and rejects an invalid one", async () => {
  const { contents, calls } = fakeContents();
  const { automation } = ContentsAutomation.make({ input: true } as const, contents, control);
  const sent = await run(automation.input({ type: "keyDown", keyCode: "a", modifiers: ["shift"] }));
  assert.equal(sent._tag, "Success");
  assert.deepEqual(calls, [{ type: "keyDown", keyCode: "a", modifiers: ["shift"] }]);
  const invalid: unknown = { type: "keyDown" };
  const members: Record<string, unknown> = automation;
  const input = members.input;
  if (typeof input === "function") assert.equal(codeOf(await run(input(invalid))), "Protocol");
});
