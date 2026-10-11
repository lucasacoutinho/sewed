import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { SewedError } from "../src/SewedError.ts";
import * as Image from "../src/Image.ts";

/** A BGRA bitmap built from one 4-byte pixel per entry, row-major. */
const bitmap = (
  width: number,
  height: number,
  pixels: readonly (readonly number[])[],
): Image.Bitmap => {
  const bytes = new Uint8Array(width * height * 4);
  pixels.forEach((pixel, index) => bytes.set(pixel, index * 4));
  return { width, height, bytes };
};

const pixelAt = (image: Image.Bitmap, x: number, y: number): readonly number[] => {
  const offset = (y * image.width + x) * 4;
  return [...image.bytes.subarray(offset, offset + 4)];
};

test("a layer at (1,1) overwrites exactly that pixel", () => {
  const base = bitmap(2, 2, [
    [10, 10, 10, 255],
    [20, 20, 20, 255],
    [30, 30, 30, 255],
    [40, 40, 40, 255],
  ]);
  const overlay = bitmap(1, 1, [[200, 201, 202, 203]]);
  const result = Image.compose(base, [{ bitmap: overlay, x: 1, y: 1 }]);
  assert.deepEqual(pixelAt(result, 0, 0), [10, 10, 10, 255]);
  assert.deepEqual(pixelAt(result, 1, 0), [20, 20, 20, 255]);
  assert.deepEqual(pixelAt(result, 0, 1), [30, 30, 30, 255]);
  assert.deepEqual(pixelAt(result, 1, 1), [200, 201, 202, 203]);
});

test("a layer beyond the edge is clipped, not out of bounds", () => {
  const base = bitmap(2, 2, [
    [10, 10, 10, 255],
    [20, 20, 20, 255],
    [30, 30, 30, 255],
    [40, 40, 40, 255],
  ]);
  // A 2x2 layer placed at (1, 1): only its own (0, 0) pixel lands inside the base, at (1, 1).
  const overlay = bitmap(2, 2, [
    [1, 1, 1, 1],
    [2, 2, 2, 2],
    [3, 3, 3, 3],
    [4, 4, 4, 4],
  ]);
  const result = Image.compose(base, [{ bitmap: overlay, x: 1, y: 1 }]);
  assert.equal(result.width, 2);
  assert.equal(result.height, 2);
  assert.deepEqual(pixelAt(result, 0, 0), [10, 10, 10, 255]);
  assert.deepEqual(pixelAt(result, 1, 0), [20, 20, 20, 255]);
  assert.deepEqual(pixelAt(result, 0, 1), [30, 30, 30, 255]);
  assert.deepEqual(pixelAt(result, 1, 1), [1, 1, 1, 1]);

  // A layer entirely outside the base's edges leaves it untouched.
  const untouched = Image.compose(base, [{ bitmap: overlay, x: 9, y: 9 }]);
  assert.deepEqual([...untouched.bytes], [...base.bytes]);
});

test("an empty layer list returns an equal copy, not the same object", () => {
  const base = bitmap(2, 2, [
    [10, 10, 10, 255],
    [20, 20, 20, 255],
    [30, 30, 30, 255],
    [40, 40, 40, 255],
  ]);
  const result = Image.compose(base, []);
  assert.notEqual(result, base);
  assert.notEqual(result.bytes, base.bytes);
  assert.deepEqual([...result.bytes], [...base.bytes]);
  assert.equal(result.width, base.width);
  assert.equal(result.height, base.height);
});

test("a layer with a wrong byte length fails Protocol", () => {
  const base = bitmap(2, 2, [
    [10, 10, 10, 255],
    [20, 20, 20, 255],
    [30, 30, 30, 255],
    [40, 40, 40, 255],
  ]);
  const malformed: Image.Bitmap = { width: 1, height: 1, bytes: new Uint8Array([1, 2, 3]) };
  assert.throws(
    () => Image.compose(base, [{ bitmap: malformed, x: 0, y: 0 }]),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});

test("an image source is a path, encoded bytes, or one encoding per scale factor", () => {
  const decode = Schema.decodeUnknownSync(Image.Source);
  const bytes = new Uint8Array([1, 2, 3]);
  assert.equal(decode("/icons/app.png"), "/icons/app.png");
  assert.deepEqual(decode(bytes), bytes);
  const scaled = {
    representations: [
      { scaleFactor: 1, bytes },
      { scaleFactor: 2, bytes },
    ],
  };
  assert.deepEqual(decode(scaled), scaled);
  assert.throws(() => decode({ representations: [] }), "at least one representation");
  assert.throws(() => decode({ representations: [{ scaleFactor: 0, bytes }] }), "a positive scale");
  assert.throws(() => decode({ representations: [{ scaleFactor: 2, bytes: "png" }] }));
});
