# Remote resources

Use `Remote` when a caller needs to open, use, and release a resource owned by another runtime. The example below exposes a reader through an ordinary `RpcGroup`.

The definition describes the acquisition payload, methods, and acquisition errors. Sewed acquires the resource when called and keeps its middleware and service requirements intact.

```ts
const ReaderMethods = RpcGroup.make(
  Rpc.make("read", {
    payload: { size: Schema.Finite },
    success: Schema.String,
  }),
);

const Reader = Remote.make({
  payload: Schema.Struct({ path: Schema.String }),
  protocol: ReaderMethods,
});

const Readers = Binding.slot("readers", Reader.protocol);
```

The owner supplies a handler layer factory. Sewed builds one layer for every
successful acquisition, so resources and their dependencies have the lease's
scope and handler context.

```ts
const readers = Remote.layer(Reader, ({ path }) =>
  ReaderMethods.toLayer(
    Effect.gen(function* () {
      const file = yield* openFile(path);
      return {
        read: ({ size }) => file.read(size),
      };
    }),
  ),
);
```

The caller acquires a handle inside a scope. The handle exposes the declared
RPC client and an idempotent `release` effect. The lease token and the
underlying binding client remain private.

```ts
yield *
  Effect.scoped(
    Effect.gen(function* () {
      const reader = yield* Remote.acquire(Reader, Readers, { path });
      const text = yield* reader.client.read({ size: 128 });
      yield* reader.release;
      return text;
    }),
  );
```

Each acquisition uses a dedicated binding connection. The owner authenticates
resource calls with both that connection's RPC client id and a private lease
header. Missing, stale, or cross-client lease identities fail with
`SewedError`. Resource calls are interrupted before the resource scope closes;
explicit release waits for those finalizers before closing the dedicated
client. Caller scope cleanup attempts the same release before the connection
closes. Disconnecting a client cancels its acquisition stream and finalizes the
resource while the owner remains alive. Owner loss fails calls without
recreating the resource. Forced process termination cannot run that process's
application finalizers. Connection loss surfaces as `SewedError` code `Closed`.

The original RPC method schemas and middleware remain in force. Middleware
services are resolved from the per-resource handler layer. Schema codecs run
at the outer RPC boundary, so `Remote.layer` retains those services as outer
requirements; the resource factory supplies handlers and middleware. RPC handlers continue to receive
the decoded payload and the RPC metadata object as their second argument.

The internal acquisition stream and release procedure are forked with `Rpc.wrap`
so a lease that waits for release does not consume a server concurrency slot.
Each lease keeps two of its connection's 64 request slots for acquisition and
release, admitting at most 62 public method operations. A 63rd operation fails
with `SewedError` code `Limit` without waiting or closing the connection. Unary
operations hold a slot until completion; stream operations hold it until their
stream scope closes. The acquisition and release procedures are reserved by
`Remote`; declaring either reserved tag in the public group is rejected.

Each owner admits at most 256 pending or acquired resources, with a maximum of
64 per connection. Pending acquisitions reserve capacity before their layers
start building. Cancellation or failed acquisition returns that reservation.

When diagnostics are enabled, the owner reports each lease as `ResourceChanged`
with a random `resourceId` and `acquiring`, `ready`, or `releasing` state. The
ID is diagnostic metadata and is separate from the private lease token and
header. A scope closure produces an observed `ResourceClosed` record with only
its outcome and reason. Owner closure also
clears live resource records, including when process termination prevents the
resource finalizer from running.
