import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Capability, SewedError } from "sewed";
import * as Testing from "sewed/testing";

const Ingest = Rpc.make("ingest", {
  payload: { command: Schema.String, content: Binary.Bytes },
  success: Schema.Struct({ id: Schema.String }),
  error: SewedError,
});

// A bulk declaration is an annotation: the operation's type is unchanged, and it composes into
// a binary protocol like any other operation.
const protocol = Binary.protocol(
  RpcGroup.make(Binary.bulk(Ingest, { field: "content", maxBytes: 12 * 1024 * 1024 })),
);
const Attachments = Capability.define("attachments", protocol);
const same: typeof Ingest = Binary.bulk(Ingest, { field: "content", maxBytes: 1024 });
void same;

// A bulk-answer declaration is an annotation too: the operation's type is unchanged.
const sameAnswer: typeof Ingest = Binary.bulkAnswer(Ingest, { maxBytes: 1024 });
void sameAnswer;

// The handler is an ordinary function of its payload, and the same value serves both a native
// Layer and a real wire in a test.
const handlers = (implement: typeof protocol.toLayer) =>
  implement({ ingest: ({ content }) => Effect.succeed({ id: String(content.byteLength) }) });
const layer: Layer.Layer<typeof Attachments, never, never> = Capability.fromHandlers(
  Attachments,
  handlers,
);
void layer;

// The client call is ordinary too: nothing about the bound reaches the caller's types.
const call: Effect.Effect<{ readonly id: string }, SewedError> = Effect.gen(function* () {
  const attachments = yield* Attachments;
  return yield* attachments.ingest({ command: "add", content: new Uint8Array(3) });
}).pipe(Effect.provide(Testing.client(Attachments, handlers)));
void call;

// A payload with two byte fields may declare either one; the declaration names which, so there is
// nothing for the transport to guess. The field not named keeps the ordinary envelope limit.
const Pair = Rpc.make("pair", {
  payload: { original: Binary.Bytes, thumbnail: Binary.Bytes },
  success: Schema.Number,
});
const byOriginal: typeof Pair = Binary.bulk(Pair, { field: "original", maxBytes: 1024 });
const byThumbnail: typeof Pair = Binary.bulk(Pair, { field: "thumbnail", maxBytes: 1024 });
void byOriginal;
void byThumbnail;

// An optional byte field is not one of them: `BytesField` admits a field whose type is exactly
// `Uint8Array`, and an optional one is `Uint8Array | undefined`, which the transport could not
// measure on every call.
const Maybe = Rpc.make("maybe", {
  payload: { command: Schema.String, content: Schema.optional(Binary.Bytes) },
  success: Schema.Number,
});
// @ts-expect-error a bulk field carries bytes on every call, so an optional one cannot be named.
Binary.bulk(Maybe, { field: "content", maxBytes: 1024 });

// @ts-expect-error a bound is a byte count.
Binary.bulk(Ingest, { field: "content", maxBytes: "12MiB" });
// @ts-expect-error bulk declares an operation, not a group.
Binary.bulk(RpcGroup.make(Ingest), { field: "content", maxBytes: 1024 });
// @ts-expect-error a bulk field is one of the payload's byte fields.
Binary.bulk(Ingest, { field: "command", maxBytes: 1024 });
// @ts-expect-error a bulk field is one the payload has.
Binary.bulk(Ingest, { field: "contents", maxBytes: 1024 });
