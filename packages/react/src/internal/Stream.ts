import { Cause, Effect, Exit, Stream } from "effect";
import type { SewedError } from "sewed";
import type { ActionServices, Services } from "./Action.ts";
import * as Connection from "./Connection.ts";
import * as Store from "./Store.ts";

export type State<A, E> =
  | { readonly status: "loading" }
  | { readonly status: "value"; readonly value: A }
  | { readonly status: "failure"; readonly cause: Cause.Cause<E | SewedError> };

export const make = <A, E>(
  source: Connection.Source<Services>,
  factory: () => Stream.Stream<A, E, ActionServices>,
) =>
  Store.make<State<A, E>>({ status: "loading" }, (publish) => {
    let subscribed = true;
    let lost: Cause.Cause<unknown> | undefined;
    let completed: Exit.Exit<void, E | SewedError> | undefined;
    const publishExit = (exit: Exit.Exit<void, E | SewedError>): void => {
      if (!subscribed) return;
      if (lost !== undefined) {
        const closed = Connection.unavailableCause(lost);
        publish({
          status: "failure",
          cause:
            Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)
              ? Cause.combine(closed, exit.cause)
              : closed,
        });
      } else if (Exit.isFailure(exit)) {
        publish({ status: "failure", cause: exit.cause });
      }
    };
    const running = Connection.forkWith(
      source,
      // The yield keeps a value from publishing while the store is still activating.
      (context) =>
        Effect.andThen(
          Effect.yieldNow,
          Effect.provideContext(
            Effect.scoped(
              Stream.runForEach(Stream.suspend(factory), (value) =>
                Effect.sync(() => {
                  if (subscribed && lost === undefined) publish({ status: "value", value });
                }),
              ),
            ),
            context,
          ),
        ),
      // A stream that had already ended still reports the runtime it ran on as gone.
      (cause) => {
        lost = cause;
        if (completed !== undefined) publishExit(completed);
      },
    );
    running.fiber.addObserver((exit) => {
      completed = exit;
      publishExit(exit);
    });
    return () => {
      subscribed = false;
      running.stop();
      running.fiber.interruptUnsafe();
    };
  });
