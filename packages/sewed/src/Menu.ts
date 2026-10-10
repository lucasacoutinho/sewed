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
// Every role Electron defines except `shareMenu`, which needs a `SharingItem` and stays with the
// context menu's own `share` operation (see `internal/Menu.ts`). Probed on Linux: every one of
// these builds without throwing, with Electron's own label — the five tab roles with an empty
// label off macOS, since they are macOS-only and inert elsewhere.
const RoleNames = [
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
  "services",
  "hide",
  "hideOthers",
  "unhide",
  "front",
  "zoom",
  "help",
  "window",
  "recentDocuments",
  "clearRecentDocuments",
  "toggleTabBar",
  "selectNextTab",
  "selectPreviousTab",
  "showAllTabs",
  "mergeAllWindows",
  "moveTabToNewWindow",
  "toggleSpellChecker",
  "showSubstitutions",
  "toggleSmartQuotes",
  "toggleSmartDashes",
  "toggleTextReplacement",
  "startSpeaking",
  "stopSpeaking",
] as const;
export const RoleName = Schema.Literals(RoleNames);
export type RoleName = typeof RoleName.Type;
export const Role = Schema.Struct({
  kind: Schema.Literal("role"),
  role: RoleName,
});
export type Role = typeof Role.Type;
const Accelerator = { accelerator: Schema.optionalKey(Text) };

// A submenu may carry a role: `help` and `window` keep their custom items alongside whatever the
// platform adds, while `services` and `recentDocuments` are filled entirely by the OS on macOS —
// Sewed refuses a nonempty `items` list there at decode, because Electron silently keeps the
// custom items on platforms where the OS never fills them (probed on Linux).
const OpenSubmenuRoles = ["help", "window"] as const;
const FilledSubmenuRoles = ["services", "recentDocuments"] as const;

// A role Electron fills supplies its own label ("Services", "Open Recent", …), so a submenu that
// carries one may omit `label`; a role-less submenu still needs its own, exactly as a context
// menu's own `Submenu` does. `RoledSubmenuFields` is `SubmenuFields` with that one field relaxed.
const RoledSubmenuFields = {
  kind: Schema.Literal("submenu"),
  label: Schema.optionalKey(Text),
  enabled: Schema.optionalKey(Schema.Boolean),
};

interface RoledOpenSubmenu extends Schema.Struct.Type<typeof RoledSubmenuFields> {
  readonly role: (typeof OpenSubmenuRoles)[number];
  readonly items: readonly [ApplicationItem, ...ApplicationItem[]];
}
interface LabeledOpenSubmenu extends Schema.Struct.Type<typeof SubmenuFields> {
  readonly items: readonly [ApplicationItem, ...ApplicationItem[]];
}
type OpenApplicationSubmenu = RoledOpenSubmenu | LabeledOpenSubmenu;
interface FilledApplicationSubmenu extends Schema.Struct.Type<typeof RoledSubmenuFields> {
  readonly role: (typeof FilledSubmenuRoles)[number];
  readonly items: readonly ApplicationItem[];
}
type ApplicationSubmenu = OpenApplicationSubmenu | FilledApplicationSubmenu;

const ApplicationItemsNonEmpty = Schema.NonEmptyArray(
  Schema.suspend((): Schema.Codec<ApplicationItem> => ApplicationItem),
).check(
  Schema.makeFilter(
    (items) =>
      items.some((item) => item.kind !== "separator") || "A menu cannot contain only separators",
  ),
);
const ApplicationItemsEmpty = Schema.Array(
  Schema.suspend((): Schema.Codec<ApplicationItem> => ApplicationItem),
).check(
  Schema.makeFilter(
    (items) =>
      items.length === 0 ||
      "A submenu whose role fills its items on macOS must carry none of its own",
  ),
);
const RoledOpenSubmenu: Schema.Codec<RoledOpenSubmenu> = Schema.Struct({
  ...RoledSubmenuFields,
  role: Schema.Literals(OpenSubmenuRoles),
  items: ApplicationItemsNonEmpty,
});
const LabeledOpenSubmenu: Schema.Codec<LabeledOpenSubmenu> = Schema.Struct({
  ...SubmenuFields,
  // Declared, not left to `Schema.Struct`'s own silent stripping of unknown keys: an out-of-set
  // role (`services`, a typo, …) on an otherwise label-and-items-valid submenu must still refuse
  // here, rather than quietly matching this role-less variant with the role thrown away — the
  // union's other members (`FilledApplicationSubmenu`'s own filter, or the role literal's own
  // refusal) are what should decide such an input, not this variant's absence of an opinion.
  role: Schema.optionalKey(Schema.Never),
  items: ApplicationItemsNonEmpty,
});
const OpenApplicationSubmenu: Schema.Codec<OpenApplicationSubmenu> = Schema.Union([
  RoledOpenSubmenu,
  LabeledOpenSubmenu,
]);
const FilledApplicationSubmenu: Schema.Codec<FilledApplicationSubmenu> = Schema.Struct({
  ...RoledSubmenuFields,
  role: Schema.Literals(FilledSubmenuRoles),
  items: ApplicationItemsEmpty,
});
const ApplicationSubmenu: Schema.Codec<ApplicationSubmenu> = Schema.Union([
  OpenApplicationSubmenu,
  FilledApplicationSubmenu,
]);
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

const Coordinate = Schema.Finite.check(Schema.isInt32(), Schema.isGreaterThanOrEqualTo(0));
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
