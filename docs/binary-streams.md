# Binary streams

Use `Binary.protocol(group)` for a binding that carries bytes, and `Binary.Bytes`
for its byte fields. The protocol remains an ordinary Effect `RpcGroup`: payload
validation, declared errors, middleware, tracing, cancellation and explicit owner
selection still apply.

```ts
const FileMethods = Binary.protocol(
  RpcGroup.make(Rpc.make("read", { success: Binary.Bytes, stream: true })),
);
```

Return `Binary.chunks(source)` from a byte stream handler. It splits each input
into views of at most 64 KiB without collecting the source. Keep each input buffer
unchanged until it has been consumed. The helper preserves the source's error and
service requirements. `Binary.Bytes` is for binary protocols; ordinary
`Schema.Uint8Array` keeps Effect's normal JSON representation.

Every native envelope is limited to 256 KiB. Large RPC batches are split and
acknowledged before the next fragment is sent. A single value that exceeds the
limit fails unless its operation is declared bulk; a stream carries bulk data from
the owner, a bulk request carries it to the owner. Each connection has a bounded 128-message
inbox. The client admits at most 64 outstanding requests, each with a two-message
response queue. This keeps each stream's chunks and terminal response ordered
while allowing other calls, including resource release, to proceed when a
consumer stalls. These are Sewed queue bounds; they do not measure Electron's
internal queues or total process memory. Slow consumers propagate RPC stream
backpressure. Cancelling a consumer interrupts its server stream and runs its
finalizers.

## Bulk requests

`Binary.bulk(rpc, { maxBytes })` declares that one operation's request may exceed
the envelope limit. The declaration is an annotation: the operation's type does not
change, it composes into a group like any other, and callers and handlers are
written as they would be for a small request.

```ts
const Attachments = Capability.define(
  "attachments",
  Binary.protocol(
    RpcGroup.make(
      Binary.bulk(
        Rpc.make("ingest", {
          payload: { command: Schema.String, content: Binary.Bytes },
          success: Schema.Struct({ id: Schema.String }),
          error: SewedError,
        }),
        { maxBytes: 12 * 1024 * 1024 + 64 * 1024 },
      ),
    ),
  ),
);

// the document
const upload = Effect.gen(function* () {
  const attachments = yield* Attachments;
  return yield* attachments.ingest({ command, content });
});

// main: an ordinary handler of its payload
Capability.fromHandlers(Attachments, (implement) =>
  implement({ ingest: ({ command, content }) => post(command, content) }),
);
```

The bound covers the whole encoded request, the payload and the envelope's own
bytes together, so an operation that accepts a 12 MiB attachment declares a little
more than 12 MiB.

On the wire, the client encodes the request once and sends it as slices of that
encoded packet. One slice is in flight at a time: each waits for the owner's
acknowledgment before the next is sent, the same discipline a split stream batch
already follows in the other direction. The owner concatenates the slices, stops at
the declared bound, and decodes the whole request before the handler runs, so the
handler receives its assembled payload and nothing else. Relays validate each slice
as the envelope it is and forward it; nothing between the two ends reassembles.

The failures are distinct. A request larger than the bound fails `Limit` locally,
before anything is sent, and the owner never sees it. A connection lost while parts
are still going out fails `Closed` with `Connection closed before the bulk request
was delivered`, which is the one case where the handler certainly did not run; a
connection lost after the final part keeps the ordinary `Closed`, and the handler
may have run. A peer that sends a part for an undeclared operation, a part past the
bound, or a second assembly loses its connection, the way an invalid packet does.

One bulk request crosses a connection at a time, so an owner holds at most one
assembly per connection and the memory a connection costs is bounded by the largest
bound its protocol declares. Ordinary requests are not held up between parts. A
bound is a positive integer of at most 64 MiB, refused at `Binary.bulk` with
`Protocol`. Interrupting the caller drops the assembly.

The bound is a transport fact. `Capability.fromHandlers` and the memory Layers
dispatch in process, with no wire and no bound, so the same operation is bounded
over a binding and unbounded in the runtime that owns the handlers.

With diagnostics enabled, the server samples streamed responses at the encoded
send boundary. `TransferProgress` reports cumulative encoded frame counts and
wire byte counts for an owner, client, and request. The first frame, samples
separated by at least 100 ms, and the terminal flush are retained as bounded
metadata; application payloads are never decoded or stored. Request end records
provide the final success, failure, cancellation, or disconnection outcome. The
server's 128-client and 64-in-flight-request admission bounds cap the tracker
at 8,192 active streams, so the tracker has no separate eviction path while
those transport limits hold.

Renderer connections use a private MessagePort acquired through the document's
validated preload handshake. The port stays in preload. Main still checks the
document, frame, session and binding before opening it. Workers and utility
processes use their existing private ports, including dependency relays. A JSON
binding rejects binary frames, and a binary binding rejects JSON frames.

The wire format uses Effect's pinned MessagePack implementation with independent
records and structural RPC codecs. Packets own their encoded bytes and relays
validate complete packets before forwarding them. This avoids expanding bytes
into JSON numbers. It does not promise zero-copy transfer: encoding, validation,
contextBridge and native structured cloning can copy bytes. There is no shared
memory API and no implicit upload buffering; an operation declared with
`Binary.bulk` is the explicit one, and it buffers only up to the bound it names.
