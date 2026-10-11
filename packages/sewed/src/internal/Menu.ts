import { Menu as NativeMenu, ShareMenu } from "electron";
import type { BrowserWindow, MenuItemConstructorOptions } from "electron";
import { Effect, Match, Schema } from "effect";
import * as Menu from "../Menu.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

const decodeOptions = Schema.decodeUnknownSync(Menu.PopupOptions);
const closedError = () => new SewedError({ code: "Closed", message: "Menu parent is closed" });
const nativeError = (cause: unknown) =>
  new SewedError({ code: "Native", message: "Could not show context menu", cause });
let active: NativeMenu | undefined;

const described = (item: {
  readonly sublabel?: string;
  readonly toolTip?: string;
  readonly registerAccelerator?: boolean;
  readonly badge?:
    | { readonly type: "alerts" | "updates" | "new-items"; readonly count: number }
    | { readonly type: "none"; readonly content: string };
}) => ({
  ...(item.badge === undefined ? {} : { badge: { ...item.badge } }),
  ...(item.registerAccelerator === undefined
    ? {}
    : { registerAccelerator: item.registerAccelerator }),
  ...(item.sublabel === undefined ? {} : { sublabel: item.sublabel }),
  ...(item.toolTip === undefined ? {} : { toolTip: item.toolTip }),
});

export const template = (
  items: readonly (Menu.Item | Menu.ApplicationItem)[],
  select: (result: Menu.Selection) => void,
): MenuItemConstructorOptions[] =>
  items.map((item) =>
    Match.value(item).pipe(
      Match.when({ kind: "separator" }, (): MenuItemConstructorOptions => ({ type: "separator" })),
      Match.when({ kind: "role" }, ({ role }): MenuItemConstructorOptions => ({ role })),
      Match.when({ kind: "submenu" }, (item): MenuItemConstructorOptions => ({
        type: "submenu",
        enabled: item.enabled ?? true,
        submenu: template(item.items, select),
        // A role-carrying `Menu.ApplicationItem` submenu may have no `label` of its own — Electron
        // supplies one for the role it fills — so it is passed only when present, rather than as
        // an explicit `undefined` that would override Electron's own label with nothing.
        ...(item.label === undefined ? {} : { label: item.label }),
        // `Menu.Item`'s own `Submenu` carries no role; only `Menu.ApplicationItem`'s does.
        ...("role" in item ? { role: item.role } : {}),
      })),
      Match.when({ kind: "command" }, (item): MenuItemConstructorOptions => ({
        type: "normal",
        id: item.id,
        label: item.label,
        enabled: item.enabled ?? true,
        ...described(item),
        ...("accelerator" in item ? { accelerator: item.accelerator } : {}),
        click: () => select({ kind: "command", id: item.id }),
      })),
      Match.when({ kind: "checkbox" }, (item): MenuItemConstructorOptions => ({
        type: "checkbox",
        id: item.id,
        label: item.label,
        enabled: item.enabled ?? true,
        ...described(item),
        checked: item.checked,
        ...("accelerator" in item ? { accelerator: item.accelerator } : {}),
        click: (native) => select({ kind: "checkbox", id: item.id, checked: native.checked }),
      })),
      Match.when({ kind: "radio" }, (item): MenuItemConstructorOptions => ({
        type: "radio",
        id: item.id,
        label: item.label,
        enabled: item.enabled ?? true,
        ...described(item),
        checked: item.checked,
        ...("accelerator" in item ? { accelerator: item.accelerator } : {}),
        click: () => select({ kind: "radio", id: item.id }),
      })),
      Match.exhaustive,
    ),
  );

const decodeSharingItem = Schema.decodeUnknownSync(Menu.SharingItem);
const decodePosition = Schema.decodeUnknownSync(
  Schema.Struct({ x: Schema.Finite, y: Schema.Finite }),
);

export const menus = (parent: BrowserWindow) => ({
  /** Opens the macOS share sheet for the item; `Native` on other platforms. */
  share: (
    item: Menu.SharingItem,
    position?: { readonly x: number; readonly y: number },
  ): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      Effect.try({
        try: () => ({
          item: decodeSharingItem(item),
          position: position === undefined ? undefined : decodePosition(position),
        }),
        catch: (cause) =>
          new SewedError({ code: "Protocol", message: "Invalid sharing item", cause }),
      }),
      (settings) =>
        Effect.andThen(
          MainContext,
          Effect.try({
            try: () => {
              if (parent.isDestroyed()) throw closedError();
              if (process.platform !== "darwin")
                throw new SewedError({
                  code: "Native",
                  message: "The share sheet is unavailable on this platform",
                });
              const { urls, filePaths, texts } = settings.item;
              new ShareMenu({
                ...(urls === undefined ? {} : { urls: [...urls] }),
                ...(filePaths === undefined ? {} : { filePaths: [...filePaths] }),
                ...(texts === undefined ? {} : { texts: [...texts] }),
              }).popup({
                window: parent,
                ...(settings.position === undefined ? {} : { ...settings.position }),
              });
            },
            catch: (cause) => (cause instanceof SewedError ? cause : nativeError(cause)),
          }),
        ),
    ),
  popup: (options: Menu.PopupOptions): Effect.Effect<Menu.PopupResult, SewedError, MainContext> =>
    Effect.andThen(
      MainContext,
      Effect.callback<Menu.PopupResult, SewedError>((resume) => {
        if (parent.isDestroyed()) {
          resume(Effect.fail(closedError()));
          return;
        }
        let result: Menu.PopupResult = { kind: "dismissed" };
        let native: NativeMenu;
        let position: Menu.PopupOptions["position"];
        try {
          const settings = decodeOptions(options);
          if (active !== undefined) {
            resume(
              Effect.fail(
                new SewedError({ code: "Limit", message: "Another context menu is pending" }),
              ),
            );
            return;
          }
          position = settings.position;
          native = NativeMenu.buildFromTemplate(
            template(settings.items, (selected) => {
              result = selected;
            }),
          );
        } catch (cause) {
          resume(Effect.fail(nativeError(cause)));
          return;
        }
        if (parent.isDestroyed()) {
          resume(Effect.fail(closedError()));
          return;
        }
        const release = () => {
          parent.removeListener("closed", onClosed);
          if (active === native) active = undefined;
        };
        const onClosed = () => {
          native.closePopup();
          release();
          resume(Effect.fail(closedError()));
        };
        active = native;
        parent.once("closed", onClosed);
        try {
          native.popup({
            window: parent,
            ...position,
            callback: () => {
              release();
              // Electron can close the popup inside destroy() before marking its parent destroyed.
              queueMicrotask(() =>
                resume(parent.isDestroyed() ? Effect.fail(closedError()) : Effect.succeed(result)),
              );
            },
          });
        } catch (cause) {
          native.closePopup();
          release();
          resume(Effect.fail(nativeError(cause)));
        }
        return Effect.sync(() => native.closePopup());
      }),
    ),
});
