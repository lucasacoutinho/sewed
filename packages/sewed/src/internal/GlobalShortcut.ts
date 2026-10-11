import { globalShortcut } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import * as GlobalShortcut from "../GlobalShortcut.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
export { Accelerator } from "../GlobalShortcut.ts";

const decodeAccelerator = Schema.decodeUnknownSync(GlobalShortcut.Accelerator);
type Observer = Queue.Queue<void, SewedError | Cause.Done>;

const closedError = () => new SewedError({ code: "Closed", message: "Global shortcut is closed" });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const limitError = () =>
  new SewedError({ code: "Limit", message: "Global shortcut observer queue is full" });

export interface Handle {
  readonly accelerator: string;
  readonly presses: Stream.Stream<void, SewedError, MainContext>;
}

export const register = (
  accelerator: string,
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const observers = new Set<Observer>();
    let closed = false;
    const value = yield* Effect.try({
      try: () => decodeAccelerator(accelerator),
      catch: (cause) => nativeError("Could not validate global shortcut accelerator", cause),
    });
    const onPress = () => {
      if (closed) return;
      for (const queue of observers) {
        if (!Queue.offerUnsafe(queue, undefined)) {
          Queue.failCauseUnsafe(queue, Cause.fail(limitError()));
        }
      }
    };
    const owned = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          if (globalShortcut.isRegistered(value)) {
            throw new SewedError({
              code: "Native",
              message: "Global shortcut is already registered",
            });
          }
          if (!globalShortcut.register(value, onPress)) {
            throw new SewedError({
              code: "Native",
              message: "Global shortcut is unavailable or invalid",
            });
          }
          return value;
        },
        catch: (cause) =>
          cause instanceof SewedError
            ? cause
            : nativeError("Could not register global shortcut", cause),
      }),
      (registered) =>
        Effect.sync(() => {
          closed = true;
          for (const queue of observers) {
            Queue.endUnsafe(queue);
          }
          observers.clear();
          globalShortcut.unregister(registered);
        }),
    );

    const observe = (queue: Observer): Effect.Effect<void, SewedError, Scope.Scope> =>
      Effect.acquireRelease(
        Effect.suspend(() =>
          closed
            ? Effect.fail(closedError())
            : Effect.sync(() => {
                observers.add(queue);
              }),
        ),
        () =>
          Effect.sync(() => {
            observers.delete(queue);
          }),
      );
    const presses: Stream.Stream<void, SewedError, MainContext> = Stream.callback(
      (queue) =>
        Effect.gen(function* () {
          yield* MainContext;
          yield* observe(queue);
        }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
      { bufferSize: 128 },
    );

    return { accelerator: owned, presses };
  });

const decodeFlag = Schema.decodeUnknownSync(Schema.Boolean);
const operation = <A>(message: string, run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({ try: run, catch: (cause) => nativeError(message, cause) }),
  );

/** Whether every registered shortcut is currently suspended. */
export const suspended: Effect.Effect<boolean, SewedError, MainContext> = operation(
  "Could not read global shortcut suspension",
  () => globalShortcut.isSuspended(),
);

/**
 * Suspends or resumes every registered shortcut without unregistering any, for example while the
 * user records a new key combination.
 */
export const setSuspended = (flag: boolean): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeFlag(flag),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid suspension flag", cause }),
    }),
    (value) =>
      operation("Could not change global shortcut suspension", () => {
        globalShortcut.setSuspended(value);
      }),
  );
