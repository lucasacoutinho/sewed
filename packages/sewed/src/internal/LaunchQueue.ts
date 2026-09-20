import { Cause, Effect, Queue, Stream } from "effect";
import { SewedError } from "../SewedError.ts";

export interface LaunchQueue<A> {
  /** Decodes and enqueues one native launch; a bad or oversized one fails the consumer instead. */
  readonly offer: (value: unknown) => void;
  /** The launches, in order, to exactly one draining consumer at a time. */
  readonly launches: Stream.Stream<A, SewedError>;
  /** Ends the queue: buffered launches still drain, and a later consumer fails `Closed`. */
  readonly end: () => void;
}

/**
 * One ordered, bounded queue of launch requests. Two owners share it: the application's own
 * launches (`internal/AppRuntime.ts`: initial, file, url) and a claimed instance's second-instance
 * launches (`internal/Instance.ts`). Launches offered before a consumer exists are retained, so a
 * launch that arrives before the program subscribes is not lost; the capacity is 128 and a launch
 * is at most 256 KiB, and overflow of either fails the consumer with `Limit` after what was
 * buffered drains. There is exactly one draining consumer; a second fails `Limit`.
 */
export const make = <A>(what: string, decode: (value: unknown) => A): LaunchQueue<A> => {
  const queue = Effect.runSync(
    Queue.make<A, SewedError | Cause.Done>({ capacity: 128, strategy: "dropping" }),
  );
  let observing = false;
  let closed = false;
  return {
    offer(value) {
      if (closed) return;
      try {
        const request = decode(value);
        if (Buffer.byteLength(JSON.stringify(request)) > 262144) {
          throw new SewedError({ code: "Limit", message: `${what} exceeds 256 KiB` });
        }
        if (!Queue.offerUnsafe(queue, request)) {
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(new SewedError({ code: "Limit", message: `${what} queue is full` })),
          );
        }
      } catch (cause) {
        Queue.failCauseUnsafe(
          queue,
          Cause.fail(
            cause instanceof SewedError
              ? cause
              : new SewedError({
                  code: "Protocol",
                  message: `Invalid ${what.toLowerCase()}`,
                  cause,
                }),
          ),
        );
      }
    },
    launches: Stream.unwrap(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.suspend(() => {
            if (closed)
              return Effect.fail(
                new SewedError({ code: "Closed", message: `${what} owner is closed` }),
              );
            if (observing)
              return Effect.fail(
                new SewedError({ code: "Limit", message: `${what} already has a consumer` }),
              );
            observing = true;
            return Effect.void;
          }),
          () =>
            Effect.sync(() => {
              observing = false;
            }),
        );
        return Stream.fromQueue(queue);
      }),
    ),
    end() {
      closed = true;
      Queue.endUnsafe(queue);
    },
  };
};
