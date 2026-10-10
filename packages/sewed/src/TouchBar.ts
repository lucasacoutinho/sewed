import { Schema } from "effect";

const Id = Schema.String.check(Schema.isMinLength(1));
const Text = Schema.String;

export const IconPosition = Schema.Literals(["left", "right", "overlay"]);
export const SpacerSize = Schema.Literals(["small", "large", "flexible"]);
export const SegmentedMode = Schema.Literals(["single", "multiple", "buttons"]);
export const SegmentStyle = Schema.Literals([
  "automatic",
  "rounded",
  "textured-rounded",
  "round-rect",
  "textured-square",
  "capsule",
  "small-square",
  "separated",
]);

export interface Button {
  readonly kind: "button";
  readonly id: string;
  readonly label?: string;
  readonly accessibilityLabel?: string;
  readonly backgroundColor?: string;
  readonly icon?: string;
  readonly iconPosition?: typeof IconPosition.Type;
  readonly enabled?: boolean;
}
export interface Label {
  readonly kind: "label";
  readonly label: string;
  readonly textColor?: string;
}
export interface Spacer {
  readonly kind: "spacer";
  readonly size?: typeof SpacerSize.Type;
}
export interface Slider {
  readonly kind: "slider";
  readonly id: string;
  readonly label?: string;
  readonly value?: number;
  readonly minValue?: number;
  readonly maxValue?: number;
}
export interface SegmentedControl {
  readonly kind: "segmented";
  readonly id: string;
  readonly segments: readonly [Segment, ...Segment[]];
  readonly selectedIndex?: number;
  readonly mode?: typeof SegmentedMode.Type;
  readonly segmentStyle?: typeof SegmentStyle.Type;
}
export interface Segment {
  readonly label?: string;
  readonly enabled?: boolean;
}
export interface ColorPicker {
  readonly kind: "color-picker";
  readonly id: string;
  readonly availableColors?: readonly string[];
  readonly selectedColor?: string;
}
export interface Popover {
  readonly kind: "popover";
  readonly id: string;
  readonly label?: string;
  readonly showCloseButton?: boolean;
  readonly items: readonly Item[];
}
export interface Group {
  readonly kind: "group";
  readonly items: readonly Item[];
}
export type Item =
  | Button
  | Label
  | Spacer
  | Slider
  | SegmentedControl
  | ColorPicker
  | Popover
  | Group;

const ButtonSchema = Schema.Struct({
  kind: Schema.Literal("button"),
  id: Id,
  label: Schema.optionalKey(Text),
  accessibilityLabel: Schema.optionalKey(Text),
  backgroundColor: Schema.optionalKey(Text),
  icon: Schema.optionalKey(Id),
  iconPosition: Schema.optionalKey(IconPosition),
  enabled: Schema.optionalKey(Schema.Boolean),
});
const LabelSchema = Schema.Struct({
  kind: Schema.Literal("label"),
  label: Text,
  textColor: Schema.optionalKey(Text),
});
const SpacerSchema = Schema.Struct({
  kind: Schema.Literal("spacer"),
  size: Schema.optionalKey(SpacerSize),
});
const SliderSchema = Schema.Struct({
  kind: Schema.Literal("slider"),
  id: Id,
  label: Schema.optionalKey(Text),
  value: Schema.optionalKey(Schema.Finite),
  minValue: Schema.optionalKey(Schema.Finite),
  maxValue: Schema.optionalKey(Schema.Finite),
});
const SegmentSchema = Schema.Struct({
  label: Schema.optionalKey(Text),
  enabled: Schema.optionalKey(Schema.Boolean),
});
const SegmentedSchema = Schema.Struct({
  kind: Schema.Literal("segmented"),
  id: Id,
  segments: Schema.NonEmptyArray(SegmentSchema),
  selectedIndex: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  mode: Schema.optionalKey(SegmentedMode),
  segmentStyle: Schema.optionalKey(SegmentStyle),
});
const ColorPickerSchema = Schema.Struct({
  kind: Schema.Literal("color-picker"),
  id: Id,
  availableColors: Schema.optionalKey(Schema.Array(Text)),
  selectedColor: Schema.optionalKey(Text),
});
const ItemSchema: Schema.Codec<Item> = Schema.Union([
  ButtonSchema,
  LabelSchema,
  SpacerSchema,
  SliderSchema,
  SegmentedSchema,
  ColorPickerSchema,
  Schema.Struct({
    kind: Schema.Literal("popover"),
    id: Id,
    label: Schema.optionalKey(Text),
    showCloseButton: Schema.optionalKey(Schema.Boolean),
    items: Schema.Array(Schema.suspend((): Schema.Codec<Item> => ItemSchema)),
  }),
  Schema.Struct({
    kind: Schema.Literal("group"),
    items: Schema.Array(Schema.suspend((): Schema.Codec<Item> => ItemSchema)),
  }),
]);
export { ItemSchema as Item };

const ids = (items: readonly Item[], seen: Set<string> = new Set()): true | string => {
  for (const item of items) {
    if ("id" in item) {
      if (seen.has(item.id)) return `Duplicate touch bar item id: ${item.id}`;
      seen.add(item.id);
    }
    if (item.kind === "popover" || item.kind === "group") {
      const nested = ids(item.items, seen);
      if (nested !== true) return nested;
    }
  }
  return true;
};

/** A whole touch bar: item ids are unique across nested popovers and groups. */
export const Options = Schema.Struct({
  items: Schema.Array(ItemSchema),
  escapeItem: Schema.optionalKey(ItemSchema),
}).check(
  Schema.makeFilter((options) =>
    ids(options.escapeItem === undefined ? options.items : [...options.items, options.escapeItem]),
  ),
);
export type Options = typeof Options.Type;

export const Interaction = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("click"), id: Id }),
  Schema.Struct({ kind: Schema.Literal("slider"), id: Id, value: Schema.Finite }),
  Schema.Struct({
    kind: Schema.Literal("segment"),
    id: Id,
    index: Schema.Int,
    selected: Schema.Boolean,
  }),
  Schema.Struct({ kind: Schema.Literal("color"), id: Id, color: Schema.String }),
]);
export type Interaction = typeof Interaction.Type;
