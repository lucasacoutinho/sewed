import { Schema } from "effect";

const utf8 = new TextEncoder();
const bytes = (limit: number) =>
  Schema.makeFilter((text: string) =>
    utf8.encode(text).byteLength <= limit ? true : `must be at most ${limit} bytes`,
  );
/** Crash parameter keys are at most 39 bytes and values at most 127 bytes, as Electron requires. */
export const Key = Schema.String.check(Schema.isMinLength(1), bytes(39));
export const Value = Schema.String.check(bytes(127));
const within = (text: string, limit: number) => utf8.encode(text).byteLength <= limit;
export const Parameters = Schema.Record(Schema.String, Schema.String).check(
  Schema.makeFilter((record) => {
    for (const [key, value] of Object.entries(record)) {
      if (key.length === 0 || !within(key, 39))
        return `Crash parameter key "${key}" exceeds 39 bytes`;
      if (!within(value, 127)) return `Crash parameter "${key}" exceeds 127 bytes`;
    }
    return true;
  }),
);
export type Parameters = typeof Parameters.Type;

export const Options = Schema.Struct({
  /** Crash reports carry process state, so they only travel over HTTPS. */
  submitUrl: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^https:\/\/[^\s/]+/))),
  productName: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  companyName: Schema.optionalKey(Schema.String),
  uploadToServer: Schema.optionalKey(Schema.Boolean),
  ignoreSystemCrashHandler: Schema.optionalKey(Schema.Boolean),
  rateLimit: Schema.optionalKey(Schema.Boolean),
  compress: Schema.optionalKey(Schema.Boolean),
  extra: Schema.optionalKey(Parameters),
  globalExtra: Schema.optionalKey(Parameters),
});
export type Options = typeof Options.Type;

export const Report = Schema.Struct({ id: Schema.String, date: Schema.String });
export type Report = typeof Report.Type;
