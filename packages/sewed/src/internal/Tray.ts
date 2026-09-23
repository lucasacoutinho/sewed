import { Menu as NativeMenu, Tray as NativeTray } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import type { Source as ImageSource } from "../Image.ts";
import * as Menu from "../Menu.ts";
import * as Tray from "../Tray.ts";
import { generateInstanceId } from "../InstanceId.ts";
import { nativeImageOf } from "./ImageSource.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { template } from "./Menu.ts";
export { Event, MenuOptions, Options } from "../Tray.ts";

const decodeOptions = Schema.decodeUnknownSync(Tray.Options);
const decodeMenu = Schema.decodeUnknownSync(Tray.MenuOptions);
const decodeTooltip = Schema.decodeUnknownSync(Schema.String);
type Observer = Queue.Queue<Tray.Event, SewedError | Cause.Done>;

const closedError = () => new SewedError({ code: "Closed", message: "Tray owner is closed" });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const limitError = () =>
  new SewedError({ code: "Limit", message: "Tray event observer queue is full" });

/** Resolves an `Image.Source` to a native image, applying `template` if asked. */
const icon = (source: ImageSource, template?: boolean) => {
  const value = nativeImageOf(source, "Tray icon");
  if (template === true) value.setTemplateImage(true);
  return value;
};

export interface Handle {
  readonly id: string;
  readonly events: Stream.Stream<Tray.Event, SewedError, MainContext>;
  readonly setToolTip: (tooltip: string) => Effect.Effect<void, SewedError, MainContext>;
  /** A path or already-encoded bytes, over wave 3's `Image.Source`; `template` mirrors `Options`. */
  readonly setImage: (
    icon: ImageSource,
    options?: { readonly template?: boolean },
  ) => Effect.Effect<void, SewedError, MainContext>;
  readonly setMenu: (menu: Tray.MenuOptions) => Effect.Effect<void, SewedError, MainContext>;
}

export const make = (
  options: Tray.Options,
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const id = yield* generateInstanceId();
    const observers = new Set<Observer>();
    let closed = false;

    const publish = (event: Tray.Event) => {
      if (closed) return;
      for (const queue of observers) {
        if (!Queue.offerUnsafe(queue, event)) {
          Queue.failCauseUnsafe(queue, Cause.fail(limitError()));
        }
      }
    };
    const select = (selection: Menu.Selection) => {
      publish({ kind: "menu-selection", selection });
    };
    const onClick = () => publish({ kind: "click" });
    const onRightClick = () => publish({ kind: "right-click" });
    const onDoubleClick = () => publish({ kind: "double-click" });
    const release = (owner: NativeTray) =>
      Effect.sync(() => {
        closed = true;
        for (const queue of observers) Queue.endUnsafe(queue);
        observers.clear();
        owner.off("click", onClick);
        owner.off("right-click", onRightClick);
        owner.off("double-click", onDoubleClick);
        if (!owner.isDestroyed()) owner.destroy();
      });

    const settings = yield* Effect.try({
      try: () => decodeOptions(options),
      catch: (cause) => nativeError("Could not validate tray options", cause),
    });
    const nativeIcon = yield* Effect.try({
      try: () => icon(settings.icon, settings.template),
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Could not decode tray icon", cause),
    });
    const native = yield* Effect.acquireRelease(
      Effect.try({
        try: () => new NativeTray(nativeIcon),
        catch: (cause) => nativeError("Could not create tray", cause),
      }),
      release,
    );

    yield* Effect.try({
      try: () => {
        native.on("click", onClick);
        native.on("right-click", onRightClick);
        native.on("double-click", onDoubleClick);
        if (settings.tooltip !== undefined) native.setToolTip(settings.tooltip);
        if (settings.menu !== undefined) {
          const menu = NativeMenu.buildFromTemplate(template(settings.menu.items, select));
          native.setContextMenu(menu);
        }
      },
      catch: (cause) => nativeError("Could not configure tray", cause),
    }).pipe(Effect.onError(() => release(native)));

    const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
      Effect.andThen(
        MainContext,
        Effect.try({
          try: () => {
            if (closed || native.isDestroyed()) throw closedError();
            return run();
          },
          catch: (cause) =>
            cause instanceof SewedError ? cause : nativeError("Tray operation failed", cause),
        }),
      );
    const observe = (queue: Observer): Effect.Effect<void, SewedError, Scope.Scope> =>
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
      );
    const events: Stream.Stream<Tray.Event, SewedError, MainContext> = Stream.callback(
      (queue) =>
        Effect.gen(function* () {
          yield* MainContext;
          yield* observe(queue);
        }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
      { bufferSize: 128 },
    );

    return {
      id,
      events,
      setToolTip: (tooltip: string) =>
        operation(() => {
          native.setToolTip(decodeTooltip(tooltip));
        }),
      setImage: (source: ImageSource, imageOptions) =>
        operation(() => {
          native.setImage(icon(source, imageOptions?.template));
        }),
      setMenu: (menu: Tray.MenuOptions) =>
        operation(() => {
          const settings = decodeMenu(menu);
          const next = NativeMenu.buildFromTemplate(template(settings.items, select));
          native.setContextMenu(next);
        }),
    };
  });
