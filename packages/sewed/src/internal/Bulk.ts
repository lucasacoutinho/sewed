import { Context, Option } from "effect";
import type { Schema } from "effect";
import type { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";
import { SewedError } from "../SewedError.ts";

/** The most a bulk operation may declare; the owner holds at most one assembly per connection. */
export const maxBulkBytes = 64 * 1024 * 1024;

const Bound = Context.Service<never, number>("sewed/BulkRequest");

export interface Options {
  /** The largest encoded request the operation accepts over a binding, in bytes. */
  readonly maxBytes: number;
}

/**
 * Declares that an operation's request may exceed the envelope limit, up to `maxBytes`. The
 * client sends such a request in acknowledged parts and the owner assembles it before the
 * handler runs; an honest client refuses a larger one before sending anything. The bound covers
 * the whole encoded request, the payload and the envelope's own bytes together, so an operation
 * that accepts a 12 MiB attachment declares a little more than 12 MiB.
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
  options: Options,
): Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires> => {
  const { maxBytes } = options;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > maxBulkBytes) {
    throw new SewedError({
      code: "Protocol",
      message: `A bulk bound is a positive integer of at most ${maxBulkBytes} bytes`,
    });
  }
  return rpc.annotate(Bound, maxBytes);
};

/** Every bulk operation of a protocol with its bound, by tag; empty for a protocol with none. */
export const boundsOf = <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
): ReadonlyMap<string, number> => {
  const bounds = new Map<string, number>();
  for (const [tag, rpc] of protocol.requests) {
    const bound = Context.getOption(rpc.annotations, Bound);
    if (Option.isSome(bound)) bounds.set(tag, bound.value);
  }
  return bounds;
};
