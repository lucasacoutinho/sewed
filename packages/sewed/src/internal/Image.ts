import { nativeImage } from "electron";
import { Effect, Schema } from "effect";
import { Bitmap, type Source } from "../Image.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { nativeImageOf } from "./ImageSource.ts";

export { Bitmap, Layer, Source, compose } from "../Image.ts";

const decodeBitmap = Schema.decodeUnknownSync(Bitmap);

export const ResizeOptions = Schema.Struct({
  width: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  height: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
});
export type ResizeOptions = typeof ResizeOptions.Type;
const decodeResizeOptions = Schema.decodeUnknownSync(ResizeOptions);

export const EncodeOptions = Schema.Struct({
  format: Schema.Literals(["png", "jpeg"]),
  quality: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
});
export type EncodeOptions = typeof EncodeOptions.Type;
const decodeEncodeOptions = Schema.decodeUnknownSync(EncodeOptions);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

/** Runs `decode`, wrapping a schema failure as `Protocol` naming `message`; a `SewedError` passes through. */
const validated = <A>(decode: () => A, message: string): A => {
  try {
    return decode();
  } catch (cause) {
    throw cause instanceof SewedError ? cause : protocolError(message, cause);
  }
};

/**
 * Decodes an `Image.Source` — a path or already-encoded bytes (PNG, JPEG, and the other formats
 * `nativeImage` reads), the same shape and the same `nativeImageOf` resolution every icon door
 * takes — into a `Bitmap`. Fails `Protocol`, naming the path, for a path or bytes no decoder
 * accepts, `Native` for any other Electron failure.
 */
export const decode = (source: Source): Effect.Effect<Bitmap, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => {
        const image = nativeImageOf(source, "Image source");
        const { width, height } = image.getSize();
        return { width, height, bytes: new Uint8Array(image.toBitmap()) };
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Could not decode image", cause),
    }),
  );

/**
 * Resizes a bitmap; omitting a dimension keeps the image's own. Fails `Protocol` for an invalid
 * bitmap or options, `Native` for an Electron failure.
 */
export const resize = (
  bitmap: Bitmap,
  options: ResizeOptions = {},
): Effect.Effect<Bitmap, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => {
        const valid = validated(() => decodeBitmap(bitmap), "Invalid bitmap");
        const settings = validated(() => decodeResizeOptions(options), "Invalid resize options");
        const source = nativeImage.createFromBitmap(Buffer.from(valid.bytes), {
          width: valid.width,
          height: valid.height,
        });
        const resized = source.resize(settings);
        const size = resized.getSize();
        return {
          width: size.width,
          height: size.height,
          bytes: new Uint8Array(resized.toBitmap()),
        };
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Could not resize image", cause),
    }),
  );

/**
 * Encodes a bitmap to PNG or JPEG bytes; `quality` (0-100) applies to JPEG only and defaults to
 * 100. Fails `Protocol` for an invalid bitmap or options, `Native` for an Electron failure.
 */
export const encode = (
  bitmap: Bitmap,
  options: EncodeOptions,
): Effect.Effect<Uint8Array, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => {
        const valid = validated(() => decodeBitmap(bitmap), "Invalid bitmap");
        const settings = validated(() => decodeEncodeOptions(options), "Invalid encode options");
        const source = nativeImage.createFromBitmap(Buffer.from(valid.bytes), {
          width: valid.width,
          height: valid.height,
        });
        return new Uint8Array(
          settings.format === "png" ? source.toPNG() : source.toJPEG(settings.quality ?? 100),
        );
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Could not encode image", cause),
    }),
  );
