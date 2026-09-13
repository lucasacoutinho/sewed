import { Schema } from "effect";

const ButtonIndex = Schema.Number.check(Schema.isInt32(), Schema.isGreaterThanOrEqualTo(0));

export const MessageOptions = Schema.Struct({
  message: Schema.String,
  buttons: Schema.NonEmptyArray(Schema.String),
  type: Schema.optionalKey(Schema.Literals(["none", "info", "error", "question", "warning"])),
  title: Schema.optionalKey(Schema.String),
  detail: Schema.optionalKey(Schema.String),
  defaultId: Schema.optionalKey(ButtonIndex),
  cancelId: Schema.optionalKey(ButtonIndex),
  checkbox: Schema.optionalKey(
    Schema.Struct({
      label: Schema.String.check(Schema.isMinLength(1)),
      checked: Schema.optionalKey(Schema.Boolean),
    }),
  ),
  noLink: Schema.optionalKey(Schema.Boolean),
  normalizeAccessKeys: Schema.optionalKey(Schema.Boolean),
}).check(
  Schema.makeFilter((options) => {
    if (options.defaultId !== undefined && options.defaultId >= options.buttons.length) {
      return { path: ["defaultId"], issue: "Default button index is outside the button array" };
    }
    if (options.cancelId !== undefined && options.cancelId >= options.buttons.length) {
      return { path: ["cancelId"], issue: "Cancel button index is outside the button array" };
    }
  }),
);
export type MessageOptions = typeof MessageOptions.Type;

export const MessageResult = Schema.Struct({
  response: ButtonIndex,
  checkboxChecked: Schema.Boolean,
});
export type MessageResult = typeof MessageResult.Type;

const Text = Schema.String.check(Schema.isMinLength(1));
export const FileFilter = Schema.Struct({
  name: Text,
  extensions: Schema.NonEmptyArray(
    Text.check(Schema.isPattern(/^(?:\*|[^.*?/\\\s\u0000-\u001f\u007f]+)$/)),
  ),
});
export type FileFilter = typeof FileFilter.Type;

const FileOptions = {
  title: Schema.optionalKey(Schema.String),
  defaultPath: Schema.optionalKey(Schema.String),
  buttonLabel: Schema.optionalKey(Schema.String),
};
const Filters = Schema.optionalKey(Schema.NonEmptyArray(FileFilter));
const OpenFields = { ...FileOptions, multiple: Schema.optionalKey(Schema.Boolean) };

export const OpenOptions = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("file"), ...OpenFields, filters: Filters }),
  Schema.Struct({ mode: Schema.Literal("directory"), ...OpenFields }),
]);
export type OpenOptions = typeof OpenOptions.Type;

export const SaveOptions = Schema.Struct({ ...FileOptions, filters: Filters });
export type SaveOptions = typeof SaveOptions.Type;

const Canceled = Schema.Struct({ kind: Schema.Literal("canceled") });
export const OpenResult = Schema.Union([
  Canceled,
  Schema.Struct({ kind: Schema.Literal("selected"), paths: Schema.NonEmptyArray(Text) }),
]);
export type OpenResult = typeof OpenResult.Type;

export const SaveResult = Schema.Union([
  Canceled,
  Schema.Struct({ kind: Schema.Literal("selected"), path: Text }),
]);
export type SaveResult = typeof SaveResult.Type;
