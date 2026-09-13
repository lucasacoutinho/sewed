import { Notification as NativeNotification } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Owner } from "../Binding.ts";
import { host as hostOwner } from "../Host.ts";
import * as Notification from "../Notification.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

export { Action, Event, Options, Timeout, Urgency, protocol } from "../Notification.ts";

const decodeOptions = Schema.decodeUnknownSync(Notification.Options);
type Observer = Queue.Queue<Notification.Event, SewedError | Cause.Done>;

const closedError = () => new SewedError({ code: "Closed", message: "Notification is closed" });
const limitError = () =>
  new SewedError({ code: "Limit", message: "Notification observer queue is full" });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Notification operation failed", cause),
    }),
  );

export const supported: Effect.Effect<boolean, SewedError, MainContext> = operation(() =>
  NativeNotification.isSupported(),
);

export interface Handle {
  /** Finishes when the notification closes or fails; late observers fail with `Closed`. */
  readonly events: Stream.Stream<Notification.Event, SewedError, MainContext>;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
}

/** Shows a notification for the acquiring scope; closing the scope closes it. */
export const show = (
  options: Notification.Options,
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const settings = yield* Effect.try({
      try: () => decodeOptions(options),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid notification options", cause }),
    });
    const observers = new Set<Observer>();
    let closed = false;
    const publish = (event: Notification.Event) => {
      if (closed) return;
      for (const queue of observers) {
        if (!Queue.offerUnsafe(queue, event))
          Queue.failCauseUnsafe(queue, Cause.fail(limitError()));
      }
    };
    const finish = () => {
      if (closed) return;
      closed = true;
      for (const queue of observers) Queue.endUnsafe(queue);
      observers.clear();
    };
    const native = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const notification = new NativeNotification({
            title: settings.title,
            ...(settings.body === undefined ? {} : { body: settings.body }),
            ...(settings.subtitle === undefined ? {} : { subtitle: settings.subtitle }),
            ...(settings.silent === undefined ? {} : { silent: settings.silent }),
            ...(settings.urgency === undefined ? {} : { urgency: settings.urgency }),
            ...(settings.timeout === undefined ? {} : { timeoutType: settings.timeout }),
            ...(settings.icon === undefined ? {} : { icon: settings.icon }),
            ...(settings.actions === undefined
              ? {}
              : {
                  actions: settings.actions.map(({ text }) => ({ type: "button" as const, text })),
                }),
            ...(settings.reply === undefined
              ? {}
              : { hasReply: true, replyPlaceholder: settings.reply.placeholder }),
            ...(settings.closeButtonText === undefined
              ? {}
              : { closeButtonText: settings.closeButtonText }),
          });
          notification.on("show", () => publish({ kind: "shown" }));
          notification.on("click", () => publish({ kind: "clicked" }));
          notification.on("action", (_event, index) =>
            publish({ kind: "action", id: settings.actions?.[index]?.id ?? String(index) }),
          );
          notification.on("reply", (_event, text) => publish({ kind: "replied", text }));
          notification.on("failed", (_event, message) => {
            publish({ kind: "failed", message });
            finish();
          });
          notification.on("close", () => {
            publish({ kind: "closed" });
            finish();
          });
          notification.show();
          return notification;
        },
        catch: (cause) => nativeError("Could not show notification", cause),
      }),
      (notification) =>
        Effect.sync(() => {
          finish();
          try {
            notification.close();
          } catch {
            // The native notification is already gone.
          }
          notification.removeAllListeners();
        }),
    );
    const events: Stream.Stream<Notification.Event, SewedError, MainContext> = Stream.callback(
      (queue) =>
        Effect.gen(function* () {
          yield* MainContext;
          yield* Effect.acquireRelease(
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
        }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
      { bufferSize: 128 },
    );
    return {
      events,
      close: operation(() => {
        if (closed) throw closedError();
        native.close();
        finish();
      }),
    };
  });

export const host = (): Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof Notification.protocol>>,
  SewedError,
  MainContext | Scope.Scope
> =>
  Effect.gen(function* () {
    yield* MainContext;
    return yield* hostOwner(
      Notification.protocol,
      Notification.protocol.toLayer({
        show: (options) =>
          Stream.scoped(Stream.unwrap(Effect.map(show(options), (handle) => handle.events))),
      }),
    );
  });
