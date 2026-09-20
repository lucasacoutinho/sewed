# Testing through public APIs

Import `sewed/testing` in Node tests. It has no Electron import and runs the real Sewed schema and JSON RPC path.

```ts
import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding } from "sewed";
import * as Testing from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
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

`Testing.layer(slot, handlers)` owns an in-process host and its binding environment. The surrounding scope closes its connections and handler layer. Typed failures are serialized and decoded by the protocol; stream interruption reaches handler finalizers. Supply application services with ordinary Layers. Unprovided handler, schema, middleware, and execution requirements remain visible in types.

## Capabilities in tests

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

The recorder observes the operation the caller asked for, before the handler decides it, so a denied call is recorded exactly like one that succeeds. An RPC with no payload records `payload: undefined`; a protocol that declares `payload: {}` records `{}`. A memory call is dispatched in process and is therefore not encoded, so use `Testing.layer` when the assertion is about the transport.

Two of the eight capabilities have no `memory` Layer, by design rather than by omission. `WindowControls.native(window)` and `GuestView.native(guest, policy)` take their owner as an argument and import no Electron themselves. A Node test supplies its own structural window or guest and calls `native` directly, then serves it with `Capability.serve`. The ambient surfaces need a memory Layer because their `native` reaches Electron; a per-owner one does not.

## Deciding a native event

`sewed/testing` stands in for one owner, with no Electron and no native object. Three constructors,
one per shape a real owner has: `Testing.owner("app" | "window" | "session")`,
`Testing.contents({ of: "window" })` or `({ of: "guest", input })`, and `Testing.requests()`. Each
publishes `decide`, `resolve` and `resolveChain` — the last two being what a native callback
performs in production — and the request stages also publish `intercept`, the filtered door that
belongs to them alone.

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

`Testing.Worker.spawn(Testing.Worker.entry(url, protocol))`, also under `Testing.main`, runs a real Node worker thread using Sewed's production worker bootstrap. Use it to test placement, worker dependencies, termination, and owner isolation without importing core internals. The worker module still default-exports `Worker.define(...)` from `sewed/worker`.

An in-process test does not prove that a handler runs in a worker or that a native Electron operation works. Keep worker placement tests separate, and use a real Electron consumer for preload security, renderer lifetimes, windows, and platform behavior. `Testing.main` does not make Electron's native APIs available in Node. Keep this entry point in test code.
