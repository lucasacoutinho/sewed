import { RpcSerialization } from "effect/unstable/rpc";

// Independent records let a relay validate a packet without retaining codec state.
const serialization = RpcSerialization.makeMsgPack({ useRecords: false });
const encoder = serialization.makeUnsafe();

export const codecFor = RpcSerialization.json.codecFor;

export const encodeBinary = (message: unknown): Uint8Array => {
  const encoded = encoder.encode(message);
  if (!(encoded instanceof Uint8Array)) throw new TypeError("Expected one binary RPC packet");
  // The encoder may return a view into a reusable arena. Queued packets own their bytes.
  return Uint8Array.from(encoded);
};

export const decodeBinary = (bytes: Uint8Array): unknown => {
  const messages = serialization.makeUnsafe().decode(bytes);
  if (messages.length !== 1) throw new TypeError("Expected one binary RPC message");
  const message: unknown = messages[0];
  const canonical = encodeBinary(message);
  if (canonical.length !== bytes.length || canonical.some((byte, index) => byte !== bytes[index]))
    throw new TypeError("Noncanonical or incomplete binary RPC packet");
  return message;
};
