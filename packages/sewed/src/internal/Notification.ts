import { Notification as NativeNotification } from "electron";
import { Effect, Layer, Schema, Stream } from "effect";
import type { Scope } from "effect";
import * as Capability from "../Capability.ts";
import * as Notification from "../Notification.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as NotificationPolicy from "./NotificationPolicy.ts";
import * as Observation from "./Observation.ts";
import * as Observers from "./Observers.ts";
import { only } from "./Platform.ts";

export {
  Action,
  Activation,
  Delivered,
  Event,
  Options,
  Timeout,
  Urgency,
  capability,
  protocol,
} from "../Notification.ts";

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
            ...(settings.id === undefined ? {} : { id: settings.id }),
            ...(settings.groupId === undefined ? {} : { groupId: settings.groupId }),
            ...(settings.groupTitle === undefined ? {} : { groupTitle: settings.groupTitle }),
            ...(settings.sound === undefined ? {} : { sound: settings.sound }),
            ...(settings.toastXml === undefined ? {} : { toastXml: settings.toastXml }),
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

const decodeIds = Schema.decodeUnknownSync(
  Schema.NonEmptyArray(Schema.String.check(Schema.isMinLength(1))),
);
const decodeGroup = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const refused = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => new SewedError({ code: "Protocol", message, cause }),
  });

/**
 * The application's notifications still in the macOS Notification Center. An unsigned build is
 * delivered none, so this answers an empty list there.
 */
export const delivered: Effect.Effect<
  ReadonlyArray<Notification.Delivered>,
  SewedError,
  MainContext
> = Effect.andThen(
  MainContext,
  Effect.tryPromise({
    try: async () => {
      only(["darwin"], "Notification history");
      const history = await NativeNotification.getHistory();
      return history.map((entry) => ({
        id: entry.id,
        groupId: entry.groupId,
        title: entry.title,
        subtitle: entry.subtitle,
        body: entry.body,
      }));
    },
    catch: (cause) =>
      cause instanceof SewedError ? cause : nativeError("Could not read notifications", cause),
  }),
);

/** Removes delivered notifications from the macOS Notification Center by id. */
export const remove = (ids: ReadonlyArray<string>): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    refused("Invalid notification ids", () => decodeIds(ids)),
    (value) =>
      operation(() => {
        only(["darwin"], "Removing notifications");
        NativeNotification.remove([...value]);
      }),
  );

/** Removes one group's delivered notifications from the macOS Notification Center. */
export const removeGroup = (groupId: string): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    refused("Invalid notification group", () => decodeGroup(groupId)),
    (value) =>
      operation(() => {
        only(["darwin"], "Removing notifications");
        NativeNotification.removeGroup(value);
      }),
  );

/** Removes every delivered notification of the application from the macOS Notification Center. */
export const removeAll: Effect.Effect<void, SewedError, MainContext> = operation(() => {
  only(["darwin"], "Removing notifications");
  NativeNotification.removeAll();
});

/**
 * Windows toasts the user acted on, wherever the notification object is: after a restart, after
 * it was collected, and for the toast that launched the application. Electron keeps one handler,
 * so one observer at a time receives them.
 */
export const activations: Stream.Stream<Notification.Activation, SewedError, MainContext> =
  Observation.listen<Notification.Activation>("Notification activation", (offer) =>
    operation(() => {
      only(["win32"], "Notification activation");
      NativeNotification.handleActivation((details) =>
        offer({
          type: details.type,
          arguments: details.arguments,
          ...(details.actionIndex === undefined ? {} : { actionIndex: details.actionIndex }),
          ...(details.reply === undefined ? {} : { reply: details.reply }),
          ...(details.userInputs === undefined ? {} : { userInputs: { ...details.userInputs } }),
        }),
      );
      return () => {
        NativeNotification.handleActivation(() => {});
      };
    }),
  );
