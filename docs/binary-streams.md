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
limit fails; use a stream for bulk data. Each connection has a bounded 128-message
inbox. The client admits at most 64 outstanding requests, each with a two-message
response queue. This keeps each stream's chunks and terminal response ordered
while allowing other calls, including resource release, to proceed when a
consumer stalls. These are Sewed queue bounds; they do not measure Electron's
internal queues or total process memory. Slow consumers propagate RPC stream
backpressure. Cancelling a consumer interrupts its server stream and runs its
finalizers.

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
memory API or implicit upload buffering.
