import type { Deferred, Fiber } from "effect";
import type { FromClientEncoded } from "effect/rpc/RpcMessage";
import type * as PendingBytes from "./PendingBytes.ts";
import type { Connection, Wire } from "./Transport.ts";

/** The parts of one bulk request received so far, and what they weigh against its bound. */
export interface Assembly {
  readonly id: RequestId;
  readonly tag: string;
  readonly parts: Uint8Array[];
  readonly reservation: PendingBytes.Reservation;
  bytes: number;
}

/** A request id exactly as the peer wrote it: `1` and `"1"` name different requests. */
export type RequestId = string | number;
export type RequestMessage = Extract<FromClientEncoded, { _tag: "Request" }>;

export interface OpenRequest {
  readonly tag: string;
  readonly reservation: PendingBytes.Reservation;
  /**
   * Waiting in the inbox, being decoded by RpcServer's writer (the fiber), with its handler, or
   * answered. A request leaves the first two stages by an interruption this owner answers itself.
   */
  stage: "queued" | Fiber.Fiber<void> | "handling" | "ended";
}

export type Incoming =
  | {
      readonly _tag: "Request";
      readonly clientId: number;
      readonly message: RequestMessage;
      readonly open: OpenRequest;
    }
  | {
      readonly _tag: "Control";
      readonly clientId: number;
      readonly message: Exclude<FromClientEncoded, RequestMessage>;
    };

export interface Client {
  connection: Connection;
  unsubscribe: () => void;
  /** Every request still open on this connection, by id, with the operation it named. */
  requests: Map<RequestId, OpenRequest>;
  acknowledgments: Map<RequestId, Deferred.Deferred<void>>;
  /**
   * Requests on a `Binary.bulkAnswer` operation whose caller has interrupted them. An answer
   * still to come sends nothing; one leaving in parts stops after the part in flight.
   */
  abandoned: Set<RequestId>;
  assembly: Assembly | undefined;
  /** Both directions of the protocol send through here: a refused packet is a lost connection. */
  send: (message: Wire) => boolean;
}

/** Lets go of a bulk request that will not be completed, with the bytes it held. */
export const dropAssembly = (client: Client): void => {
  client.assembly?.reservation.release();
  client.assembly = undefined;
};
