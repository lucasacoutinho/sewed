import { Schema } from "effect";

const Text = Schema.String.check(Schema.isMinLength(1));
const Selectable = {
  id: Text,
  label: Text,
  enabled: Schema.optionalKey(Schema.Boolean),
};
const Command = Schema.Struct({ kind: Schema.Literal("command"), ...Selectable });
const Checkbox = Schema.Struct({
  kind: Schema.Literal("checkbox"),
  ...Selectable,
  checked: Schema.Boolean,
});
const Radio = Schema.Struct({
  kind: Schema.Literal("radio"),
  ...Selectable,
  checked: Schema.Boolean,
});
const Separator = Schema.Struct({ kind: Schema.Literal("separator") });
const SubmenuFields = {
  kind: Schema.Literal("submenu"),
  label: Text,
  enabled: Schema.optionalKey(Schema.Boolean),
};
interface Submenu extends Schema.Struct.Type<typeof SubmenuFields> {
  readonly items: readonly [Item, ...Item[]];
}
const Items = Schema.NonEmptyArray(Schema.suspend((): Schema.Codec<Item> => Item)).check(
  Schema.makeFilter(
    (items) =>
      items.some((item) => item.kind !== "separator") || "A menu cannot contain only separators",
  ),
);
const Submenu: Schema.Codec<Submenu> = Schema.Struct({ ...SubmenuFields, items: Items });

export const Item = Schema.Union([Command, Checkbox, Radio, Separator, Submenu]);
export type Item = typeof Item.Type;

const MenuRoles = ["appMenu", "fileMenu", "editMenu", "viewMenu", "windowMenu"] as const;
const Role = Schema.Struct({
  kind: Schema.Literal("role"),
  role: Schema.Literals([
    ...MenuRoles,
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "pasteAndMatchStyle",
    "delete",
    "selectAll",
    "reload",
    "forceReload",
    "toggleDevTools",
    "resetZoom",
    "zoomIn",
    "zoomOut",
    "togglefullscreen",
    "minimize",
    "close",
    "about",
    "quit",
  ]),
});
const Accelerator = { accelerator: Schema.optionalKey(Text) };
interface ApplicationSubmenu extends Schema.Struct.Type<typeof SubmenuFields> {
  readonly items: readonly [ApplicationItem, ...ApplicationItem[]];
}
const ApplicationItems = Schema.NonEmptyArray(
  Schema.suspend((): Schema.Codec<ApplicationItem> => ApplicationItem),
).check(
  Schema.makeFilter(
    (items) =>
      items.some((item) => item.kind !== "separator") || "A menu cannot contain only separators",
  ),
);
const ApplicationSubmenu: Schema.Codec<ApplicationSubmenu> = Schema.Struct({
  ...SubmenuFields,
  items: ApplicationItems,
});
export const ApplicationItem = Schema.Union([
  Schema.Struct({ ...Command.fields, ...Accelerator }),
  Schema.Struct({ ...Checkbox.fields, ...Accelerator }),
  Schema.Struct({ ...Radio.fields, ...Accelerator }),
  Separator,
  ApplicationSubmenu,
  Role,
]);
export type ApplicationItem = typeof ApplicationItem.Type;

const uniqueIds = (items: readonly (Item | ApplicationItem)[]) => {
  const ids = new Set<string>();
  const unique = (items: readonly (Item | ApplicationItem)[]): boolean =>
    items.every((item) => {
      if (item.kind === "separator" || item.kind === "role") return true;
      if (item.kind === "submenu") return unique(item.items);
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    });
  return unique(items) || "Menu item IDs must be unique across the whole menu";
};

export const ApplicationOptions = Schema.Struct({
  items: Schema.NonEmptyArray(
    Schema.Union([
      ApplicationSubmenu,
      Schema.Struct({ kind: Schema.Literal("role"), role: Schema.Literals(MenuRoles) }),
    ]),
  ),
}).check(Schema.makeFilter((options) => uniqueIds(options.items)));
export type ApplicationOptions = typeof ApplicationOptions.Type;

const Coordinate = Schema.Number.check(Schema.isInt32(), Schema.isGreaterThanOrEqualTo(0));
export const PopupOptions = Schema.Struct({
  items: Items,
  position: Schema.optionalKey(Schema.Struct({ x: Coordinate, y: Coordinate })),
}).check(Schema.makeFilter((options) => uniqueIds(options.items)));
export type PopupOptions = typeof PopupOptions.Type;

export const Selection = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("command"), id: Text }),
  Schema.Struct({ kind: Schema.Literal("checkbox"), id: Text, checked: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("radio"), id: Text }),
]);
export type Selection = typeof Selection.Type;

/** Content for the macOS share sheet; at least one list must carry an entry. */
export const SharingItem = Schema.Struct({
  urls: Schema.optionalKey(Schema.Array(Schema.String)),
  filePaths: Schema.optionalKey(Schema.Array(Schema.String)),
  texts: Schema.optionalKey(Schema.Array(Schema.String)),
}).check(
  Schema.makeFilter(
    (item) =>
      [item.urls, item.filePaths, item.texts].some(
        (list) => list !== undefined && list.length > 0,
      ) || "A sharing item needs at least one URL, file path, or text",
  ),
);
export type SharingItem = typeof SharingItem.Type;

export const PopupResult = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("dismissed") }),
  Selection,
]);
export type PopupResult = typeof PopupResult.Type;
