import { powerSaveBlocker } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import * as PowerSaveBlocker from "../PowerSaveBlocker.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

export { Kind } from "../PowerSaveBlocker.ts";

const decodeKind = Schema.decodeUnknownSync(PowerSaveBlocker.Kind);

export interface Handle {
  readonly kind: PowerSaveBlocker.Kind;
  /** Whether Electron still holds the block; false once the scope released it. */
  readonly active: Effect.Effect<boolean, SewedError, MainContext>;
}

/** Holds a power save block for the scope's lifetime; closing the scope releases it. */
export const hold = (
  kind: PowerSaveBlocker.Kind,
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const value = yield* Effect.try({
      try: () => decodeKind(kind),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid power save blocker kind", cause }),
    });
    const id = yield* Effect.acquireRelease(
      Effect.try({
        try: () => powerSaveBlocker.start(value),
        catch: (cause) =>
          new SewedError({ code: "Native", message: "Could not start power save blocker", cause }),
      }),
      (started) =>
        Effect.sync(() => {
          if (powerSaveBlocker.isStarted(started)) powerSaveBlocker.stop(started);
        }),
    );
    return {
      kind: value,
      active: Effect.andThen(
        MainContext,
        Effect.sync(() => powerSaveBlocker.isStarted(id)),
      ),
    };
  });
