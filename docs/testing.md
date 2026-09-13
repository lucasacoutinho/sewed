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

For several owners, use `Testing.host(protocol, handlers)` with ordinary `Binding.to` and `Binding.layer`. Provide `Testing.main` around that test program. It supplies an explicit test main capability without starting Electron. The host accepts the same protocol-bound handler builder as `host` in `sewed/main`.

`Testing.Worker.spawn(Testing.Worker.entry(url, protocol))`, also under `Testing.main`, runs a real Node worker thread using Sewed's production worker bootstrap. Use it to test placement, worker dependencies, termination, and owner isolation without importing core internals. The worker module still default-exports `Worker.define(...)` from `sewed/worker`.

An in-process test does not prove that a handler runs in a worker or that a native Electron operation works. Keep worker placement tests separate, and use a real Electron consumer for preload security, renderer lifetimes, windows, and platform behavior. `Testing.main` does not make Electron's native APIs available in Node. Keep this entry point in test code.
