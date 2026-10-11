import { Effect } from "effect";
import type { Fiber } from "effect";

/**
 * Answers a native Electron callback exactly once, from a resolution that runs outside any native
 * callback's own stack. Several call sites share this, among them `App.ts`'s `certificate-error` and `login`,
 * `internal/Session.ts`'s certificate proc, and `internal/DisplayMedia.ts`'s display-media handler.
 * Each used to answer with its own hand-rolled `Effect.runFork(Effect.map(...))` or
 * `Effect.runPromise(...).then(...)`, none of them total: a decider that dies, a `reply` that
 * throws (Electron validates what it is handed and can reject it), or an interruption all left the
 * native callback never called, with the defect vanishing silently. `internal/CloseGate.ts` already
 * gets this right for a fire-and-forget close/quit decision; this is the same shape for a call site
 * that must still answer *something* even when the happy path does not complete.
 *
 * If `resolution` succeeds and `reply` returns without throwing, that is the whole story — nothing
 * is logged. On a resolution that fails, dies, or is interrupted, or a `reply` that throws, `failed`
 * runs first and is attempted exactly once, answering the native callback with whatever "this could
 * not be decided" means at that call site (a rejected certificate, a cancelled login, a denied
 * screen-share); the cause is logged after, naming `label`, so a decider's own hostile answer cannot
 * cost the reply the way it could cost the diagnostic. Both logs are contained the way
 * `internal/DecisionRegistry.ts`'s own failure log is: rendering a cause reads properties off a value
 * a decider controls, and a `message`/`stack` getter that throws — or a sink (a patched `console`, a
 * closed stream) that throws — must not be able to unwind past `failed` and leave the callback
 * unanswered. A throw from `failed` itself is logged and swallowed the same contained way: by then
 * there is nothing left to roll back to.
 *
 * "On a resolution that fails, dies, or is interrupted" is deliberately narrower than "any exit at
 * all": it covers the resolution suspending and later settling one of those ways, and a `reply` that
 * throws once the resolution succeeds. It does not cover the forked fiber this function starts being
 * interrupted from the outside. That fiber is returned for the one caller that means exactly this:
 * `internal/ContentsBluetooth.ts` interrupts a resolution a newer scan report has superseded, and
 * the interrupted run skips both the log and `failed`, since nothing after the interrupted `yield*`
 * runs — the newer run owns the answer.
 *
 * Deliberately no timeout. A login prompt, a certificate dialog, and a screen-share picker are all
 * human-paced; a library-imposed deadline would be a guess about how long a person takes to answer
 * one. A decider that never completes leaves its native callback never called — that decider's
 * liveness is its author's responsibility, not this module's.
 */
export const run = <A>(options: {
  readonly label: string;
  readonly resolution: Effect.Effect<A>;
  readonly reply: (answer: A) => void;
  readonly failed: () => void;
}): Fiber.Fiber<void> => {
  // Contains a failure log exactly the way `DecisionRegistry.ts`'s own does: the cause being
  // reported is a decider's own answer or defect, and rendering it reads properties a hostile value
  // can make throw. That must never be able to escape this function — it runs after `failed` has
  // already answered the callback, but it is still the only diagnostic a stuck decider leaves.
  const reported = (reason: string, cause: unknown) =>
    Effect.catchDefect(Effect.logError(reason, cause), () =>
      Effect.logError(`${reason} (its cause could not be rendered)`),
    );
  return Effect.runFork(
    Effect.gen(function* () {
      const settled = yield* Effect.exit(
        Effect.andThen(options.resolution, (answer) => Effect.sync(() => options.reply(answer))),
      );
      if (settled._tag === "Success") return;
      const closed = yield* Effect.exit(Effect.sync(() => options.failed()));
      yield* reported(
        `Native callback for "${options.label}" was not answered; falling back`,
        settled.cause,
      );
      if (closed._tag === "Failure")
        yield* reported(`Native fallback reply for "${options.label}" itself failed`, closed.cause);
    }),
  );
};
