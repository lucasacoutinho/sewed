import { Schema } from "effect";
import * as Binary from "./Binary.ts";
import { SewedError } from "./SewedError.ts";

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

/**
 * A path or already-encoded image bytes (PNG, JPEG, and the other formats `nativeImage` reads) —
 * the one schema every icon door takes: a window's `setIcon` and `setOverlayIcon` in this wave,
 * the tray and the dock in the next.
 */
/**
 * One image given as several encodings of itself, one per display scale factor, so a display at
 * 2x gets the sharp one. `bytes` is an encoded image (PNG or JPEG). A path needs none of this:
 * Electron already reads `icon@2x.png` beside `icon.png`.
 */
export const Scaled = Schema.Struct({
  representations: Schema.NonEmptyArray(
    Schema.Struct({
      scaleFactor: Schema.Finite.check(Schema.isGreaterThan(0)),
      bytes: Binary.Bytes,
    }),
  ),
});
export type Scaled = typeof Scaled.Type;

export const Source = Schema.Union([Schema.String, Binary.Bytes, Scaled]);
export type Source = typeof Source.Type;

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/**
 * A decoded bitmap: BGRA, 4 bytes per pixel, row-major, premultiplied by alpha, exactly as
 * Electron's `nativeImage.toBitmap` lays them out — a color channel above a pixel's own alpha
 * comes back clamped down to it (a hand-built `[200, 100, 50, 128]` BGRA pixel round-trips
 * through `toBitmap`/`createFromBitmap` as `[128, 100, 50, 128]`). `compose` only ever copies
 * bytes, never blends them, so this bites a consumer who hand-builds a translucent bitmap and
 * later decodes it back through `nativeImage`, not `compose` itself. `bytes.byteLength` must
 * equal `width * height * 4`; nothing else about the pixel format is checked here, and nothing
 * here touches Electron — a `Bitmap` is inert data a test can build by hand.
 */
export const Bitmap = Schema.Struct({
  width: PositiveInt,
  height: PositiveInt,
  bytes: Binary.Bytes,
}).check(
  Schema.makeFilter(
    (bitmap) =>
      bitmap.bytes.byteLength === bitmap.width * bitmap.height * 4 ||
      "bytes.byteLength must equal width * height * 4",
  ),
);
export type Bitmap = typeof Bitmap.Type;

/** One bitmap placed at a pixel offset onto a base; `compose` clips it at the base's own edges. */
export const Layer = Schema.Struct({
  bitmap: Bitmap,
  x: Schema.Int,
  y: Schema.Int,
});
export type Layer = typeof Layer.Type;

const decodeBitmap = Schema.decodeUnknownSync(Bitmap);
const decodeLayer = Schema.decodeUnknownSync(Layer);

/**
 * Copies each layer's pixels onto a copy of `base` at its pixel offset, clipping whatever falls
 * outside the base's own edges; layers apply in order, so a later one overwrites an earlier one
 * where they overlap. Pure arithmetic over BGRA bytes: no Electron, no blend modes, no rotation,
 * no crop — the consumer's need is a composite screenshot, one capture laid over another.
 *
 * `base` and every layer's `bitmap` are validated against `Bitmap` first, so a wrong byte length
 * fails `Protocol` naming it rather than reading past the end of a buffer. An empty layer list
 * still returns a copy of `base`, never the same object.
 */
export const compose = (base: Bitmap, layers: readonly Layer[]): Bitmap => {
  let validBase: Bitmap;
  try {
    validBase = decodeBitmap(base);
  } catch (cause) {
    throw protocolError("Invalid base bitmap", cause);
  }
  const validLayers: Layer[] = [];
  layers.forEach((layer, index) => {
    try {
      validLayers.push(decodeLayer(layer));
    } catch (cause) {
      throw protocolError(`Invalid layer at index ${index}`, cause);
    }
  });
  const bytes = new Uint8Array(validBase.bytes);
  for (const { bitmap, x, y } of validLayers) {
    for (let row = 0; row < bitmap.height; row++) {
      const targetY = y + row;
      if (targetY < 0 || targetY >= validBase.height) continue;
      const startX = Math.max(0, -x);
      const endX = Math.min(bitmap.width, validBase.width - x);
      if (endX <= startX) continue;
      const sourceStart = (row * bitmap.width + startX) * 4;
      const sourceEnd = (row * bitmap.width + endX) * 4;
      const targetStart = (targetY * validBase.width + (x + startX)) * 4;
      bytes.set(bitmap.bytes.subarray(sourceStart, sourceEnd), targetStart);
    }
  }
  return { width: validBase.width, height: validBase.height, bytes };
};

const decodeCrop = Schema.decodeUnknownSync(
  Schema.Struct({
    x: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    y: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    width: PositiveInt,
    height: PositiveInt,
  }),
);

/**
 * The part of `bitmap` inside `area`, as a new bitmap. An area that reaches past an edge fails
 * `Protocol`: a crop that silently came back smaller than asked would misplace everything laid
 * out against it.
 */
export const crop = (
  bitmap: Bitmap,
  area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Bitmap => {
  let source: Bitmap;
  let rect: typeof area;
  try {
    source = decodeBitmap(bitmap);
    rect = decodeCrop(area);
  } catch (cause) {
    throw protocolError("Invalid crop", cause);
  }
  if (rect.x + rect.width > source.width || rect.y + rect.height > source.height)
    throw protocolError("Crop area reaches outside the bitmap");
  const bytes = new Uint8Array(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * source.width + rect.x) * 4;
    bytes.set(source.bytes.subarray(start, start + rect.width * 4), row * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, bytes };
};

/** A bitmap's width over its height. */
export const aspectRatio = (bitmap: Bitmap): number => bitmap.width / bitmap.height;
