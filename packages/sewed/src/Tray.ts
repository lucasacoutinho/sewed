import { Schema } from "effect";
import { Source as ImageSource } from "./Image.ts";
import * as Menu from "./Menu.ts";

type MenuOptionsValue = Omit<Menu.PopupOptions, "position">;
const menuOptions = Menu.PopupOptions.mapFields(({ items }) => ({ items }), {
  unsafePreserveChecks: true,
});
export const MenuOptions: Schema.Codec<MenuOptionsValue> = menuOptions;
export type MenuOptions = MenuOptionsValue;

export const Options = Schema.Struct({
  /** A path or already-encoded bytes, over wave 3's `Image.Source`. */
  icon: ImageSource,
  /**
   * Calls the native image's own `setTemplateImage(true)` — macOS semantics (a monochrome image
   * the system tints for light and dark menu bars) and a probed no-op elsewhere: `isTemplateImage`
   * stays `false` on Linux.
   */
  template: Schema.optionalKey(Schema.Boolean),
  tooltip: Schema.optionalKey(Schema.String),
  menu: Schema.optionalKey(MenuOptions),
});
export type Options = typeof Options.Type;

export const Event = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("click") }),
  Schema.Struct({ kind: Schema.Literal("right-click") }),
  Schema.Struct({ kind: Schema.Literal("double-click") }),
  Schema.Struct({ kind: Schema.Literal("menu-selection"), selection: Menu.Selection }),
  /** A middle click, on Windows. */
  Schema.Struct({ kind: Schema.Literal("middle-click") }),
  /** The pointer over the icon, on macOS and Windows; `mouse-down` and `mouse-up` are macOS only. */
  Schema.Struct({
    kind: Schema.Literals(["mouse-enter", "mouse-leave", "mouse-move", "mouse-down", "mouse-up"]),
    x: Schema.Finite,
    y: Schema.Finite,
  }),
  /** A Windows balloon being shown, clicked, or closed by timeout or the user. */
  Schema.Struct({ kind: Schema.Literals(["balloon-show", "balloon-click", "balloon-closed"]) }),
  /** Something dragged over or dropped on the icon, on macOS. */
  Schema.Struct({ kind: Schema.Literals(["drag-enter", "drag-leave", "drag-end", "drop"]) }),
  Schema.Struct({ kind: Schema.Literal("drop-files"), files: Schema.Array(Schema.String) }),
  Schema.Struct({ kind: Schema.Literal("drop-text"), text: Schema.String }),
]);
export type Event = typeof Event.Type;

/** A Windows notification balloon attached to the tray icon. */
export const Balloon = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  icon: Schema.optionalKey(ImageSource),
  iconType: Schema.optionalKey(Schema.Literals(["none", "info", "warning", "error", "custom"])),
  largeIcon: Schema.optionalKey(Schema.Boolean),
  noSound: Schema.optionalKey(Schema.Boolean),
  respectQuietTime: Schema.optionalKey(Schema.Boolean),
});
export type Balloon = typeof Balloon.Type;
