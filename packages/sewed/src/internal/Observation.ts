import type { EventEmitter } from "node:events";
import { Cause, Effect, Queue, Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

/**
 * A stream where every observer owns its native registration and a queue of 128 values;
 * overflow fails that observer with `Limit` and leaves the others untouched.
 */
export const listen = <A>(
  what: string,
  register: (offer: (value: A) => void) => Effect.Effect<() => void, SewedError, MainContext>,
): Stream.Stream<A, SewedError, MainContext> =>
  Stream.callback<A, SewedError, MainContext>(
    (queue) =>
      Effect.gen(function* () {
        yield* MainContext;
        const offer = (value: A) => {
          if (!Queue.offerUnsafe(queue, value))
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new SewedError({ code: "Limit", message: `${what} observer queue is full` }),
              ),
            );
        };
        yield* Effect.acquireRelease(register(offer), (release) => Effect.sync(release));
      }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
    { bufferSize: 128 },
  );

type Listener = (...args: never[]) => void;

/** Observes named events on a Node emitter; a projection returning undefined drops the event. */
export const fromEmitter = <A>(
  what: string,
  emitter: () => EventEmitter,
  events: readonly (readonly [string, (...args: never[]) => A | undefined])[],
): Stream.Stream<A, SewedError, MainContext> =>
  listen(what, (offer) =>
    Effect.try({
      try: () => {
        const target = emitter();
        const listeners = events.map(([name, project]): readonly [string, Listener] => [
          name,
          (...args: never[]) => {
            const value = project(...args);
            if (value !== undefined) offer(value);
          },
        ]);
        for (const [name, listener] of listeners) target.on(name, listener as () => void);
        return () => {
          for (const [name, listener] of listeners) target.off(name, listener as () => void);
        };
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: `Could not observe ${what}`, cause }),
    }),
  );
