import { Deferred, Effect, Match } from "effect";
import type { FromServerEncoded } from "effect/rpc/RpcMessage";
import { SewedError } from "../SewedError.ts";
import type { AnswerBound } from "./Bulk.ts";
import type { Encoding } from "./Encoding.ts";
import type { Client, Incoming, RequestId } from "./OwnerClient.ts";
import {
  answerParts,
  encode,
  encodeChunks,
  failExit,
  maxMessageBytes,
  type Wire,
} from "./Transport.ts";

// Encoding throws on a value over its limit, once per message; `try`/`catch` costs nothing on
// the path that does not throw, where `Effect.try` would allocate for every message.
// @effect-diagnostics tryCatchInEffectGen:off

/** What the send path needs of the owner it belongs to. */
export interface Owner {
  readonly clients: ReadonlyMap<number, Client>;
  readonly encoding: Encoding;
  readonly answerBounds: ReadonlyMap<string, AnswerBound>;
  readonly offer: (incoming: Incoming) => boolean;
  readonly disconnect: (clientId: number, reason: string) => void;
  readonly endRequest: (
    clientId: number,
    client: Client,
    requestId: RequestId,
    outcome: "success" | "failure" | "interrupted",
  ) => void;
  /** Called for each stream frame that left. */
  readonly onFrame: (clientId: number, requestId: RequestId, frame: Wire) => void;
}

const outcomeOf = (exit: Extract<FromServerEncoded, { _tag: "Exit" }>["exit"]) =>
  Match.value(exit).pipe(
    Match.tag("Success", () => "success" as const),
    Match.tag("Failure", (failure) =>
      failure.cause.some((cause) => cause._tag === "Interrupt")
        ? ("interrupted" as const)
        : ("failure" as const),
    ),
    Match.exhaustive,
  );

/**
 * How an owner ships what RpcServer hands it: an answer whole, a bulk answer or a stream in
 * acknowledged parts, and a typed refusal in place of an answer that does not fit.
 */
export const make = (owner: Owner) => {
  const { clients, encoding, answerBounds, disconnect, endRequest } = owner;
  return (id: number, response: FromServerEncoded): Effect.Effect<void> =>
    Effect.gen(function* () {
      const client = clients.get(id);
      if (!client) return;
      // A request this owner no longer tracks was already answered: a stream value over
      // the envelope, whose handler was then interrupted, still ends with an Exit.
      if (
        (response._tag === "Exit" || response._tag === "Chunk") &&
        !client.requests.has(response.requestId)
      )
        return;
      // The one message a handler's own answer refuses to send in place of: over the
      // envelope, typed exactly as a lost connection would answer the same request,
      // because from here the two are indistinguishable — the handler ran, and its
      // answer did not arrive.
      const overLimit = (requestId: string | number) =>
        client.send(
          encode(
            failExit(
              requestId,
              "Unknown",
              "The host's answer exceeded the message envelope; whether it was handled is unknown",
              "transport/answer-over-limit",
            ),
            encoding,
          ),
        );
      // A unary operation declaring `Binary.bulkAnswer` gets its own encode threshold —
      // its declared bound, not the ordinary envelope — and, only when the encoded Exit
      // does not fit one envelope, leaves as acknowledged `AnswerPart` frames instead of
      // one message. An answer that happens to fit anyway is sent whole, exactly like an
      // ordinary call, so declaring the bound costs nothing on a small answer.
      const tag =
        response._tag === "Exit" ? client.requests.get(response.requestId)?.tag : undefined;
      const answerBound = tag === undefined ? undefined : answerBounds.get(tag);
      if (answerBound !== undefined && response._tag === "Exit") {
        const key = response.requestId;
        // The caller interrupted this request: nothing it could still receive is wanted,
        // and its client no longer tracks the request to receive it.
        if (client.abandoned.delete(key)) {
          endRequest(id, client, response.requestId, "interrupted");
          return;
        }
        let wire: Wire;
        try {
          wire = encode(response, encoding, answerBound.maxBytes);
        } catch (cause) {
          if (!(cause instanceof SewedError) || cause.code !== "Limit") throw cause;
          endRequest(id, client, response.requestId, "failure");
          overLimit(response.requestId);
          return;
        }
        if (typeof wire === "string")
          throw new TypeError("A bulk-answer operation is not a Binary.protocol");
        if (wire.byteLength <= maxMessageBytes) {
          endRequest(id, client, response.requestId, outcomeOf(response.exit));
          client.send(wire);
          return;
        }
        // The request stays open while its parts leave, so a disconnect in between
        // reports it disconnected, and its end is reported after the last part.
        yield* Effect.gen(function* () {
          for (const frame of answerParts(response.requestId, wire, encoding)) {
            if (frame.final) {
              client.acknowledgments.delete(key);
              endRequest(id, client, response.requestId, outcomeOf(response.exit));
              client.send(frame.message);
            } else {
              const acknowledgment = Deferred.makeUnsafe<void>();
              client.acknowledgments.set(key, acknowledgment);
              if (!client.send(frame.message)) return;
              yield* Deferred.await(acknowledgment);
              // An Interrupt releases this wait too: the part just sent is the last.
              if (client.abandoned.delete(key)) {
                endRequest(id, client, response.requestId, "interrupted");
                return;
              }
            }
          }
        }).pipe(Effect.ensuring(Effect.sync(() => client.acknowledgments.delete(key))));
        return;
      }
      if (response._tag !== "Chunk") {
        let message: Wire;
        try {
          message = encode(response, encoding);
        } catch (cause) {
          if (!(cause instanceof SewedError) || cause.code !== "Limit") throw cause;
          if (response._tag !== "Exit") throw cause;
          // Effect's RpcServer would otherwise catch this throw as a defect and ship a
          // Die, after the handler already ran. Substituting the typed refusal here, and
          // letting this `send` return normally, keeps RpcServer from ever learning that
          // its write "failed" — from its side, the answer simply went out.
          endRequest(id, client, response.requestId, "failure");
          overLimit(response.requestId);
          return;
        }
        if (response._tag === "Exit")
          endRequest(id, client, response.requestId, outcomeOf(response.exit));
        client.send(message);
        return;
      }
      const key = response.requestId;
      yield* Effect.gen(function* () {
        try {
          for (const frame of encodeChunks(response, encoding)) {
            if (frame.final) {
              client.acknowledgments.delete(key);
              if (client.send(frame.message)) owner.onFrame(id, key, frame.message);
            } else {
              const acknowledgment = Deferred.makeUnsafe<void>();
              client.acknowledgments.set(key, acknowledgment);
              if (!client.send(frame.message)) return;
              owner.onFrame(id, key, frame.message);
              yield* Deferred.await(acknowledgment);
            }
          }
        } catch (cause) {
          if (!(cause instanceof SewedError) || cause.code !== "Limit") throw cause;
          // A stream value too large to fit one envelope even alone: encodeChunks has
          // nothing left to try, so the request ends here, typed, rather than dying the
          // connection's own RpcServer loop. Earlier values already delivered stand.
          endRequest(id, client, response.requestId, "failure");
          overLimit(response.requestId);
          // The handler is parked until this chunk is acknowledged, which it never will
          // be. Interrupting it releases its finalizers and its concurrency permit; the
          // Exit that interruption produces finds the request already answered.
          if (
            !owner.offer({
              _tag: "Control",
              clientId: id,
              message: { _tag: "Interrupt", requestId: response.requestId },
            })
          )
            disconnect(id, "inbox-overflow");
        }
      }).pipe(Effect.ensuring(Effect.sync(() => client.acknowledgments.delete(key))));
    });
};
