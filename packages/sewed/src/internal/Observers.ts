import { Cause, Effect, Queue, Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

type Observer<A> = Queue.Queue<A, SewedError | Cause.Done>;

/**
 * A set of independent bounded observers over one event source: each subscriber owns a queue of
 * 128 values and fails with `Limit` on overflow, and `finish` ends every subscriber at once. With
 * `replayLatest`, a new subscriber first receives the most recent value.
 */
export const make = <A>(what: string, options: { readonly replayLatest?: boolean } = {}) => {
  const observers = new Set<Observer<A>>();
  let finished = false;
  let latest: A | undefined;
  return {
    publish(value: A) {
      if (finished) return;
      if (options.replayLatest === true) latest = value;
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
                    if (latest !== undefined) Queue.offerUnsafe(queue, latest);
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
