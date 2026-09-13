import { Schema, Stream } from "effect";
export { binary as protocol } from "./internal/Encoding.ts";

export const chunkBytes = 64 * 1024;

/** Native bytes in a Binary.protocol; structural RPC codecs preserve this declaration. */
export const Bytes = Schema.Uint8Array.annotate({ toCodecJson: () => undefined });

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
