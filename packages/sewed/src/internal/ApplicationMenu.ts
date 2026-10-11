import { Menu as NativeMenu } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import * as Menu from "../Menu.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { template } from "./Menu.ts";
import * as Observers from "./Observers.ts";

const decodeOptions = Schema.decodeUnknownSync(Menu.ApplicationOptions);
const decodeUpdate = Schema.decodeUnknownSync(Menu.ItemUpdate);
const closedError = () =>
  new SewedError({ code: "Closed", message: "Application menu owner is closed" });
type Observer = Queue.Queue<Menu.Selection, SewedError | Cause.Done>;

export interface Handle {
  /** Replaces the menu; the replaced menu's callbacks stop and nothing is restored. */
  readonly replace: (options: Menu.ApplicationOptions) => Effect.Effect<void, SewedError>;
  /** Future custom selections, to any number of observers, each with a queue of 128. */
  readonly selections: Stream.Stream<Menu.Selection, SewedError>;
  /** One item of the installed menu by its `id`; `Protocol` when the menu has no such item. */
  readonly item: (id: string) => Effect.Effect<Menu.ItemState, SewedError>;
  /** Changes one item in place, without rebuilding the menu or closing an open submenu. */
  readonly update: (id: string, change: Menu.ItemUpdate) => Effect.Effect<void, SewedError>;
  /** The menu opening (`will-show`) and closing (`will-close`), where the platform reports it. */
  readonly visibility: Stream.Stream<"will-show" | "will-close", SewedError, MainContext>;
}

let installed = false;

/**
 * Installs the application menu for the caller's scope. Shared native state has one owner, so a
 * second live menu fails `Limit`. Releasing stops this menu's callbacks and fails its observers
 * `Closed`; it does not restore or clear the native menu — restoring one was tried on X11 and left
 * an open submenu on screen, which `docs/application-menus.md` records.
 */
export const make = (
  options: Menu.ApplicationOptions,
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const observers = new Set<Observer>();
    const visibility = Observers.make<"will-show" | "will-close">("Application menu visibility");
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
      native.on("menu-will-show", () => {
        if (!closed && NativeMenu.getApplicationMenu() === native) visibility.publish("will-show");
      });
      native.on("menu-will-close", () => {
        if (!closed && NativeMenu.getApplicationMenu() === native) visibility.publish("will-close");
      });
      NativeMenu.setApplicationMenu(native);
    };
    yield* Effect.acquireRelease(
      Effect.suspend(() =>
        installed
          ? Effect.fail(
              new SewedError({
                code: "Limit",
                message: "An application menu is already installed",
              }),
            )
          : Effect.try({
              try: () => {
                install(options);
                installed = true;
              },
              catch: (cause) =>
                cause instanceof Schema.SchemaError
                  ? new SewedError({ code: "Protocol", message: "Invalid application menu", cause })
                  : new SewedError({
                      code: "Native",
                      message: "Could not install application menu",
                      cause,
                    }),
            }),
      ),
      () =>
        Effect.sync(() => {
          closed = true;
          installed = false;
          visibility.finish();
          for (const queue of observers) Queue.failCauseUnsafe(queue, Cause.fail(closedError()));
          observers.clear();
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
    const found = (id: string): Electron.MenuItem => {
      if (closed) throw closedError();
      const item = NativeMenu.getApplicationMenu()?.getMenuItemById(id) ?? null;
      if (item === null)
        throw new SewedError({ code: "Protocol", message: `The menu has no item "${id}"` });
      return item;
    };
    const guarded = <A>(run: () => A): Effect.Effect<A, SewedError> =>
      Effect.try({
        try: run,
        catch: (cause) =>
          cause instanceof SewedError
            ? cause
            : cause instanceof Schema.SchemaError
              ? new SewedError({ code: "Protocol", message: "Invalid menu item update", cause })
              : new SewedError({ code: "Native", message: "Could not reach the menu item", cause }),
      });
    return {
      item: (id) =>
        guarded(() => {
          const item = found(id);
          return {
            id,
            label: item.label,
            enabled: item.enabled,
            visible: item.visible,
            checked: item.checked,
            commandId: item.commandId,
            userAccelerator: item.userAccelerator ?? null,
          };
        }),
      update: (id, change) =>
        guarded(() => {
          const value = decodeUpdate(change);
          const item = found(id);
          if (value.label !== undefined) item.label = value.label;
          if (value.enabled !== undefined) item.enabled = value.enabled;
          if (value.visible !== undefined) item.visible = value.visible;
          if (value.checked !== undefined) item.checked = value.checked;
          if (value.sublabel !== undefined) item.sublabel = value.sublabel;
        }),
      visibility: visibility.stream,
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
      selections: Stream.callback<Menu.Selection, SewedError>(
        (queue) => observe(queue).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
        { bufferSize: 128 },
      ),
    };
  });
