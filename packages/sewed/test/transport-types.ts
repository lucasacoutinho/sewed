import type { ResponseChunkEncoded } from "effect/rpc/RpcMessage";
import type { Encoding } from "../lib/internal/Encoding.js";
import { encode, encodeChunks } from "../lib/internal/Transport.js";
import type { Wire } from "../lib/internal/Transport.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const representations = (message: unknown, chunk: ResponseChunkEncoded, encoding: Encoding) => ({
  defaultMessage: encode(message),
  jsonMessage: encode(message, "json"),
  binaryMessage: encode(message, "binary"),
  selectedMessage: encode(message, encoding),
  defaultChunks: encodeChunks(chunk),
  jsonChunks: encodeChunks(chunk, "json"),
  binaryChunks: encodeChunks(chunk, "binary"),
  selectedChunks: encodeChunks(chunk, encoding),
});

type Representations = ReturnType<typeof representations>;
type Chunk<Format> = { readonly message: Format; readonly final: boolean };

export type TransportContracts = [
  Assert<Equal<Representations["defaultMessage"], string>>,
  Assert<Equal<Representations["jsonMessage"], string>>,
  Assert<Equal<Representations["binaryMessage"], Uint8Array>>,
  Assert<Equal<Representations["selectedMessage"], Wire>>,
  Assert<Equal<Representations["defaultChunks"], Generator<Chunk<string>>>>,
  Assert<Equal<Representations["jsonChunks"], Generator<Chunk<string>>>>,
  Assert<Equal<Representations["binaryChunks"], Generator<Chunk<Uint8Array>>>>,
  Assert<Equal<Representations["selectedChunks"], Generator<Chunk<Wire>>>>,
];
