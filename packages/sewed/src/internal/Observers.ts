import { Cause, Effect, Queue, Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

type Observer<A> = Queue.Queue<A, SewedError | Cause.Done>;

/**
 * A set of independent bounded observers over one event source: each subscriber owns a queue of
 * 128 values and fails with `Limit` on overflow, and `finish` ends every subscriber at once.
 */
export const make = <A>(what: string) => {
  const observers = new Set<Observer<A>>();
  let finished = false;
  return {
    publish(value: A) {
      if (finished) return;
      for (const queue of observers) {
        if (!Queue.offerUnsafe(queue, value))
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(
              new SewedError({ code: "Limit", message: `${what} observer queue is full` }),
            ),
          );
      }
    },
    finish() {
      if (finished) return;
      finished = true;
      for (const queue of observers) Queue.endUnsafe(queue);
      observers.clear();
    },
    get finished() {
      return finished;
    },
    stream: Stream.callback<A, SewedError, MainContext>(
      (queue) =>
        Effect.gen(function* () {
          yield* MainContext;
          yield* Effect.acquireRelease(
            Effect.suspend(() =>
              finished
                ? Effect.fail(new SewedError({ code: "Closed", message: `${what} is closed` }))
                : Effect.sync(() => {
                    observers.add(queue);
                  }),
            ),
            () =>
              Effect.sync(() => {
                observers.delete(queue);
              }),
          );
        }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
      { bufferSize: 128 },
    ),
  };
};
