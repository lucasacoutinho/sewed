import { Notification as NativeNotification } from "electron";
import { Effect, Layer, Schema, Stream } from "effect";
import type { Scope } from "effect";
import * as Capability from "../Capability.ts";
import * as Notification from "../Notification.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as NotificationPolicy from "./NotificationPolicy.ts";
import * as Observers from "./Observers.ts";

export { Action, Event, Options, Timeout, Urgency, capability, protocol } from "../Notification.ts";

const decodeOptions = Schema.decodeUnknownSync(Notification.Options);

const closedError = () => new SewedError({ code: "Closed", message: "Notification is closed" });
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
    const observers = Observers.make<Notification.Event>("Notification");
    const publish = observers.publish;
    const finish = observers.finish;
    let released = false;
    const release = (notification: NativeNotification) =>
      Effect.sync(() => {
        if (released) return;
        released = true;
        finish();
        try {
          notification.close();
        } catch {
          // The native notification is already gone.
        }
        notification.removeAllListeners();
      });
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
          return notification;
        },
        catch: (cause) => nativeError("Could not show notification", cause),
      }),
      release,
    );
    yield* Effect.try({
      try: () => {
        native.on("show", () => publish({ kind: "shown" }));
        native.on("click", () => publish({ kind: "clicked" }));
        native.on("action", (_event, index) =>
          publish({ kind: "action", id: settings.actions?.[index]?.id ?? String(index) }),
        );
        native.on("reply", (_event, text) => publish({ kind: "replied", text }));
        native.on("failed", (_event, message) => {
          publish({ kind: "failed", message });
          finish();
        });
        native.on("close", () => {
          publish({ kind: "closed" });
          finish();
        });
        native.show();
      },
      catch: (cause) => nativeError("Could not show notification", cause),
    }).pipe(Effect.onError(() => release(native)));
    const events = observers.stream;
    return {
      events,
      close: operation(() => {
        if (observers.finished) throw closedError();
        native.close();
        finish();
      }),
    };
  });

// Electron only ever sees options the schema accepted. One request is one notification: the
// request's own scope owns it, so interrupting the request closes it.
const core: NotificationPolicy.Core<MainContext> = {
  show: (options) =>
    Stream.scoped(Stream.unwrap(Effect.map(show(options), (handle) => handle.events))),
};

/**
 * The notification capability for main. The rules live in this Layer, not in a separate host, so
 * `Capability.serve(Notification.capability)` gives a document exactly the checks a main-side call
 * obeys.
 */
export const native = (): Layer.Layer<typeof Notification.capability, SewedError, MainContext> =>
  Capability.fromHandlers(Notification.capability, (implement) =>
    implement(
      Effect.map(NotificationPolicy.operations(core), (operations) => ({
        show: (options) => operations.show(options),
      })),
    ),
  );
