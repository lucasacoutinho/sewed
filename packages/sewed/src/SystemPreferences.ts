import { Schema } from "effect";

export const Appearance = Schema.Literals(["dark", "light", "unknown"]);
export type Appearance = typeof Appearance.Type;
export const MediaKind = Schema.Literals(["microphone", "camera", "screen"]);
export type MediaKind = typeof MediaKind.Type;
export const MediaAccess = Schema.Literals([
  "not-determined",
  "granted",
  "denied",
  "restricted",
  "unknown",
]);
export type MediaAccess = typeof MediaAccess.Type;

export const Animation = Schema.Struct({
  shouldRenderRichAnimation: Schema.Boolean,
  scrollAnimationsEnabledBySystem: Schema.Boolean,
  prefersReducedMotion: Schema.Boolean,
});
export type Animation = typeof Animation.Type;

/** A Windows or macOS system color name; Electron validates the name itself. */
export const ColorName = Schema.String.check(Schema.isMinLength(1));
export const SystemColor = Schema.Literals([
  "blue",
  "brown",
  "gray",
  "green",
  "orange",
  "pink",
  "purple",
  "red",
  "yellow",
]);
export type SystemColor = typeof SystemColor.Type;

export const Change = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("accent-color"), color: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("color") }),
]);
export type Change = typeof Change.Type;

/** Which macOS notification center: between applications, inside this one, or the workspace's. */
export const NotificationCenter = Schema.Literals(["distributed", "local", "workspace"]);
export type NotificationCenter = typeof NotificationCenter.Type;

/** A macOS notification center message; `userInfo` is `null` when it is not JSON. */
export const CenterNotification = Schema.Struct({
  event: Schema.String,
  userInfo: Schema.Json,
  object: Schema.String,
});
export type CenterNotification = typeof CenterNotification.Type;

/** Values registered as defaults in the macOS user defaults. */
export const Defaults = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Boolean, Schema.Finite]),
);
export type Defaults = typeof Defaults.Type;

/** How a macOS user default is stored; the same value reads differently under another type. */
export const UserDefaultType = Schema.Literals([
  "string",
  "boolean",
  "integer",
  "float",
  "double",
  "url",
  "array",
  "dictionary",
]);
export type UserDefaultType = typeof UserDefaultType.Type;

/** One macOS user default, with the type it is stored as. */
export const UserDefault = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["string", "url"]), value: Schema.String }),
  Schema.Struct({ type: Schema.Literal("boolean"), value: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal("integer"), value: Schema.Int }),
  Schema.Struct({ type: Schema.Literals(["float", "double"]), value: Schema.Finite }),
  Schema.Struct({ type: Schema.Literal("array"), value: Schema.Array(Schema.Unknown) }),
  Schema.Struct({
    type: Schema.Literal("dictionary"),
    value: Schema.Record(Schema.String, Schema.Unknown),
  }),
]);
export type UserDefault = typeof UserDefault.Type;
