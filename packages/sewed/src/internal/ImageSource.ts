import { nativeImage } from "electron";
import type { NativeImage } from "electron";
import { Schema } from "effect";
import { Source } from "../Image.ts";
import { SewedError } from "../SewedError.ts";

const decodeSource = Schema.decodeUnknownSync(Source);

/**
 * Resolves an `Image.Source` (a path or already-encoded bytes) to a native image, for every icon
 * door that takes one: `internal/Window.ts`'s `setIcon` and `setOverlayIcon` in this wave, the
 * tray and the dock in the next. Fails `Protocol`, naming `label`, for a value outside the schema
 * or bytes no decoder reads back as a non-empty image.
 */
export const nativeImageOf = (source: Source, label: string): NativeImage => {
  let value: Source;
  try {
    value = decodeSource(source);
  } catch (cause) {
    throw new SewedError({
      code: "Protocol",
      message: `${label} is not a valid image source`,
      cause,
    });
  }
  const image =
    typeof value === "string"
      ? nativeImage.createFromPath(value)
      : nativeImage.createFromBuffer(Buffer.from(value));
  if (image.isEmpty())
    throw new SewedError({
      code: "Protocol",
      message: `${label} is not a readable image: ${typeof value === "string" ? value : "bytes"}`,
    });
  return image;
};
