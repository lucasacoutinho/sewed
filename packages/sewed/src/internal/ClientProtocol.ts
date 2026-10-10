import { Cause, Deferred, Effect, Queue, Scope, Semaphore } from "effect";
import type { Fiber } from "effect";
import { RpcClient, RpcSerialization } from "effect/rpc";
import { RpcClientError } from "effect/rpc/RpcClientError";
import type { FromClientEncoded, FromServerEncoded } from "effect/rpc/RpcMessage";
import { SewedError } from "../SewedError.ts";
import * as BinaryWire from "./BinaryWire.ts";
import type { AnswerBound, Bound } from "./Bulk.ts";
import type { Encoding } from "./Encoding.ts";
import * as PendingBytes from "./PendingBytes.ts";
import * as QueueDiagnostics from "./QueueDiagnostics.ts";
import {
  bulkField,
  concat,
  decodeServer,
  encode,
  failExit,
  maxMessageBytes,
  maxPendingMessages,
  maxRequestsPerConnection,
  minPartBytes,
  narrower,
  rpcError,
  sizeOf,
  Undecodable,
  type AnswerPart,
  type Connection,
  type PartAck,
  type Wire,
} from "./Transport.ts";

interface OpenRequest {
  readonly queue: Queue.Queue<FromServerEncoded>;
  readonly fiber: Fiber.Fiber<void>;
  /** The recipient `write` routes a synthetic Exit to, the same `id` `send` was called with. */
  readonly clientId: number;
  /** The operation this request named, so an `AnswerPart` for it can find its own bound. */
  readonly tag: string;
  /**
   * Set once `connection.send` (or the last bulk part) has actually left. `fail` reads
   * this to answer `Closed` (never left) or `Unknown` (left, no answer arrived) for a
   * request still here when the connection is lost. A loss `fail` learns about
   * synchronously — nested inside this very `connection.send` call, which only an
   * in-process owner can trigger (`pair()`, `Host.ts`) — runs before this flips, so it
   * still answers `Closed` even though the bytes already left: the transport can only
   * prove what it has already observed, and a synchronous close from inside the send
   * reads as the owner refusing the frame, not as losing it after taking it (T5).
   */
  sent: boolean;
  /**
   * The parts of this request's bulk answer received so far, or `"complete"` once its
   * final part arrived. It lives on the request's own record, so whatever retires the
   * request — its answer, its caller's interruption, a lost connection — retires the
   * assembly with it.
   */
  answer: { readonly parts: Uint8Array[]; bytes: number } | "complete" | undefined;
  /** What this request's partial bulk answer holds against the connection's budget. */
  reservation: PendingBytes.Reservation | undefined;
}

export const clientProtocol = (
  connection: Connection,
  encoding: Encoding = "json",
  bounds: ReadonlyMap<string, Bound> = new Map(),
  answerBounds: ReadonlyMap<string, AnswerBound> = new Map(),
  onFailure?: () => void,
  options: { readonly maxPendingBytes?: number } = {},
) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (write) {
      // Native callbacks run their Effects with the services this program was given.
      const surrounding = yield* Effect.context<never>();
      const pendingBytes = yield* Effect.sync(() => PendingBytes.make(options.maxPendingBytes));
      const scope = yield* Scope.fork(yield* Effect.scope);
      // One bulk request crosses a connection at a time, so its owner holds one assembly and the
      // memory a connection costs is bounded by the largest declared bound. Only a bulk send
      // takes the permit: an ordinary request is sent between two parts without waiting.
      const gate = Semaphore.makeUnsafe(1);
      /** The rendezvous for the one part in flight on a connection: the owner's `PartAck`. */
      const partAcks = new Map<string | number, Deferred.Deferred<void, RpcClientError>>();
      /**
       * One wait per bulk send in progress, covering the whole span in which the owner cannot yet
       * have seen the request: the wait for the gate, in which not a byte has left, and the part
       * loop after it. A lost connection fails these, so a caller whose request was queued behind
       * another transfer is told the same fact as one suspended between two parts — the request
       * was not delivered — instead of a bare interruption that says nothing about the owner.
       */
      const undelivered = new Map<string | number, Deferred.Deferred<never, RpcClientError>>();
      const inbox = yield* Queue.bounded<FromServerEncoded, RpcClientError>(maxPendingMessages);
      const recipients = new Set<number>();
      const requests = new Map<string | number, OpenRequest>();
      yield* QueueDiagnostics.observe(
        () =>
          Queue.sizeUnsafe(inbox) +
          [...requests.values()].reduce(
            (total, request) => total + Queue.sizeUnsafe(request.queue),
            0,
          ),
        maxPendingMessages + maxRequestsPerConnection * 2,
        { kind: "rpc-client", activeRequests: () => requests.size },
      );
      let failure: RpcClientError | undefined;
      let unsubscribe = () => {};
      let connectionClosed = false;
      const closeConnection = () => {
        if (connectionClosed) return;
        connectionClosed = true;
        unsubscribe();
        connection.close();
      };
      const retire = (key: string | number) => {
        const request = requests.get(key);
        if (request !== undefined) {
          requests.delete(key);
          request.reservation?.release();
        }
        return request;
      };
      const interrupt = (key: string | number) => {
        const request = retire(key);
        request?.fiber.interruptUnsafe();
      };
      const fail = (cause: unknown) => {
        const first = failure === undefined;
        const reported = failure ?? rpcError(cause);
        failure = reported;
        // `onFailure` runs first now, not last. For a shared client it is `evict` (`Binding.ts`),
        // and `evict` is itself two-phase: it deletes the registry entry synchronously and only
        // *schedules* `Scope.close` as a microtask, so calling it here does not itself interrupt
        // anything yet. What running it first buys is a live registry for the two delivery loops
        // below: `write`, a few lines down, can resume a suspended caller inline, in this same
        // call stack, and a follow-up call that caller's own continuation makes must not find the
        // entry this failure is about to retire — it must reconnect (T2). Both loops still finish,
        // synchronously, answering every request typed, before the microtask queue can turn and
        // that scheduled `Scope.close` ever runs, so no interruption reaches a caller ahead of its
        // typed answer here. A test pins both halves of this order.
        if (first) onFailure?.();
        // A Limit (the inbox or a request's own response queue overflowing) is itself the reason
        // every in-flight request below is about to lose its connection; carried as `cause` on
        // their own synthetic failures rather than dropped, for a caller that reads that far (T7).
        // A Protocol refusal — a hostile answer part, a packet in the wrong codec — is kept the same
        // way: it is the diagnosis of why the connection went.
        const diagnosis =
          first &&
          cause instanceof SewedError &&
          (cause.code === "Limit" || cause.code === "Protocol")
            ? cause
            : undefined;
        // A bulk send that has not finished its last part was not delivered, so its handler
        // cannot have run, and it fails with that fact rather than with the general transport
        // failure, which says nothing about whether the owner saw the request. A send still
        // waiting on the gate is the same case and is registered the same way: it has sent
        // nothing at all.
        if (undelivered.size > 0) {
          const closed = rpcError(
            new SewedError({
              code: "Closed",
              message: "Connection closed before the bulk request was delivered",
              reason: "transport/closed-before-send",
              ...(diagnosis === undefined ? {} : { cause: diagnosis }),
            }),
          );
          for (const [key, waiting] of undelivered) {
            undelivered.delete(key);
            Deferred.doneUnsafe(waiting, Effect.fail(closed));
          }
        }
        // A bulk send still mid-transfer never reaches this loop: draining `undelivered` just
        // above already removed its `requests` entry too — `Deferred.doneUnsafe` resumes the
        // waiting send fiber inline, and its `tapError` calls `interrupt(key)` (`requests.delete`
        // plus `fiber.interruptUnsafe`) before this loop starts. There is nothing left here for an
        // `undelivered.has(key)` check to find (T3).
        //
        // Every request still here answers typed too: `Closed` if it never left (a send failing
        // on the stack right below is the one way `sent` can still be false here), `Unknown` if it
        // did and nothing has come back — a caller that retried on a bare interruption must not
        // retry this one. `write` is what actually resumes the caller, proven by marker trace
        // (`.artifacts/review-wave-5-final/`): with `openClient`'s post-`RpcClient.make` yield
        // (T1), the client's run fiber has always registered by the time any call can reach here,
        // so this delivery is never buffered and lost the way it could be before that fix. The
        // `Effect.try` rethrow at the `connection.send` call site below is a second voice on the
        // same conclusion when a send throws synchronously — this `write` already resolved the
        // entry by the time that rethrow's own failure could reach the caller a different way
        // (T4).
        for (const [key, request] of requests) {
          retire(key);
          request.fiber.interruptUnsafe();
          const exit = request.sent
            ? failExit(
                key,
                "Unknown",
                "Connection lost after the request was sent; whether it was handled is unknown",
                "transport/lost-after-send",
                diagnosis,
              )
            : failExit(
                key,
                "Closed",
                "Connection closed before the request was sent",
                "transport/closed-before-send",
                diagnosis,
              );
          Effect.runSyncWith(surrounding)(write(request.clientId, exit));
        }
        Queue.failCauseUnsafe(inbox, Cause.fail(reported));
        if (first) closeConnection();
      };
      /**
       * One slice of a bulk-answer `Exit` — the mirror of the owner's own `assemble`. Parts
       * accumulate against the operation's declared bound, acknowledged one at a time exactly as
       * a stream's chunks already are; the final part is decoded once, as the `Exit` it always
       * is, and delivered into the ordinary inbox, indistinguishable from there on from one that
       * arrived whole.
       *
       * A part for a request this client no longer tracks, or whose answer is already complete,
       * is dropped unacknowledged: a caller that interrupted its request leaves the owner one part
       * in flight, and that part must not end the connection other requests share. A part for an
       * operation that declared no bound is not a packet an honest owner produced; nor is an empty
       * part, a non-final part under the owner's own `minPartBytes` floor, an assembly that grows
       * past what the bound allows, or one that does not decode to its own identity.
       */
      const receiveAnswerPart = (part: AnswerPart): void => {
        const key = part.requestId;
        const request = requests.get(key);
        if (request === undefined || request.answer === "complete") return;
        const bound = answerBounds.get(request.tag);
        const size = part.bytes.byteLength;
        const assembly = request.answer ?? { parts: [], bytes: 0 };
        if (
          bound === undefined ||
          size === 0 ||
          // The floor bounds how many parts an assembly holds, as it does on the owner's side.
          (!part.final && size < minPartBytes) ||
          assembly.bytes + size > bound.maxBytes + maxMessageBytes
        ) {
          fail(new SewedError({ code: "Protocol", message: "Invalid bulk answer part" }));
          return;
        }
        const reservation =
          request.reservation === undefined
            ? pendingBytes.reserve(size)
            : request.reservation.grow(size);
        if (reservation === undefined) {
          fail(
            new SewedError({
              code: "Limit",
              message: "RPC pending answer byte budget is exhausted",
            }),
          );
          return;
        }
        request.reservation = reservation;
        assembly.parts.push(part.bytes);
        assembly.bytes += size;
        if (!part.final) {
          request.answer = assembly;
          connection.send(encode({ _tag: "Ack", requestId: part.requestId }, encoding));
          return;
        }
        request.answer = "complete";
        // The joined packet is the one copy decoded; its parts are released before the decode
        // allocates, so the two are not both held through it.
        const joined = concat(assembly.parts.splice(0));
        let whole: FromServerEncoded | PartAck | AnswerPart;
        try {
          whole = decodeServer(joined, encoding, bound.maxBytes + maxMessageBytes);
        } catch {
          // The parts named this request, so an assembly that does not decode is this request's
          // failure alone, whatever the packet itself claims to be.
          refuse(key, request);
          return;
        }
        if (whole._tag !== "Exit" || whole.requestId !== key) {
          fail(new SewedError({ code: "Protocol", message: "Invalid bulk answer" }));
          return;
        }
        if (!Queue.offerUnsafe(inbox, whole)) {
          fail(new SewedError({ code: "Limit", message: "RPC response queue is full" }));
        }
      };
      /**
       * Fails one request whose answer arrived but did not decode, and nothing else: `Protocol`,
       * `transport/undecodable-answer`, typed through the operation's error channel. Its record
       * goes, so anything more the owner sends for it is dropped as for any finished request, and
       * the owner is told to stop, as a caller's own interruption would tell it: a stream's
       * producer or a bulk answer's next part would otherwise wait for an acknowledgment that
       * never comes. An owner that had already finished the request ignores the interruption.
       */
      const refuse = (key: string | number, request: OpenRequest) => {
        retire(key);
        request.fiber.interruptUnsafe();
        Effect.runSyncWith(surrounding)(
          write(
            request.clientId,
            failExit(
              key,
              "Protocol",
              "The host's answer could not be decoded",
              "transport/undecodable-answer",
            ),
          ),
        );
        try {
          connection.send(encode({ _tag: "Interrupt", requestId: key }, encoding));
        } catch (error) {
          fail(error);
        }
      };
      unsubscribe = connection.subscribe((message) => {
        try {
          const decoded = decodeServer(message, encoding);
          if (decoded._tag === "PartAck") {
            const acknowledged = partAcks.get(decoded.requestId);
            if (acknowledged !== undefined) Deferred.doneUnsafe(acknowledged, Effect.void);
            return;
          }
          if (decoded._tag === "AnswerPart") {
            receiveAnswerPart(decoded);
            return;
          }
          if (!Queue.offerUnsafe(inbox, decoded)) {
            fail(new SewedError({ code: "Limit", message: "RPC response queue is full" }));
          }
        } catch (error) {
          // A packet that parsed and names a request this client is waiting on fails that
          // request. One that did not parse, or names nothing here, cannot be attributed.
          const key =
            error instanceof Undecodable && error.requestId !== undefined
              ? error.requestId
              : undefined;
          const request = key === undefined ? undefined : requests.get(key);
          if (key === undefined || request === undefined) fail(error);
          else refuse(key, request);
        }
      }, fail);
      if (connectionClosed) unsubscribe();
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          for (const key of requests.keys()) interrupt(key);
          closeConnection();
        }),
      );
      yield* Queue.take(inbox).pipe(
        Effect.flatMap((response) => {
          if (response._tag !== "Chunk" && response._tag !== "Exit")
            return Effect.forEach(recipients, (id) => write(id, response), { discard: true });
          return Effect.sync(() => {
            const request = requests.get(response.requestId);
            if (request && !Queue.offerUnsafe(request.queue, response))
              fail(
                new SewedError({ code: "Limit", message: "RPC request response queue is full" }),
              );
          });
        }),
        Effect.forever,
        Effect.catch((error) =>
          Effect.forEach(recipients, (id) => write(id, { _tag: "ClientProtocolError", error }), {
            discard: true,
          }),
        ),
        Effect.forkScoped,
      );
      // Built where it is needed rather than on every send: an ordinary request, acknowledgment
      // or ping pays nothing for a feature it does not use, and an `Error` subclass costs a
      // stack capture.
      const besideEnvelope = () =>
        rpcError(
          new SewedError({
            code: "Limit",
            message: "The request beside its bulk field exceeds the envelope limit",
          }),
        );
      // A request too large for one envelope leaves as slices of its own encoded packet, one in
      // flight, each answered by the owner's PartAck before the next is sent — the mirror of the
      // acknowledgment a split stream batch already waits for. A slice is sized by trying: half
      // the envelope limit, halved on a Limit, the way encodeChunks sizes a binary fragment.
      // `possiblyReceived` is called for the final slice alone, from inside the very same plain
      // callback `connection.send` itself runs in — not from this generator's own next step. A
      // `pair()` delivers synchronously, so an in-process owner may already have the whole request
      // assembled the instant `connection.send` returns; probed live, though, even a synchronous
      // `Effect.try`'s own result reaches a `yield*`-ing generator through the fiber's ordinary
      // resume path, which is not guaranteed to run before a connection loss triggered from
      // outside this fiber reaches `fail` first — only plain, uninterrupted JS in the same callback
      // is. `fail` reads two maps to answer a still-open request: `undelivered`, which claims
      // nothing has left yet, and a request's own `sent` flag. Both are updated here, inline,
      // instead of from a `.pipe(Effect.tap)` downstream of `Effect.raceFirst`, which a connection
      // lost in that same gap can reach first — answering `Closed` for a request whose bytes had
      // already, provably, left (reproduced live: a `tap.senders` probe over `pair()` showed the
      // final part on the wire before such a loss, yet the caller still read
      // `Closed`/`transport/closed-before-send` under the deferred-tap version this replaced).
      const fragment = (
        id: string | number,
        tag: string,
        wire: Uint8Array,
        possiblyReceived: () => void,
      ) =>
        Effect.gen(function* () {
          const key = id;
          const total = wire.byteLength;
          let offset = 0;
          let slice = Math.floor(maxMessageBytes / 2);
          while (offset < total) {
            const end = Math.min(offset + slice, total);
            const final = end >= total;
            const part = {
              _tag: "RequestPart",
              id,
              tag,
              bytes: wire.subarray(offset, end),
              final,
            };
            let frame: Wire;
            try {
              frame = encode(part, encoding);
            } catch (cause) {
              const narrowed =
                cause instanceof SewedError && cause.code === "Limit" ? narrower(slice) : undefined;
              if (narrowed !== undefined) {
                slice = narrowed;
                continue;
              }
              // Halving stops at the floor the owner enforces, so this client never sends a part
              // the owner would refuse for being too small. A part that does not fit an envelope
              // even at the floor cannot be sent at all, and saying so is better than sending one
              // that will close the connection.
              return yield* cause instanceof SewedError && cause.code === "Limit"
                ? rpcError(
                    new SewedError({
                      code: "Protocol",
                      message: `A bulk part of the smallest allowed ${minPartBytes} bytes does not fit one envelope`,
                    }),
                  )
                : rpcError(cause);
            }
            // The owner's acknowledgment can arrive while `send` is still on the stack, so the
            // wait is registered before the part leaves. The finalizer covers that whole window,
            // not just the wait: an interruption between registering and awaiting would
            // otherwise leave an entry behind for a request that is no longer being sent.
            const acknowledged = final ? undefined : Deferred.makeUnsafe<void, RpcClientError>();
            yield* Effect.gen(function* () {
              if (acknowledged !== undefined) partAcks.set(key, acknowledged);
              // `possiblyReceived` runs inside this same `try`, right after `connection.send`,
              // rather than as this generator's own next step: even a synchronous `Effect.try`
              // hands its result back to a `yield*` through the fiber's own resume path, which
              // (probed live) is not guaranteed to run before a synchronous connection loss
              // triggered from outside this fiber reaches `fail` — only plain, uninterrupted JS in
              // the same callback is.
              yield* Effect.try({
                try: () => {
                  connection.send(frame);
                  if (final) possiblyReceived();
                },
                catch: rpcError,
              }).pipe(Effect.tapError((error) => Effect.sync(() => fail(error))));
              offset = end;
              if (acknowledged !== undefined) yield* Deferred.await(acknowledged);
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  if (acknowledged !== undefined && partAcks.get(key) === acknowledged)
                    partAcks.delete(key);
                }),
              ),
            );
          }
        });
      return {
        send: (id: number, message: FromClientEncoded) =>
          Effect.gen(function* () {
            recipients.add(id);
            if (failure) return yield* failure;
            // A declared operation's bulk field is measured exactly, before anything is sent, so
            // an oversized attachment costs the caller no wire and the owner no buffer. The rest
            // of that request keeps one envelope's allowance on top; every other packet keeps the
            // envelope limit alone.
            const bound = message._tag === "Request" ? bounds.get(message.tag) : undefined;
            const bulk =
              message._tag === "Request" && bound !== undefined
                ? bulkField(message.payload, bound.field)
                : undefined;
            if (bound !== undefined) {
              if (bulk === undefined) {
                return yield* rpcError(
                  new SewedError({
                    code: "Protocol",
                    message: "A bulk field is Binary.Bytes in a Binary.protocol",
                  }),
                );
              }
              if (bulk.byteLength > bound.maxBytes) {
                return yield* rpcError(
                  new SewedError({
                    code: "Limit",
                    message: `${bound.field} exceeds the operation's bulk bound of ${bound.maxBytes} bytes`,
                  }),
                );
              }
            }
            const wire = yield* Effect.try({
              try: () =>
                encode(
                  message,
                  encoding,
                  bound === undefined ? maxMessageBytes : bound.maxBytes + maxMessageBytes,
                ),
              catch: (cause) =>
                bound !== undefined && cause instanceof SewedError && cause.code === "Limit"
                  ? besideEnvelope()
                  : rpcError(cause),
            });
            // Only the declared field is allowed to be bulk. Everything else in the request —
            // the other fields, the headers, the envelope — keeps the limit it would have had
            // without the declaration, so a bound on an attachment does not lift the limit on a
            // command string beside it.
            if (bulk !== undefined && sizeOf(wire) - bulk.byteLength > maxMessageBytes) {
              return yield* besideEnvelope();
            }
            // The packet a bulk request leaves as slices of, or undefined for a request sent
            // whole. Both answers are settled before the request is registered below, so the
            // refusal that follows leaves no entry and no forked fiber behind.
            //
            // A bulk operation belongs to a Binary.protocol, refused anywhere else where the slot
            // is declared, so that packet is always MessagePack bytes. Text here means a protocol
            // reached this transport without that check; saying so is better than sending a
            // packet no owner will accept.
            let sliced:
              | { readonly id: string | number; readonly tag: string; readonly packet: Uint8Array }
              | undefined;
            if (message._tag === "Request" && bound !== undefined) {
              if (typeof wire === "string") {
                return yield* rpcError(
                  new SewedError({
                    code: "Protocol",
                    message: "A bulk operation needs a Binary.protocol",
                  }),
                );
              }
              // A request that still fits one envelope is sent whole.
              if (wire.byteLength > maxMessageBytes)
                sliced = { id: message.id, tag: message.tag, packet: wire };
            }
            if (message._tag === "Request") {
              const key = message.id;
              if (requests.size >= maxRequestsPerConnection || requests.has(key))
                return yield* rpcError(
                  new SewedError({
                    code: "Limit",
                    message: "RPC client has too many requests or a duplicate identity",
                  }),
                );
              // Acknowledgments bound each stream independently. Its final Exit stays ordered
              // behind its chunks without delaying a different request's response.
              const queue = yield* Queue.bounded<FromServerEncoded>(2);
              const fiber = yield* Effect.gen(function* () {
                while (true) {
                  const response = yield* Queue.take(queue);
                  yield* write(id, response);
                  if (response._tag === "Exit") return;
                }
              }).pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    if (requests.get(key)?.queue === queue) retire(key);
                  }),
                ),
                Effect.forkIn(scope),
              );
              requests.set(key, {
                queue,
                fiber,
                clientId: id,
                tag: message.tag,
                sent: false,
                answer: undefined,
                reservation: undefined,
              });
            } else if (message._tag === "Interrupt") {
              // A bulk request abandoned between parts stops where it is with no help from here:
              // RpcClient interrupts the sending fiber before it asks for this Interrupt, and
              // that interruption unwinds the part loop and releases the gate. The owner drops
              // its assembly when this Interrupt reaches it, which it does before the next
              // request's first part because the loop has already stopped.
              interrupt(message.requestId);
            }
            if (sliced !== undefined) {
              const key = sliced.id;
              const closed = Deferred.makeUnsafe<never, RpcClientError>();
              // Registered before the permit is taken, so the span a lost connection has to
              // answer for starts at the gate and not at the first part.
              undelivered.set(key, closed);
              // Handed to `fragment` and called inline for the final part alone — see its own
              // doc comment for why inline, there, is load-bearing. `fail` checks `undelivered`
              // before `sent`, so both are cleared here together: leaving `undelivered`'s own
              // removal to the `Effect.ensuring` below (which still runs, for every other way this
              // send can end) would answer `Closed` from that map regardless of `sent`.
              const possiblyReceived = () => {
                if (undelivered.get(key) === closed) undelivered.delete(key);
                const entry = requests.get(key);
                if (entry !== undefined) entry.sent = true;
              };
              return yield* Semaphore.withPermits(
                gate,
                1,
              )(fragment(sliced.id, sliced.tag, sliced.packet, possiblyReceived)).pipe(
                Effect.raceFirst(Deferred.await(closed)),
                // A part that cannot be encoded fails this send after the request was registered
                // above. Without dropping that registration the entry and its forked fiber would
                // sit on the connection until it ended.
                Effect.tapError(() => Effect.sync(() => interrupt(key))),
                Effect.ensuring(
                  Effect.sync(() => {
                    if (undelivered.get(key) === closed) undelivered.delete(key);
                  }),
                ),
              );
            }
            yield* Effect.try({
              try: () => connection.send(wire),
              // The one place a `Request` genuinely never left: `connection.send` itself threw.
              // `fail`, called from the `tapError` below, delivers the caller's real answer here:
              // its own per-request loop finds this request's entry still `sent: false` and
              // resolves it, through `write`, before this `catch` even returns to its own caller —
              // proven by marker trace (`.artifacts/review-wave-5-final/`), and guaranteed rather
              // than raced once `openClient` yields after `RpcClient.make` (T1), so the run fiber
              // that `write` resumes has always registered by now. The `SewedError` built right
              // here, thrown back out of this `try`, is a second voice on the same conclusion —
              // reached only if that `write` had not already resolved the entry, which is not the
              // proven case on this path (T4).
              catch: (cause) =>
                message._tag === "Request"
                  ? rpcError(
                      new SewedError({
                        code: "Closed",
                        message: "Connection closed before the request was sent",
                        reason: "transport/closed-before-send",
                        cause,
                      }),
                    )
                  : rpcError(cause),
            }).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (message._tag !== "Request") return;
                  const entry = requests.get(message.id);
                  if (entry !== undefined) entry.sent = true;
                }),
              ),
              Effect.tapError((error) => Effect.sync(() => fail(error))),
            );
          }),
        supportsAck: true,
        supportsTransferables: false,
        codecFor: encoding === "binary" ? BinaryWire.codecFor : RpcSerialization.json.codecFor,
      };
    }),
  );
