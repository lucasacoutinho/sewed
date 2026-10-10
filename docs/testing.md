# Testing through public APIs

Exercise your contracts and handlers in Node with `sewed/testing`. Tests run the real Sewed schemas and JSON RPC path, so you can check payloads, answers, and cleanup without launching Electron.

```ts
import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding } from "sewed";
import * as Testing from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Finite }, success: Schema.Finite }),
);
const Calculator = Binding.slot("calculator", Protocol);
const handlers = Protocol.toLayer({
  double: ({ value }) => Effect.succeed(value * 2),
});

const result = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const calculator = yield* Calculator();
      return yield* calculator.double({ value: 21 });
    }).pipe(Effect.provide(Testing.layer(Calculator, handlers))),
  ),
);
```

`Testing.layer(slot, handlers)` owns an in-process host and its binding environment. The surrounding scope closes its connections and handler layer. Typed failures are serialized and decoded by the protocol; stream interruption reaches handler finalizers. Supply application services with ordinary Layers. Unprovided handler, schema, middleware, and execution requirements remain visible in types. The Layer carries the real transport, so a request on an operation declared with [`Binary.bulk`](binary-streams.md#bulk-requests) is framed, acknowledged and assembled here exactly as it is over a binding, at its full declared size. A suite that runs its renderer modules under vitest's `jsdom` environment, where `TextEncoder` answers with another realm's `Uint8Array`, still encodes and decodes byte fields the way the renderer does: [bytes are recognized by what they are](binary-streams.md).

## Capabilities in tests

A capability defined with `Capability.define` serves the same way, in one call: `Testing.client(capability, handlers)` builds the capability's client Layer over an in-process host of `handlers`, over the real schema and transport.

```ts
import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Capability } from "sewed";
import * as Testing from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Finite }, success: Schema.Finite }),
);
const Calculator = Capability.define("calculator", Protocol);
const handlers = Protocol.toLayer({ double: ({ value }) => Effect.succeed(value * 2) });

const result = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const calculator = yield* Calculator;
      return yield* calculator.double({ value: 21 });
    }).pipe(Effect.provide(Testing.client(Calculator, handlers))),
  ),
);
```

`handlers` is a `Capability.Handlers<Rpcs>`: a Layer of the protocol's handlers, or a function of `implement` (the protocol's `toLayer`) returning one. It names the value `Capability.fromHandlers`, `Testing.client`, and `Testing.layer` all take, so a function can take a host as a parameter. `Testing.layer(slot, handlers)`, above, is the same composition for a `Binding.slot` with no capability around it; `Testing.client(capability, handlers)` is `Capability.client(capability).pipe(Layer.provide(Testing.layer(capability.slot, handlers)))` in one call.

Use the third argument to `Testing.client` or `Testing.layer`, `{ onConnect, tamper }`, to observe connections or test malformed messages. `onConnect` runs when each connection opens. The `tamper` option is available only through `sewed/testing`.

`tamper: { answer, request }` accepts predicates over an operation's tag:

- `answer` corrupts a selected operation's answer on its way to the client: its `Exit`, first stream value, or first bulk-answer part. The handler runs, and the call fails with `Protocol` and `reason: "transport/undecodable-answer"`.
- `request` corrupts a selected operation's request, or its first bulk-request part, on its way to the owner. The handler does not run, and the call fails with `Protocol` and `reason: "transport/undecodable-request"`.

The corrupted message retains its request identity. Only that call fails; the connection and its other calls remain usable. Binary messages are rewritten into a noncanonical encoding that parses to the same value. JSON messages retain their tag and request ID while the rest of the envelope is removed.

Include `SewedError` in the operation's `error` schema to receive the typed [transport failure](transport.md). Otherwise, decoding the failure reports `Protocol` with a message such as `<tag>: Expected never` and no transport reason.

A predicate that returns `true` once makes one message undecodable:

```ts
let corrupted = false;
const once = (tag: string) => tag === "double" && !corrupted && (corrupted = true);
Testing.client(Calculator, handlers, { tamper: { answer: once } });
```

A capability's `memory` Layer runs the surface's own policy with no Electron and records every call. `Testing.Shell`, `Testing.NativeTheme`, `Testing.PowerMonitor`, `Testing.Clipboard`, `Testing.Notification`, and `Testing.Cookies` each export `memory(options)`. The Layer provides both the capability and a `Testing.Recorder`, whose `calls` is a snapshot of `{ tag, payload }` in call order.

```ts
const calls = await Effect.runPromise(
  Effect.gen(function* () {
    const shell = yield* Shell.capability;
    yield* Effect.exit(shell.openExternal({ url: "https://denied.example/" }));
    return yield* (yield* Testing.Recorder).calls;
  }).pipe(Effect.provide(Testing.Shell.memory({ policy }))),
);
```

The recorder observes the operation the caller asked for, before the handler decides it, so a denied call is recorded exactly like one that succeeds. An RPC with no payload records `payload: undefined`; a protocol that declares `payload: {}` records `{}`.

|                                                           | Proves                                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In process — `Capability.fromHandlers`, the memory Layers | behaviour; nothing is encoded                                                                                                                                                                       |
| Over the wire — `Testing.client`, `Testing.layer`         | the host's own values encode, over the real schema and transport — a value the schema refuses dies rather than failing typed; a [`Binary.bulk`](binary-streams.md#bulk-requests) bound applies here |

A payload the client's own schema refuses fails `Protocol`, naming the operation and the path — `client.double({ value: "twenty-one" })` fails with a message starting `double: ` and naming `["value"]`. A host's own value its schema refuses stays a defect, as the table above says: the wire ships it as an opaque `Defect` no typed failure survives into, so it dies rather than failing typed. An operation whose protocol declares no payload is called with no argument: `client.status()`, not `client.status({})`.

`@sewed/react/testing`'s `store(bindings)` builds a `RuntimeStore` the same way: `bindings` is `Binding.to(slot, host)` over a `Testing.host`, dispatched through the real schema and transport exactly as `Testing.layer` is — so a renderer module's own test proves the same encoding, with no separate seam. There is no handshake to wait for, so the store answers `ready` at once, and `run` and every hook this package exports run over that context exactly as `connect`'s does. `close()` closes the scope the bindings' own connections live in; the host's own services are released the way any other `Testing.host` use releases them, when the scope they were built in closes.

Over the wire, a member whose value is `undefined` is not JSON, so a plain protocol refuses the payload at encode rather than sending a key with no value. `Schema.optionalKey` means the key is absent, not present and `undefined`, so a test that means "not provided" omits the key instead of passing `undefined` for it.

Two of the eight capabilities have no `memory` Layer, by design rather than by omission. `WindowControls.native(window)` and `GuestView.native(guest, policy)` take their owner as an argument and import no Electron themselves. A Node test supplies its own structural window or guest and calls `native` directly, then serves it with `Capability.serve`. The ambient surfaces need a memory Layer because their `native` reaches Electron; a per-owner one does not.

## Deciding a native event

`sewed/testing` stands in for one owner, with no Electron and no native object. Three constructors —
`Testing.owner("app" | "window" | "session")`, `Testing.contents({ of: "window" })` or
`({ of: "guest", input })`, and `Testing.requests()` — and each publishes **exactly the doors its
production owner has**, plus the resolution a native callback performs there.

| Stand-in       | Doors                                                     |
| -------------- | --------------------------------------------------------- |
| `owner(kind)`  | `decide`, `resolve`                                       |
| `contents(of)` | `decide`, `resolve`                                       |
| `requests()`   | `intercept`, `resolve`, `resolveChain`, `observe`, `emit` |

`requests()` has no `decide`: in production a session installs a request stage through `intercept`
alone, and `session.decide` refuses one. A test that wants every request writes the filter that says
so. `resolveChain` is on that stand-in alone, because both chain decidables in the catalog are
request stages.

`observe`/`emit` are the third door, for the observation stages deciders never see —
`session.requests(filter)`'s own stages: `sent`, `response`, `redirect`, `completed`, `error`.
`requests.observe(filter)` is an `Effect<Stream<WebRequest.Event, SewedError>, SewedError,
MainContext | Scope.Scope>` selected by the same filter vocabulary `session.requests` takes —
`urls` match patterns, an optional `types` list. It has already subscribed — its tap is registered
— by the time it succeeds, so the very next synchronous `emit` is never lost to the
asynchronous-registration race a native tap's own subscription has too; no retry loop or clock
advance is needed to wait until a subscription is live. `requests.emit(event)` pushes one event,
synchronously and effect-free, to every still-open `observe` subscription whose filter selects it:

```ts
const requests = Testing.requests();
const seen: WebRequest.Event[] = [];
const observed = yield * requests.observe({ urls: ["<all_urls>"] });
yield *
  observed.pipe(
    Stream.runForEach((event) => Effect.sync(() => seen.push(event))),
    Effect.forkScoped,
  );
requests.emit({
  id: 1,
  url: "https://api.example.com/v1",
  method: "GET",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
  stage: "completed",
  statusCode: 200,
  statusLine: "HTTP/1.1 200 OK",
  fromCache: false,
});
```

Closing the `Scope` an `observe` subscription acquired against removes its tap, the same way
removing a native one does: a later `emit` no longer reaches it. Two `observe` calls on the same
stand-in are two independent subscriptions, both selected by their own filter; `emit` offers to
every one whose filter matches. An invalid filter fails `observe`'s own Effect directly, rather
than the Stream it would have answered. A `url` `emit` cannot parse throws a `Protocol` `SewedError`
instead of dropping the event the way production's own dispatch does: a native URL failing to parse
says nothing about a bug in this library, but a test event's `url` is typed by the caller alone, so
a typo in it should fail the test loudly rather than vanish.

A stand-in carries the posture of the owner it names. Both real web contents build their registry
with a construction-time fallback of their own, so a web contents stand-in says whose it is: a
window's prompts for a download, a guest's denies, and a guest created with `input: "block"` blocks
input. It matters because a decider that passes on a miss delegates to that fallback, so the answer
a test asserts _is_ the fallback's — a download test written against the wrong posture asserts the
wrong thing while looking right. For the application, a window and a session the decidable's own
catalog fallback is faithful, because their real owners build a bare registry too.

```ts
const blockTrackers = (requests: Decision.Requests) =>
  requests.intercept(
    Decidables.Session.Request,
    { urls: ["https://*.tracker.example/*"] },
    Decision.sync(() => ({ kind: "block" })),
  );

const answer = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const requests = Testing.requests();
      yield* blockTrackers(requests);
      return yield* requests.resolve(Decidables.Session.Request, request);
    }).pipe(Effect.provide(Testing.main)),
  ),
);
```

Nothing there is a fake. The registry, the scoped install, the composition, the answer decode, the
declared `failure` a broken decider contributes, the owner's own posture, the filter a request
decider is selected by, and the removal a closing scope performs are the production ones, so the
test exercises the code that ships — the two postures come from the same two functions
`internal/WebContents.ts` and `internal/GuestView.ts` call, not from a copy. Write the feature
against the minimal interface — `Decision.Owner<O>` for `decide`, `Decision.Requests` for
`intercept` — and the same function takes a real window's `webContents` or session and the stand-in
alike.

Each constructor call builds its own registry, so one test's deciders are invisible to another's and
there is nothing to reset between them. A stand-in has one owner kind, as a real owner does, so a
decidable another owner owns is a compile error here exactly as it is in production. Upload-body
assembly is the one part that stays native: a test event carries the `body` it wants its decider to
see. See [the decision model](native-policy.md).

## Several owners

For several owners, use `Testing.host(protocol, handlers)` with ordinary `Binding.to` and `Binding.layer`. Provide `Testing.main` around that test program. It supplies an explicit test main capability without starting Electron. The host accepts the same protocol-bound handler builder as `host` in `sewed/main`.

A test helper that takes a host, or that lets a test override some of a capability's handlers per case, names its record `Capability.Implementation<typeof capability, R>`, not Effect's own `RpcGroup.HandlersFrom`: `HandlersFrom` types every handler's requirement as `any`, so a `toLayer` built from it — and the host built over that — carries a requirement of `any` rather than `MainContext | Scope`. No caller can discharge `any` on purpose, so `Effect.runPromise` accepts the effect even though nothing was actually provided.

`Testing.Worker.spawn(Testing.Worker.entry(url, protocol))`, also under `Testing.main`, runs a real Node worker thread using Sewed's production worker bootstrap. Use it to test placement, worker dependencies, termination, and owner isolation without importing core internals. The worker module still default-exports `Worker.define(...)` from `sewed/worker`.

An in-process test does not prove that a handler runs in a worker or that a native Electron operation works. Keep worker placement tests separate, and use a real Electron consumer for preload security, renderer lifetimes, windows, and platform behavior. `Testing.main` does not make Electron's native APIs available in Node. Keep this entry point in test code.
