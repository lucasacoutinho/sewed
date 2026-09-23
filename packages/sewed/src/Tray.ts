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
]);
export type Event = typeof Event.Type;
