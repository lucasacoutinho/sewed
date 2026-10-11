import path from "node:path";
import { nativeImage } from "electron";
import { Effect, Schema } from "effect";
import { Bitmap, type Source } from "../Image.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { nativeImageOf } from "./ImageSource.ts";
import { only } from "./Platform.ts";

export { Bitmap, Layer, Scaled, Source, aspectRatio, compose, crop } from "../Image.ts";

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

const bitmapOf = (image: Electron.NativeImage, what: string): Bitmap => {
  const { width, height } = image.getSize();
  if (image.isEmpty() || width <= 0 || height <= 0)
    throw new SewedError({ code: "Native", message: `${what} produced no image` });
  return { width, height, bytes: new Uint8Array(image.toBitmap()) };
};
const decodeSize = Schema.decodeUnknownSync(
  Schema.Struct({
    width: Schema.Int.check(Schema.isGreaterThan(0)),
    height: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
);
const decodeName = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));

/**
 * The operating system's preview thumbnail for a file, by absolute path, on macOS and Windows.
 * Fails `Protocol` for a relative path or an invalid size, `Native` elsewhere and when the system
 * has no thumbnail for the file.
 */
export const thumbnail = (
  target: string,
  size: { readonly width: number; readonly height: number },
): Effect.Effect<Bitmap, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => {
        if (typeof target !== "string" || !path.isAbsolute(target))
          throw new SewedError({ code: "Protocol", message: "Thumbnail path must be absolute" });
        return [target, validated(() => decodeSize(size), "Invalid thumbnail size")] as const;
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Invalid thumbnail request", cause),
    }),
    ([file, dimensions]) =>
      Effect.andThen(
        MainContext,
        Effect.tryPromise({
          try: async () => {
            only(["darwin", "win32"], "File thumbnails");
            return bitmapOf(
              await nativeImage.createThumbnailFromPath(file, dimensions),
              "The thumbnail",
            );
          },
          catch: (cause) =>
            cause instanceof SewedError ? cause : nativeError("Could not create thumbnail", cause),
        }),
      ),
  );

const system =
  (what: string, create: (name: string) => Electron.NativeImage) =>
  (name: string): Effect.Effect<Bitmap, SewedError, MainContext> =>
    Effect.andThen(
      MainContext,
      Effect.try({
        try: () => {
          const value = validated(() => decodeName(name), "Invalid image name");
          only(["darwin"], what);
          return bitmapOf(create(value), what);
        },
        catch: (cause) =>
          cause instanceof SewedError ? cause : nativeError(`Could not create ${what}`, cause),
      }),
    );

/** A macOS system image by its `NSImageName`, such as `NSImageNameAddTemplate`. */
export const named = system("A named system image", (name) =>
  nativeImage.createFromNamedImage(name),
);

/** A macOS SF Symbol sized for a menu item, by symbol name. */
export const menuSymbol = system("A menu symbol", (name) => nativeImage.createMenuSymbol(name));

const decodeDataUrl = Schema.decodeUnknownSync(Schema.String.check(Schema.isPattern(/^data:/)));

/** A bitmap as a PNG `data:` URL, for an `img` element or a stylesheet. */
export const toDataUrl = (bitmap: Bitmap): Effect.Effect<string, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => {
        const valid = validated(() => decodeBitmap(bitmap), "Invalid bitmap");
        return nativeImage
          .createFromBitmap(Buffer.from(valid.bytes), { width: valid.width, height: valid.height })
          .toDataURL();
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Could not encode image", cause),
    }),
  );

/** Decodes a `data:` URL holding a PNG or JPEG image into a bitmap. */
export const fromDataUrl = (url: string): Effect.Effect<Bitmap, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => {
        const value = validated(() => decodeDataUrl(url), "Invalid data URL");
        const image = nativeImage.createFromDataURL(value);
        const { width, height } = image.getSize();
        if (image.isEmpty() || width <= 0 || height <= 0)
          throw new SewedError({ code: "Protocol", message: "The data URL holds no image" });
        return { width, height, bytes: new Uint8Array(image.toBitmap()) };
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Could not decode image", cause),
    }),
  );
