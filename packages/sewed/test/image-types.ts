import type { Effect } from "effect";
import { Image, MainContext, SewedError } from "sewed";
import { Image as ImageMain } from "sewed/main";

const pixel = new Uint8Array([137, 80, 78, 71]);
const base: Image.Bitmap = { width: 1, height: 1, bytes: pixel };
const layer: Image.Layer = { bitmap: base, x: 0, y: 0 };
void layer;

// `compose` is a plain function over plain data: no Effect, no requirement.
const composed: Image.Bitmap = Image.compose(base, [layer]);
void composed;

// @ts-expect-error `compose` returns a `Bitmap` directly, not an `Effect` to run.
const composedAsEffect: Effect.Effect<Image.Bitmap, SewedError, MainContext> = Image.compose(
  base,
  [],
);
void composedAsEffect;

// A window icon or the tray/dock's, one wave from now: a path or already-encoded bytes.
const pathSource: Image.Source = "icon.png";
const bytesSource: Image.Source = pixel;
void pathSource;
void bytesSource;
// @ts-expect-error An `Image.Source` is a path or encoded bytes, not an arbitrary number.
const numberSource: Image.Source = 42;
void numberSource;

// `decode`, `resize`, and `encode` are `sewed/main` Effects, each requiring `MainContext`.
// `decode` takes an `Image.Source`, resolved the same way every icon door resolves one: a path
// or already-encoded bytes, not bytes alone.
const decoded: Effect.Effect<Image.Bitmap, SewedError, MainContext> = ImageMain.decode(pixel);
const decodedFromPath: Effect.Effect<Image.Bitmap, SewedError, MainContext> =
  ImageMain.decode("icon.png");
void decodedFromPath;
const resized: Effect.Effect<Image.Bitmap, SewedError, MainContext> = ImageMain.resize(base, {
  width: 2,
});
const encoded: Effect.Effect<Uint8Array, SewedError, MainContext> = ImageMain.encode(base, {
  format: "png",
});
void decoded;
void resized;
void encoded;

// @ts-expect-error `decode` retains main placement; it is not runnable without `MainContext`.
const decodedWithoutMain: Effect.Effect<Image.Bitmap, SewedError> = ImageMain.decode(pixel);
void decodedWithoutMain;
