import { Effect } from "effect";

/**
 * Answers a native Electron callback exactly once, from a resolution that runs outside any native
 * callback's own stack. Four call sites share this: `App.ts`'s `certificate-error` and `login`,
 * `internal/Session.ts`'s certificate proc, and `internal/DisplayMedia.ts`'s display-media handler.
 * Each used to answer with its own hand-rolled `Effect.runFork(Effect.map(...))` or
 * `Effect.runPromise(...).then(...)`, none of them total: a decider that dies, a `reply` that
 * throws (Electron validates what it is handed and can reject it), or an interruption all left the
 * native callback never called, with the defect vanishing silently. `internal/CloseGate.ts` already
 * gets this right for a fire-and-forget close/quit decision; this is the same shape for a call site
 * that must still answer *something* even when the happy path does not complete.
 *
 * If `resolution` succeeds and `reply` returns without throwing, that is the whole story — nothing
 * is logged. On any other exit — `resolution` dies or is interrupted, or `reply` itself throws — the
 * cause is logged naming `label`, and `failed` is attempted exactly once, answering the native
 * callback with whatever "this could not be decided" means at that call site (Chromium's own
 * verdict, a cancelled login, a denied screen-share). A throw from `failed` is logged and swallowed:
 * by then there is nothing left to roll back to.
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
}): void => {
  Effect.runFork(
    Effect.gen(function* () {
      const settled = yield* Effect.exit(
        Effect.andThen(options.resolution, (answer) => Effect.sync(() => options.reply(answer))),
      );
      if (settled._tag === "Success") return;
      yield* Effect.logError(
        `Native callback for "${options.label}" was not answered; falling back`,
        settled.cause,
      );
      const closed = yield* Effect.exit(Effect.sync(() => options.failed()));
      if (closed._tag === "Failure")
        yield* Effect.logError(
          `Native fallback reply for "${options.label}" itself failed`,
          closed.cause,
        );
    }),
  );
};
