import { Schema, Stream } from "effect";
import * as InternalBytes from "./internal/Bytes.ts";
export { binary as protocol } from "./internal/Encoding.ts";
export { bulk } from "./internal/Bulk.ts";
export type { BytesField, Options as BulkOptions } from "./internal/Bulk.ts";

export const chunkBytes = 64 * 1024;

/**
 * Native bytes in a Binary.protocol; structural RPC codecs preserve this declaration.
 *
 * Bytes are recognized by what they are rather than by which realm made them, and a field is
 * re-viewed into this realm on its way to the packer. A test environment that installs its own
 * `Uint8Array` over the global — vitest's `jsdom` is the one consumers meet — therefore encodes
 * and decodes a byte field the way a renderer does.
 *
 * The name is the type. A byte field is `Uint8Array` on both sides of the codec, and naming that
 * here is what keeps every schema built on it — and the declaration a consumer hovers — reading as
 * `Bytes` rather than as the declaration and the transformation it is assembled from.
 */
export interface Bytes extends Schema.decodeTo<
  Schema.declare<Uint8Array>,
  Schema.declare<Uint8Array>,
  never,
  never
> {}
export const Bytes: Bytes = InternalBytes.Bytes;

/** Splits byte chunks lazily; callers retain ownership of their input buffers. */
export const chunks = <E, R>(source: Stream.Stream<Uint8Array, E, R>) =>
  source.pipe(
    Stream.flatMap((bytes) =>
      Stream.fromIterable(
        (function* () {
          for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes)
            yield bytes.subarray(offset, offset + chunkBytes);
        })(),
      ),
    ),
  );
