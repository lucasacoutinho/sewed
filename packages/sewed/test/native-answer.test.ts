import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import * as NativeAnswer from "../src/internal/NativeAnswer.ts";

/**
 * Every resolution below is a synchronous Effect (`Effect.succeed`, `Effect.die`,
 * `Effect.interrupt`) with no real suspension point, so `Effect.runFork`'s fiber runs to completion
 * — reply, log, and any fallback `failed()` call included — before `NativeAnswer.run` itself
 * returns. Asserting immediately after the call is not a race: there is no pending work left to
 * race against, which is also what lets these tests avoid a fixed sleep entirely, positive or
 * negative.
 *
 * `internal/NativeAnswer.ts`'s own `Effect.runFork` uses the default runtime, not whatever context
 * a wrapping `Effect.provide` in a test establishes — the same reason
 * `decision-registry.test.ts`'s hook-detach test captures `console.log` rather than installing an
 * `Effect.provide(Logger.layer(...))` around the call. The default logger writes there.
 */
const capturedLog = (run: () => void): readonly string[] => {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    run();
  } finally {
    console.log = original;
  }
  return lines;
};

test("replies with the answer when the resolution succeeds", () => {
  const replies: string[] = [];
  NativeAnswer.run({
    label: "test/answer",
    resolution: Effect.succeed("allow"),
    reply: (answer: string) => replies.push(answer),
    failed: () => replies.push("closed"),
  });
  assert.deepEqual(replies, ["allow"]);
});

test("replies with the closed form when the resolution dies", () => {
  const replies: string[] = [];
  capturedLog(() => {
    NativeAnswer.run({
      label: "test/answer",
      resolution: Effect.die(new Error("decider boom")),
      reply: (answer: string) => replies.push(answer),
      failed: () => replies.push("closed"),
    });
  });
  assert.deepEqual(replies, ["closed"]);
});

test("replies with the closed form when reply itself throws", () => {
  const attempts: string[] = [];
  capturedLog(() => {
    NativeAnswer.run({
      label: "test/answer",
      resolution: Effect.succeed("allow"),
      reply: () => {
        attempts.push("reply");
        throw new Error("Electron rejected the answer");
      },
      failed: () => attempts.push("closed"),
    });
  });
  assert.deepEqual(attempts, ["reply", "closed"]);
});

test("replies with the closed form when the resolution is interrupted", () => {
  const replies: string[] = [];
  capturedLog(() => {
    NativeAnswer.run({
      label: "test/answer",
      resolution: Effect.interrupt,
      reply: (answer: string) => replies.push(answer),
      failed: () => replies.push("closed"),
    });
  });
  assert.deepEqual(replies, ["closed"]);
});

test("never replies twice: a settled resolution runs exactly one of reply or failed, never both", () => {
  const succeeded: string[] = [];
  capturedLog(() => {
    NativeAnswer.run({
      label: "test/answer-success",
      resolution: Effect.succeed("allow"),
      reply: (answer: string) => succeeded.push(`reply:${answer}`),
      failed: () => succeeded.push("failed"),
    });
  });
  assert.deepEqual(succeeded, ["reply:allow"]);

  const died: string[] = [];
  capturedLog(() => {
    NativeAnswer.run({
      label: "test/answer-died",
      resolution: Effect.die(new Error("decider boom")),
      reply: (answer: string) => died.push(`reply:${answer}`),
      failed: () => died.push("failed"),
    });
  });
  assert.deepEqual(died, ["failed"]);
});

test("logs the cause naming the label when the resolution does not settle successfully", () => {
  const lines = capturedLog(() => {
    NativeAnswer.run({
      label: "test/logged-answer",
      resolution: Effect.die(new Error("decider boom")),
      reply: () => {},
      failed: () => {},
    });
  });
  assert.ok(
    lines.some((line) => line.includes("test/logged-answer") && line.includes("decider boom")),
    lines.join("\n"),
  );
});

test("survives a throwing failed: the defect is logged and swallowed rather than escaping", () => {
  let threw = false;
  const lines = capturedLog(() => {
    try {
      NativeAnswer.run({
        label: "test/answer",
        resolution: Effect.die(new Error("decider boom")),
        reply: () => {},
        failed: () => {
          throw new Error("native reply rejected the closed form too");
        },
      });
    } catch {
      threw = true;
    }
  });
  assert.equal(threw, false, "a throwing failed() must not escape run()");
  assert.ok(
    lines.some((line) => line.includes("native reply rejected the closed form too")),
    lines.join("\n"),
  );
});
