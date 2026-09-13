import { Schema } from "effect";
import * as Menu from "./Menu.ts";

export const Icon = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/));
export type Icon = typeof Icon.Type;

type MenuOptionsValue = Omit<Menu.PopupOptions, "position">;
const menuOptions = Menu.PopupOptions.mapFields(({ items }) => ({ items }), {
  unsafePreserveChecks: true,
});
export const MenuOptions: Schema.Codec<MenuOptionsValue> = menuOptions;
export type MenuOptions = MenuOptionsValue;

export const Options = Schema.Struct({
  icon: Icon,
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
