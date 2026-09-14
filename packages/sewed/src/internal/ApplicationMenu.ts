import { Menu as NativeMenu } from "electron";
import { Cause, Context, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import * as Menu from "../Menu.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { template } from "./Menu.ts";

const decodeOptions = Schema.decodeUnknownSync(Menu.ApplicationOptions);
const closedError = () =>
  new SewedError({ code: "Closed", message: "Application menu owner is closed" });
type Observer = Queue.Queue<Menu.Selection, SewedError | Cause.Done>;

export class Owner extends Context.Service<
  Owner,
  {
    readonly observe: (queue: Observer) => Effect.Effect<void, SewedError, Scope.Scope>;
    readonly replace: (options: Menu.ApplicationOptions) => Effect.Effect<void, SewedError>;
  }
>()("sewed/internal/ApplicationMenu") {}

export const make = (options: Menu.ApplicationOptions) =>
  Effect.gen(function* () {
    yield* MainContext;
    const observers = new Set<Observer>();
    let closed = false;
    // Each installed menu publishes only while it is still the application menu, so callbacks
    // from a replaced menu stop without restoring anything.
    const install = (next: Menu.ApplicationOptions) => {
      const settings = decodeOptions(next);
      const native = NativeMenu.buildFromTemplate(
        template(settings.items, (selection) => {
          if (closed || NativeMenu.getApplicationMenu() !== native) return;
          for (const queue of observers) {
            if (!Queue.offerUnsafe(queue, selection)) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new SewedError({
                    code: "Limit",
                    message: "Application menu observer queue is full",
                  }),
                ),
              );
            }
          }
        }),
      );
      NativeMenu.setApplicationMenu(native);
    };
    yield* Effect.acquireRelease(
      Effect.try({
        try: () => install(options),
        catch: (cause) =>
          new SewedError({ code: "Native", message: "Could not install application menu", cause }),
      }),
      () =>
        Effect.sync(() => {
          closed = true;
          for (const queue of observers) Queue.failCauseUnsafe(queue, Cause.fail(closedError()));
          observers.clear();
        }),
    );
    return {
      replace: (next: Menu.ApplicationOptions): Effect.Effect<void, SewedError> =>
        Effect.suspend(() =>
          closed
            ? Effect.fail(closedError())
            : Effect.try({
                try: () => install(next),
                catch: (cause) =>
                  cause instanceof Schema.SchemaError
                    ? new SewedError({
                        code: "Protocol",
                        message: "Invalid application menu",
                        cause,
                      })
                    : new SewedError({
                        code: "Native",
                        message: "Could not replace application menu",
                        cause,
                      }),
              }),
        ),
      observe: (queue: Observer): Effect.Effect<void, SewedError, Scope.Scope> =>
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
        ),
    } satisfies Owner["Service"];
  });

/** Replaces the menu `App.run` installed; the replaced menu's callbacks stop and nothing is restored. */
export const replace = (
  options: Menu.ApplicationOptions,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.gen(function* () {
    yield* MainContext;
    const owner = yield* Effect.serviceOption(Owner);
    if (owner._tag === "None")
      return yield* Effect.fail(
        new SewedError({ code: "Closed", message: "No application menu was configured" }),
      );
    yield* owner.value.replace(options);
  });

export const selections: Stream.Stream<Menu.Selection, SewedError, MainContext> = Stream.callback(
  (queue) =>
    Effect.gen(function* () {
      yield* MainContext;
      const owner = yield* Effect.serviceOption(Owner);
      if (owner._tag === "None") {
        return yield* Effect.fail(
          new SewedError({ code: "Closed", message: "No application menu was configured" }),
        );
      }
      yield* owner.value.observe(queue);
    }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
  { bufferSize: 128 },
);
