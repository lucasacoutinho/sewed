import { Context, Option } from "effect";
import type { Schema } from "effect";
import type { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";
import { SewedError } from "../SewedError.ts";

/** The most a bulk operation may declare; the owner holds at most one assembly per connection. */
export const maxBulkBytes = 64 * 1024 * 1024;

/** What one operation declared: which payload field carries the bytes, and how many it may carry. */
export interface Bound {
  readonly field: string;
  readonly maxBytes: number;
}

const Declared = Context.Service<never, Bound>("sewed/BulkRequest");

/**
 * The payload fields a bulk declaration may name: the ones that carry bytes. Naming any other
 * field, or one the payload does not have, is a compile error, so the field the transport
 * measures always exists and is always the one holding the bulk.
 */
export type BytesField<Payload extends Schema.Top> = {
  [Key in keyof Payload["Type"]]: Payload["Type"][Key] extends Uint8Array ? Key : never;
}[keyof Payload["Type"]] &
  string;

export interface Options<Payload extends Schema.Top> {
  /** The payload field carrying the bytes; it is `Binary.Bytes` in a `Binary.protocol`. */
  readonly field: BytesField<Payload>;
  /** The largest that field may be, in bytes. */
  readonly maxBytes: number;
}

/**
 * Declares that an operation's `field` may exceed the envelope limit, up to `maxBytes`. The
 * client sends such a request in acknowledged parts and the owner assembles it before the
 * handler runs; an honest client refuses a larger one before sending anything.
 *
 * `maxBytes` bounds that one field exactly. The rest of the request keeps the ordinary envelope
 * allowance on top of it, so an operation that accepts a 12 MiB attachment declares 12 MiB and
 * the command, headers and envelope beside it still have their own 256 KiB.
 *
 * The bound is a transport fact: an in-process call has no wire and no bound.
 */
export const bulk = <
  Tag extends string,
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Failure extends Schema.Top,
  Middleware extends RpcMiddleware.AnyService,
  Requires,
>(
  rpc: Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires>,
  options: Options<Payload>,
): Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires> => {
  const { field, maxBytes } = options;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > maxBulkBytes) {
    throw new SewedError({
      code: "Protocol",
      message: `A bulk bound is a positive integer of at most ${maxBulkBytes} bytes`,
    });
  }
  return rpc.annotate(Declared, { field, maxBytes });
};

/** Every bulk operation of a protocol with its bound, by tag; empty for a protocol with none. */
export const boundsOf = <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
): ReadonlyMap<string, Bound> => {
  const bounds = new Map<string, Bound>();
  for (const [tag, rpc] of protocol.requests) {
    const bound = Context.getOption(rpc.annotations, Declared);
    if (Option.isSome(bound)) bounds.set(tag, bound.value);
  }
  return bounds;
};
