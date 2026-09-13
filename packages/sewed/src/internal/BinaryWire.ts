import { RpcSerialization } from "effect/unstable/rpc";
import { Packr, Unpackr } from "msgpackr";

// Effect 4.0.0-rc.113 dropped its MessagePack serializer; this keeps the same wire format.
// Independent records let a relay validate a packet without retaining codec state.
const options = { useRecords: false } as const;
const packr = new Packr(options);
const unpackr = new Unpackr(options);

export const codecFor = RpcSerialization.json.codecFor;

export const encodeBinary = (message: unknown): Uint8Array => {
  // The packer returns a view into a reusable arena. Queued packets own their bytes.
  return Uint8Array.from(packr.pack(message));
};

export const decodeBinary = (bytes: Uint8Array): unknown => {
  let messages: unknown[];
  try {
    messages = unpackr.unpackMultiple(bytes);
  } catch (cause) {
    throw new TypeError("Malformed binary RPC packet", { cause });
  }
  if (messages.length !== 1) throw new TypeError("Expected one binary RPC message");
  const message: unknown = messages[0];
  const canonical = encodeBinary(message);
  if (canonical.length !== bytes.length || canonical.some((byte, index) => byte !== bytes[index]))
    throw new TypeError("Noncanonical or incomplete binary RPC packet");
  return message;
};
