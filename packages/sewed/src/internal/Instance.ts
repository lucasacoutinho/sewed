import { Effect, Schema } from "effect";
import type { Scope, Stream } from "effect";
import { SecondInstance } from "../Launch.ts";
import { SewedError } from "../SewedError.ts";
import * as LaunchQueue from "./LaunchQueue.ts";

/**
 * Another process already holds the single-instance lock. Electron forwarded this process's
 * arguments, working directory and claim data to it inside the lock request, so nothing is lost;
 * what remains is for the program to decide how this process exits.
 */
export class SecondaryInstance extends Schema.TaggedError<SecondaryInstance>()(
  "SecondaryInstance",
  {},
) {
  override get message(): string {
    return "Another process holds the single-instance lock; this launch was forwarded to it";
  }
}

export interface Options {
  /** A JSON object forwarded to the primary process when this one turns out to be secondary. */
  readonly data?: Schema.JsonObject;
}

/** The claimed single instance: the launches of later processes, for as long as the claim's scope lives. */
export interface Instance {
  readonly launches: Stream.Stream<SecondInstance, SewedError>;
}

type Listener = (
  event: unknown,
  argv: string[],
  workingDirectory: string,
  additionalData: unknown,
) => void;

/** The slice of Electron's `app` a claim uses; `App.ts` hands this module the real one. */
export interface Native {
  requestSingleInstanceLock(data?: Record<string, unknown>): boolean;
  releaseSingleInstanceLock(): void;
  on(event: "second-instance", listener: Listener): unknown;
  off(event: "second-instance", listener: Listener): unknown;
}

const decodeData = Schema.decodeUnknownSync(Schema.JsonObject);
const decodeLaunch = Schema.decodeUnknownSync(SecondInstance);

/**
 * The single-instance claim over one native `app`. One claim may be held at a time; a second
 * fails `Limit` rather than asking Electron, which would answer `true` to the holder and leave two
 * scopes believing they own one lock.
 */
export const make = (native: Native) => {
  let held = false;
  const claim = (
    options: Options = {},
  ): Effect.Effect<Instance, SewedError | SecondaryInstance, Scope.Scope> =>
    Effect.acquireRelease(
      Effect.suspend(
        (): Effect.Effect<
          { readonly instance: Instance; readonly release: () => void },
          SewedError | SecondaryInstance
        > => {
          if (held)
            return Effect.fail(
              new SewedError({ code: "Limit", message: "The single instance is already claimed" }),
            );
          let data: Schema.JsonObject;
          try {
            data = decodeData(options.data ?? {});
          } catch (cause) {
            return Effect.fail(
              new SewedError({ code: "Protocol", message: "Invalid instance data", cause }),
            );
          }
          let primary: boolean;
          try {
            primary = native.requestSingleInstanceLock(data);
          } catch (cause) {
            return Effect.fail(
              new SewedError({
                code: "Native",
                message: "Could not request the single-instance lock",
                cause,
              }),
            );
          }
          if (!primary) return Effect.fail(new SecondaryInstance({}));
          const queue = LaunchQueue.make("Second-instance launch", decodeLaunch);
          const listener: Listener = (_event, argv, workingDirectory, additionalData) =>
            queue.offer({
              arguments: argv,
              workingDirectory,
              additionalData: additionalData ?? null,
            });
          try {
            native.on("second-instance", listener);
          } catch (cause) {
            native.releaseSingleInstanceLock();
            return Effect.fail(
              new SewedError({
                code: "Native",
                message: "Could not observe second instances",
                cause,
              }),
            );
          }
          held = true;
          return Effect.succeed({
            instance: { launches: queue.launches },
            // Every step runs even if an earlier one throws, and `held` always ends up false:
            // a broken `off` or `releaseSingleInstanceLock` must not leave the claim stuck forever.
            // The first failure still propagates, as the finalizer's own defect, once the state is
            // consistent.
            release: () => {
              let failure: unknown;
              const step = (run: () => void) => {
                try {
                  run();
                } catch (cause) {
                  failure ??= cause;
                }
              };
              step(() => native.off("second-instance", listener));
              step(queue.end);
              step(() => native.releaseSingleInstanceLock());
              held = false;
              if (failure !== undefined) throw failure;
            },
          });
        },
      ),
      ({ release }) => Effect.sync(release),
    ).pipe(Effect.map(({ instance }) => instance));
  return { claim };
};
