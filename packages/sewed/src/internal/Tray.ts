import type { EventEmitter } from "node:events";
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
import { Point } from "./Geometry.ts";
import { only } from "./Platform.ts";
export { Balloon, Event, MenuOptions, Options } from "../Tray.ts";

const decodeOptions = Schema.decodeUnknownSync(Tray.Options);
const decodeMenu = Schema.decodeUnknownSync(Tray.MenuOptions);
const decodeTooltip = Schema.decodeUnknownSync(Schema.String);
const decodeBalloon = Schema.decodeUnknownSync(Tray.Balloon);
const decodeFlag = Schema.decodeUnknownSync(Schema.Boolean);
const decodePoint = Schema.decodeUnknownSync(Point);
/** Runs a decoder so that what it refuses fails `Protocol`, inside an operation that maps to `Native`. */
const checked = <A>(message: string, run: () => A): A => {
  try {
    return run();
  } catch (cause) {
    throw new SewedError({ code: "Protocol", message, cause });
  }
};
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
  /** Shows a Windows balloon on the icon; `Native` elsewhere. */
  readonly displayBalloon: (balloon: Tray.Balloon) => Effect.Effect<void, SewedError, MainContext>;
  readonly removeBalloon: Effect.Effect<void, SewedError, MainContext>;
  /** Pops the tray's menu up now, on macOS and Windows; `position` applies on Windows. */
  readonly popUpMenu: (position?: {
    readonly x: number;
    readonly y: number;
  }) => Effect.Effect<void, SewedError, MainContext>;
  readonly closeMenu: Effect.Effect<void, SewedError, MainContext>;
  /** The icon's stable identifier where the platform has one, on macOS and Windows. */
  readonly guid: Effect.Effect<string | null, SewedError, MainContext>;
  /** Makes every click report at once instead of waiting to see if it is a double click, on macOS. */
  readonly setIgnoreDoubleClickEvents: (
    ignore: boolean,
  ) => Effect.Effect<void, SewedError, MainContext>;
  readonly ignoreDoubleClickEvents: Effect.Effect<boolean, SewedError, MainContext>;
  /** The image shown while the icon is pressed, on macOS. */
  readonly setPressedImage: (icon: ImageSource) => Effect.Effect<void, SewedError, MainContext>;
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
    const at =
      (kind: "mouse-enter" | "mouse-leave" | "mouse-move" | "mouse-down" | "mouse-up") =>
      (_event: unknown, position: { readonly x: number; readonly y: number }) =>
        publish({ kind, x: position.x, y: position.y });
    const plain =
      (
        kind:
          | "middle-click"
          | "balloon-show"
          | "balloon-click"
          | "balloon-closed"
          | "drag-enter"
          | "drag-leave"
          | "drag-end"
          | "drop",
      ) =>
      () =>
        publish({ kind });
    // Platform events: registered everywhere, emitted only where Electron implements them.
    const platformListeners: ReadonlyArray<readonly [string, (...args: never[]) => void]> = [
      ["middle-click", plain("middle-click")],
      ["mouse-enter", at("mouse-enter")],
      ["mouse-leave", at("mouse-leave")],
      ["mouse-move", at("mouse-move")],
      ["mouse-down", at("mouse-down")],
      ["mouse-up", at("mouse-up")],
      ["balloon-show", plain("balloon-show")],
      ["balloon-click", plain("balloon-click")],
      ["balloon-closed", plain("balloon-closed")],
      ["drag-enter", plain("drag-enter")],
      ["drag-leave", plain("drag-leave")],
      ["drag-end", plain("drag-end")],
      ["drop", plain("drop")],
      [
        "drop-files",
        (_event: unknown, files: ReadonlyArray<string>) =>
          publish({ kind: "drop-files", files: [...files] }),
      ],
      ["drop-text", (_event: unknown, text: string) => publish({ kind: "drop-text", text })],
    ];
    const release = (owner: NativeTray) =>
      Effect.sync(() => {
        closed = true;
        for (const queue of observers) Queue.endUnsafe(queue);
        observers.clear();
        owner.off("click", onClick);
        owner.off("right-click", onRightClick);
        owner.off("double-click", onDoubleClick);
        const emitter: EventEmitter = owner;
        for (const [name, listener] of platformListeners) emitter.off(name, listener as () => void);
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
        const emitter: EventEmitter = native;
        for (const [name, listener] of platformListeners) emitter.on(name, listener as () => void);
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
      displayBalloon: (balloon) =>
        operation(() => {
          const { icon: balloonIcon, ...rest } = checked("Invalid balloon", () =>
            decodeBalloon(balloon),
          );
          only(["win32"], "Tray balloons");
          native.displayBalloon({
            ...rest,
            ...(balloonIcon === undefined
              ? {}
              : { icon: nativeImageOf(balloonIcon, "Balloon icon") }),
          });
        }),
      removeBalloon: operation(() => {
        only(["win32"], "Tray balloons");
        native.removeBalloon();
      }),
      popUpMenu: (position) =>
        operation(() => {
          const point =
            position === undefined
              ? undefined
              : checked("Invalid menu position", () => decodePoint(position));
          only(["darwin", "win32"], "Popping up the tray menu");
          native.popUpContextMenu(undefined, point);
        }),
      closeMenu: operation(() => {
        only(["darwin", "win32"], "Closing the tray menu");
        native.closeContextMenu();
      }),
      guid: operation(() => {
        only(["darwin", "win32"], "The tray GUID");
        return native.getGUID();
      }),
      setIgnoreDoubleClickEvents: (ignore) =>
        operation(() => {
          const value = checked("Invalid flag", () => decodeFlag(ignore));
          only(["darwin"], "Ignoring double clicks");
          native.setIgnoreDoubleClickEvents(value);
        }),
      ignoreDoubleClickEvents: operation(() => {
        only(["darwin"], "Ignoring double clicks");
        return native.getIgnoreDoubleClickEvents();
      }),
      setPressedImage: (source) =>
        operation(() => {
          const image = nativeImageOf(source, "Tray pressed icon");
          only(["darwin"], "The pressed tray image");
          native.setPressedImage(image);
        }),
      setMenu: (menu: Tray.MenuOptions) =>
        operation(() => {
          const settings = decodeMenu(menu);
          const next = NativeMenu.buildFromTemplate(template(settings.items, select));
          native.setContextMenu(next);
        }),
    };
  });
