import type { Event, Placement } from "../Diagnostics.ts";
import { sizeOf, type Wire } from "./Transport.ts";

const sampleIntervalMs = 100;
// Runtime.server admits at most 128 connections and
// maxRequestsPerConnection requests per connection. Stream tracking starts
// only after those checks, so its active map is structurally bounded by the
// transport admission limit.

export interface Identity {
  readonly ownerId: string;
  readonly clientId: number;
  readonly requestId: string;
  readonly placement: Placement;
}

interface TransferState extends Identity {
  frames: number;
  wireBytes: number;
  lastSampleAt: number | undefined;
}

export interface Tracker {
  readonly start: (identity: Identity) => void;
  readonly frame: (identity: Identity, message: Wire) => void;
  readonly finish: (identity: Identity) => void;
}

const keyOf = (identity: Identity): string =>
  `${identity.ownerId}\u0000${identity.clientId}\u0000${identity.requestId}`;

export const make = (emit: (event: Event) => void): Tracker => {
  const transfers = new Map<string, TransferState>();

  const sample = (state: TransferState, terminal: boolean): void => {
    emit({
      _tag: "TransferProgress",
      ownerId: state.ownerId,
      clientId: state.clientId,
      requestId: state.requestId,
      frames: state.frames,
      wireBytes: state.wireBytes,
      terminal,
      ...state.placement,
    });
    state.lastSampleAt = Date.now();
  };

  const start = (identity: Identity): void => {
    const key = keyOf(identity);
    if (transfers.has(key)) return;
    transfers.set(key, {
      ...identity,
      frames: 0,
      wireBytes: 0,
      lastSampleAt: undefined,
    });
  };

  const frame = (identity: Identity, message: Wire): void => {
    const state = transfers.get(keyOf(identity));
    if (state === undefined) return;
    state.frames += 1;
    state.wireBytes += sizeOf(message);
    const now = Date.now();
    if (state.lastSampleAt === undefined || now - state.lastSampleAt >= sampleIntervalMs)
      sample(state, false);
  };

  const finish = (identity: Identity): void => {
    const key = keyOf(identity);
    const state = transfers.get(key);
    if (state === undefined) return;
    sample(state, true);
    transfers.delete(key);
  };

  return { start, frame, finish };
};
