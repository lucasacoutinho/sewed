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

A byte field is recognized by what it is rather than by which realm made it, and
is re-viewed into the packer's realm on its way to the wire. That matters wherever
a test environment installs its own globals over Node's: under vitest's `jsdom`,
`new TextEncoder().encode(text)` answers with a `Uint8Array` jsdom's realm made,
which `instanceof Uint8Array` reports as false and which MessagePack — whose own
dispatch is `instanceof` too — would write as a map of indices rather than bytes,
silently and at four times the size. `Binary.Bytes` accepts it, hands the same
memory on as a view this realm made, and the field crosses as binary, so a web
test suite driving a real renderer module against an in-process host encodes and
decodes exactly as that renderer does. A Node `Buffer` is bytes on the same terms.
An object carrying a `Symbol.toStringTag` of `Uint8Array`, and a `Proxy` over real
bytes, are not: the check reads the internal slot, which neither of them has. Only
a field declared `Binary.Bytes` is re-viewed; bytes carried inside an untyped
field, such as `Schema.Unknown`, reach the packer as they are.

Every native envelope is limited to 256 KiB. Large RPC batches are split and
acknowledged before the next fragment is sent. A single value that exceeds the
limit fails, unless it is the one payload field its operation declared bulk; a
stream carries bulk data from the owner, a bulk request carries it to the owner.
Each connection has a bounded 128-message
inbox. The client admits at most 64 outstanding requests, each with a two-message
response queue. This keeps each stream's chunks and terminal response ordered
while allowing other calls, including resource release, to proceed when a
consumer stalls. These are Sewed queue bounds; they do not measure Electron's
internal queues or total process memory. Slow consumers propagate RPC stream
backpressure. Cancelling a consumer interrupts its server stream and runs its
finalizers.

## Bulk requests

`Binary.bulk(rpc, { field, maxBytes })` declares that one payload field may exceed
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
        { field: "content", maxBytes: 12 * 1024 * 1024 },
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

`field` is typed to the payload's byte fields, so naming a field that carries
something else, or one the payload does not have, does not compile. `maxBytes`
bounds that field exactly: a 12 MiB attachment declares 12 MiB and passes, and one
byte more does not. Everything beside it — the other fields, the headers, the
envelope — keeps the ordinary 256 KiB it would have had without the declaration, so
a bound on an attachment does not lift the limit on a command string next to it.

A bulk operation belongs to a `Binary.protocol`, where `Binary.Bytes` reaches the
wire as the bytes the transport measures and slices. Declaring one in a JSON
protocol fails `Protocol` at `Binding.slot` or `Capability.define`, when the slot is
defined rather than when a document first sends an attachment. Inside a binary
protocol the declaration checks only that the named field carries bytes, so a field
typed `Schema.Uint8Array` rather than `Binary.Bytes` defines its slot and then fails
every call with `Protocol: A bulk field is Binary.Bytes in a Binary.protocol`,
because the codec did not produce the bytes the transport measures.

On the wire, the client encodes the request once and sends it as slices of that
encoded packet. One slice is in flight at a time: each waits for the owner's
acknowledgment before the next is sent, the same discipline a split stream batch
already follows in the other direction. The owner concatenates the slices, decodes
the whole request, and checks the assembled field against the bound before the
handler runs, so the handler receives its payload and nothing else. Relays validate
each slice as the envelope it is and forward it; nothing between the two ends
reassembles.

The failures are distinct. A field larger than the bound fails `Limit` locally
naming the field, before anything is sent, and the owner never sees it; a request
whose other fields pass an envelope fails `Limit` the same way, saying so. A
connection lost before the request was delivered — while its parts are going out, or
while it is still queued behind another transfer with nothing of its own sent —
fails `Closed` with `Connection closed before the bulk request was delivered` and
`reason: "transport/closed-before-send"`, which is the one case where the handler
certainly did not run. After the final part the request gets whatever an ordinary
in-flight request gets: a connection lost with the request already sent and no
answer back fails `Unknown` with `reason: "transport/lost-after-send"` — the handler
may or may not have run, and nothing retries a request in that state, because
retrying could run it twice. A peer that sends a part for an undeclared operation, a
second assembly, an empty part, a non-final part smaller than 16 KiB, or a request
whose assembled field is over the bound loses its connection, the way an invalid
packet does. An assembled request that does not decode fails only its own call,
with `Protocol` and `reason: "transport/undecodable-request"`: the handler did not
run, and the connection carries on.

One bulk request crosses a connection at a time, so an owner holds at most one
assembly per connection. While the parts arrive it holds the bound plus one
envelope, in at most a few hundred parts: a non-final part is at least 16 KiB, so
the count an assembly retains is bounded and not only its bytes, and a peer cannot
spend an owner's memory on empty parts. [Memory for a bulk message](#memory-for-a-bulk-message)
gives the peak on each side. The decoded field is a view of the joined packet, not a
further copy. Ordinary requests are not held up between parts. A bound is a positive integer of at
most 64 MiB, refused at `Binary.bulk` with `Protocol`. Interrupting the caller drops
the assembly.

The bound is a transport fact. `Capability.fromHandlers` and the memory Layers
dispatch in process, with no wire and no bound, so the same operation is bounded
over a binding and unbounded in the runtime that owns the handlers.

## Bulk answers

`Binary.bulkAnswer(rpc, { maxBytes })` declares that a unary operation's answer,
not just its request, may exceed the envelope limit — the mirror of `Binary.bulk`
in the other direction. The declaration is an annotation: the operation's type is
unchanged.

```ts
const Search = Capability.define(
  "search",
  Binary.protocol(
    RpcGroup.make(
      Binary.bulkAnswer(
        Rpc.make("query", {
          payload: { text: Schema.String },
          success: Schema.Array(Result),
          error: SewedError,
        }),
        { maxBytes: 4 * 1024 * 1024 },
      ),
    ),
  ),
);
```

The owner encodes its `Exit` once. An answer that still fits one envelope is sent
whole, exactly like an ordinary call, so declaring the bound costs nothing when
the answer happens to be small. A larger one leaves as acknowledged `AnswerPart`
frames, one part in flight per answer, each waited on before the next, the same
discipline a bulk request already follows crossing the other way. The client
assembles them, up to the declared bound plus one envelope, before decoding and
completing the request. Concurrent bulk answers on one connection interleave,
each with its own part in flight, and the client holds one assembly per answer
in progress, so its memory is the bound times the answers it has asked for at
once. Ordinary calls on the same connection are not delayed by a transfer in
progress; only a bulk answer holds a wait of its own.

A caller that interrupts a bulk-answer call mid-transfer ends only that call.
The owner sends nothing after the part already in flight, the client drops that
part without acknowledging it, and other requests on the connection continue.
An owner whose scope closes mid-answer sends no further part, and its caller
gets `Unknown` with `reason: "transport/lost-after-send"`.

An answer over `maxBytes` is the same failure an answer over the plain envelope
is: typed `Unknown` with `reason: "transport/answer-over-limit"`, through the
operation's own error channel, never a defect — the handler ran, and nothing
retries. A connection lost partway through a multi-part answer gets whatever an
ordinary in-flight request gets once its bytes have left: `Unknown` with
`reason: "transport/lost-after-send"`. The client refuses an answer part that no
honest owner sends — for an operation with no declared bound, empty, a non-final
part under the 16 KiB floor the owner applies to request parts, or an assembly
past its allowance — by closing the connection, and each request still open on
it fails `Unknown` with that `Protocol` refusal kept as its `cause`. An assembled
answer that does not decode fails only its own call, with `Protocol` and
`reason: "transport/undecodable-answer"`; the connection carries on.

A bulk-answer operation belongs to a `Binary.protocol`, refused with `Protocol`
at `Binding.slot` or `Capability.define`, exactly where `Binary.bulk` is refused
and for the same reason. A stream-shaped operation already divides its own
values between messages and needs no second mechanism for the same problem, so
`Binary.bulkAnswer` refuses one at the declaration, before any group or protocol
is built around it. The bound is a positive integer of at most 64 MiB, and, like
`Binary.bulk`'s, a transport fact: an in-process call has no wire and no bound.

## Memory for a bulk message

A bulk message of N bytes peaks at up to about 3×N on the sender and 4×N on the receiver,
for a moment (the table below has the measured range), and neither side keeps more than an ordinary message's memory after it.
The sender holds the encoded packet while its parts leave. The receiver holds the
parts as they arrive, the one packet joined from them, and the re-encoding it checks
that packet against; the parts are released before the check. A decoded `Binary.Bytes`
value is a view of the joined packet, so it keeps N for as long as the application
keeps the value. The application's own value is not counted: a handler's answer
before it is encoded, or a caller's bytes before they are sent.

Measured in Node 26 with the client and the owner in two processes, peak resident
memory over the baseline, as a multiple of N:

| Message             | Sender | Receiver |
| ------------------- | ------ | -------- |
| 12 MiB bulk request | 3.0×   | 3.4×     |
| 12 MiB bulk answer  | 2.1×   | 3.9×     |
| 64 MiB bulk request | 1.3×   | 3.1×     |
| 64 MiB bulk answer  | 1.3×   | 3.2×     |

The channel between the processes accounts for up to about 1×N of these at 12 MiB,
and 0.5×N at 64 MiB: each part is a message it copies. An Electron `MessagePort` copies
each part too. Size `maxBytes` so that four times it fits the receiving process.

A message larger than 1 MiB is encoded into a buffer of its own, which the packet
keeps and no later message reuses. The encoder's shared buffer, which serves every
other message in the process, grows for a message under 1 MiB and is not released after it:
about 4 MiB after a message just under that size (msgpackr grows its buffer fourfold).

A packet that is valid MessagePack but not the one encoding of its value — a value holding an
own `__proto__` key is the ordinary case — is decoded a second time, more slowly: about 2.8×
the ordinary decode for a packet that is then refused, and about 4.7× for one that is accepted
(a 12 MiB packet: 36 ms ordinarily, 98 or 172 ms on that path). A peer can choose that path for
every message it sends, bounded by its own send rate.

With diagnostics enabled, the server samples streamed responses at the encoded
send boundary. `TransferProgress` reports cumulative encoded frame counts and
wire byte counts for an owner, client, and request. The first frame, samples
separated by at least 100 ms, and the terminal flush are retained as bounded
metadata; application payloads are never decoded or stored. Request end records
provide the final success, failure, cancellation, or disconnection outcome; a
bulk answer's request ends after its last part leaves, as interrupted when its
caller gives up, or as disconnected when the connection goes mid-answer. The
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
validate complete packets before forwarding them. Any value `JSON.parse` can produce
arrives as it was sent, including an object with a `"__proto__"` key: the key
arrives as an own, enumerable property, exactly as `JSON.parse` makes it, and no
prototype is set. An object key must be a string; a MessagePack map keyed by
anything else is no JSON value, and a packet carrying one is refused. This avoids expanding bytes
into JSON numbers. It does not promise zero-copy transfer: encoding, validation,
contextBridge and native structured cloning can copy bytes. There is no shared
memory API and no implicit upload buffering; an operation declared with
`Binary.bulk` is the explicit one, and it buffers only its declared field, only up
to the bound that field names.
