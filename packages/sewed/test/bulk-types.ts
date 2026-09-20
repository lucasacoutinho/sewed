import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
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

// The handler is an ordinary function of its payload.
const handlers = Capability.fromHandlers(Attachments, (implement) =>
  implement({ ingest: ({ content }) => Effect.succeed({ id: String(content.byteLength) }) }),
);
const layer: Layer.Layer<typeof Attachments, never, never> = handlers;
void layer;

// The client call is ordinary too: nothing about the bound reaches the caller's types.
const call: Effect.Effect<{ readonly id: string }, SewedError> = Effect.gen(function* () {
  const attachments = yield* Attachments;
  return yield* attachments.ingest({ command: "add", content: new Uint8Array(3) });
}).pipe(
  Effect.provide(
    Capability.client(Attachments).pipe(
      Layer.provide(
        Testing.layer(
          Attachments.slot,
          protocol.toLayer({
            ingest: ({ content }) => Effect.succeed({ id: String(content.byteLength) }),
          }),
        ),
      ),
    ),
  ),
);
void call;

// @ts-expect-error a bound is a byte count.
Binary.bulk(Ingest, { field: "content", maxBytes: "12MiB" });
// @ts-expect-error bulk declares an operation, not a group.
Binary.bulk(RpcGroup.make(Ingest), { field: "content", maxBytes: 1024 });
// @ts-expect-error a bulk field is one of the payload's byte fields.
Binary.bulk(Ingest, { field: "command", maxBytes: 1024 });
// @ts-expect-error a bulk field is one the payload has.
Binary.bulk(Ingest, { field: "contents", maxBytes: 1024 });
