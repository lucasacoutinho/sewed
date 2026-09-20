import { RpcSerialization } from "effect/unstable/rpc";
import { Packr, Unpackr } from "msgpackr";

// Effect 4.0.0-rc.113 dropped its MessagePack serializer; this keeps the same wire format.
// Independent records let a relay validate a packet without retaining codec state.
const options = { useRecords: false } as const;
const packr = new Packr(options);
const unpackr = new Unpackr(options);

const noncanonical = "Noncanonical or incomplete binary RPC packet";

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
  // An indexed loop, not `some`: a bulk request's packet is megabytes, and calling a closure per
  // byte costs most of the decode — 61 of 68 ms on a 12 MiB packet, against 4.9 ms for this. The
  // comparison is the same one. This module runs in renderers too, so no `Buffer`.
  if (canonical.length !== bytes.length) throw new TypeError(noncanonical);
  for (let index = 0; index < canonical.length; index++) {
    if (canonical[index] !== bytes[index]) throw new TypeError(noncanonical);
  }
  return message;
};
