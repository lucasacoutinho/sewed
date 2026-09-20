import { Schema } from "effect";
import { Bytes } from "./Bytes.ts";
import type { Wire } from "./Transport.ts";

export const Hello = Schema.Struct({
  session: Schema.String,
  runtimeId: Schema.String,
  tracing: Schema.Boolean,
  bindings: Schema.Array(Schema.Struct({ key: Schema.String, ownerId: Schema.String })),
});
export const Packet = Schema.Union([
  Schema.Struct({
    connection: Schema.String,
    message: Schema.Union([Schema.String, Bytes]),
  }),
  Schema.Struct({ connection: Schema.String, error: Schema.String }),
]);

export interface Bridge {
  readonly hello: () => Promise<unknown>;
  readonly open: (session: string, slot: string, connection: string) => Promise<unknown>;
  readonly observe: (session: string, batch: string) => Promise<void>;
  readonly send: (session: string, connection: string, message: Wire) => void;
  readonly close: (session: string, connection: string) => void;
  readonly disconnect: (session: string) => void;
  readonly subscribe: (receive: (packet: unknown) => void) => () => void;
  /** The native path of a `File` the user dropped or chose; empty when it has none. */
  readonly pathOf: (file: File) => string;
}

declare global {
  interface Window {
    readonly sewed?: Bridge;
  }
}
