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
type Observer = Queue.Queue<Menu.Selection, SewedError | Cause.Done>;

type Items = readonly (Menu.Item | Menu.ApplicationItem)[];

export interface Handle<O = Menu.ApplicationOptions> {
  /** Replaces the menu; the replaced menu's callbacks stop and nothing is restored. */
  readonly replace: (options: O) => Effect.Effect<void, SewedError>;
  /** Future custom selections, to any number of observers, each with a queue of 128. */
  readonly selections: Stream.Stream<Menu.Selection, SewedError>;
  /** One item of the installed menu by its `id`; `Protocol` when the menu has no such item. */
  readonly item: (id: string) => Effect.Effect<Menu.ItemState, SewedError>;
  /** Changes one item in place, without rebuilding the menu or closing an open submenu. */
  readonly update: (id: string, change: Menu.ItemUpdate) => Effect.Effect<void, SewedError>;
  /** The menu opening (`will-show`) and closing (`will-close`), where the platform reports it. */
  readonly visibility: Stream.Stream<"will-show" | "will-close", SewedError, MainContext>;
}

/**
 * One place Electron keeps a menu: the application's, a window's menu bar, the dock's. Each has one
 * owner at a time, its own options, and its own way of saying whether a menu is still the one
 * installed there.
 */
export interface Slot<O> {
  /** Lower case, with its article: `["An", "application menu"]`. */
  readonly name: readonly [article: string, noun: string];
  readonly decode: (options: O) => { readonly items: Items };
  readonly set: (menu: NativeMenu) => void;
  readonly isCurrent: (menu: NativeMenu) => boolean;
  readonly claimed: () => boolean;
  readonly claim: (held: boolean) => void;
}

let installed = false;
const application: Slot<Menu.ApplicationOptions> = {
  name: ["An", "application menu"],
  decode: decodeOptions,
  set: (menu) => NativeMenu.setApplicationMenu(menu),
  isCurrent: (menu) => NativeMenu.getApplicationMenu() === menu,
  claimed: () => installed,
  claim: (held) => {
    installed = held;
  },
};

/**
 * Installs the application menu for the caller's scope. Shared native state has one owner, so a
 * second live menu fails `Limit`. Releasing stops this menu's callbacks and fails its observers
 * `Closed`; it does not restore or clear the native menu — restoring one was tried on X11 and left
 * an open submenu on screen, which `docs/application-menus.md` records.
 */
export const make = (
  options: Menu.ApplicationOptions,
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> => makeIn(application, options);

/** The same owner over any slot: one live menu per slot, released with the caller's scope. */
export const makeIn = <O>(
  slot: Slot<O>,
  options: O,
): Effect.Effect<Handle<O>, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const [article, noun] = slot.name;
    const title = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
    const closedError = () =>
      new SewedError({ code: "Closed", message: `${title} owner is closed` });
    let live: NativeMenu | undefined;
    const observers = new Set<Observer>();
    const visibility = Observers.make<"will-show" | "will-close">(`${title} visibility`);
    let closed = false;
    // Each installed menu publishes only while it is still the application menu, so callbacks
    // from a replaced menu stop without restoring anything.
    const install = (next: O) => {
      const settings = slot.decode(next);
      const native = NativeMenu.buildFromTemplate(
        template(settings.items, (selection) => {
          if (closed || live !== native || !slot.isCurrent(native)) return;
          for (const queue of observers) {
            if (!Queue.offerUnsafe(queue, selection)) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new SewedError({
                    code: "Limit",
                    message: `${title} observer queue is full`,
                  }),
                ),
              );
            }
          }
        }),
      );
      native.on("menu-will-show", () => {
        if (!closed && live === native && slot.isCurrent(native)) visibility.publish("will-show");
      });
      native.on("menu-will-close", () => {
        if (!closed && live === native && slot.isCurrent(native)) visibility.publish("will-close");
      });
      slot.set(native);
      live = native;
    };
    yield* Effect.acquireRelease(
      Effect.suspend(() =>
        slot.claimed()
          ? Effect.fail(
              new SewedError({
                code: "Limit",
                message: `${article} ${noun} is already installed`,
              }),
            )
          : Effect.try({
              try: () => {
                install(options);
                slot.claim(true);
              },
              catch: (cause) =>
                cause instanceof SewedError
                  ? cause
                  : cause instanceof Schema.SchemaError
                    ? new SewedError({ code: "Protocol", message: `Invalid ${noun}`, cause })
                    : new SewedError({
                        code: "Native",
                        message: `Could not install ${noun}`,
                        cause,
                      }),
            }),
      ),
      () =>
        Effect.sync(() => {
          closed = true;
          slot.claim(false);
          live = undefined;
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
      const item = live?.getMenuItemById(id) ?? null;
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
      replace: (next: O): Effect.Effect<void, SewedError> =>
        Effect.suspend(() =>
          closed
            ? Effect.fail(closedError())
            : Effect.try({
                try: () => install(next),
                catch: (cause) =>
                  cause instanceof SewedError
                    ? cause
                    : cause instanceof Schema.SchemaError
                      ? new SewedError({ code: "Protocol", message: `Invalid ${noun}`, cause })
                      : new SewedError({
                          code: "Native",
                          message: `Could not replace ${noun}`,
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
