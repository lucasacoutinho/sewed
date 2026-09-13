# Binding composition

## Problem

Renderer startup installs a scoped client environment, but main-owned Effects previously needed the private `clientContext` helper to call a bound worker or host. The library's own worker tests used that helper. Ordinary application work needs the same binding, schema, interruption, and instance guarantees without depending on a renderer's lifetime.

The existing contract in `api.md` requires separate application, window, renderer-document, and request lifetimes. This addition preserves those owners. It makes client composition available in the main runtime and makes connection lifetime follow both the client scope and its binding environment.

## Usage

Given the playground's `Compute` binding and a running worker, a one-off call uses an ordinary Layer:

```ts
yield *
  Effect.gen(function* () {
    const compute = yield* Compute();
    return yield* compute.wait({ milliseconds: 20, label: "Ready" });
  }).pipe(Effect.provide(Binding.layer([Binding.to(Compute, worker)])));
```

An application-owned stream uses the same Layer inside a scoped fork:

```ts
const background = Effect.gen(function* () {
  const compute = yield* Compute();
  yield* Stream.runDrain(compute.background());
});

yield *
  background.pipe(Effect.provide(Binding.layer([Binding.to(Compute, worker)])), Effect.forkScoped);
```

These expressions run within a main Effect with a scope, such as the setup passed to `App.run`. The caller chooses the scope and fork; Sewed chooses the bound instance and transport.

## Shape

```ts
Binding.layer(
  bindings: readonly Binding.Bound[],
): Layer.Layer<ClientContext, SewedError, MainContext>
```

The Layer is inert until built. It validates duplicate slot names, creates a client identity, and installs the selected connection factories. It supplies only `ClientContext`. Main, worker, scope, schema, and middleware requirements remain checked by the existing public signatures.

Each acquired connection has a child scope attached to its binding environment and a finalizer in the client's acquisition scope. Either owner can close the connection. Layer closure invalidates its clients and closes pending connections without stopping the bound service. Other client environments remain independent.

The common client-environment constructor lives with bindings and remains private to package entry points. Renderer startup uses it too. Protocol encoding, worker execution, and host ownership stay in their existing modules. This concentrates connection ownership behind one public Layer instead of exposing factories or transport state, following boundary discipline and minimizing the caller's required knowledge.

## Synthesis decision

Use `Binding.layer` with ordinary Effect composition. It needs one public constructor and fits both short calls and application-owned forks. Keep connection ownership in the shared binding implementation so renderer and main clients follow the same rule.

## Alternatives considered

- Add bindings to `App.run` options. This couples binding acquisition to application startup even though running owners are normally created inside setup. It would require another setup stage or callbacks to obtain the owners.
- Add `Binding.run(program, bindings)`. This hides a runtime runner and a lifetime decision that ordinary `Effect.provide` and `Effect.forkScoped` already express.
- Export the internal client-context constructor. This exposes service installation and identity details that consumers should not need to coordinate.

## Tradeoffs

This Layer requires the main runtime because its bound owners and connection factories are local to main. [Worker dependencies](worker-bindings.md) use explicit channel setup through `Worker.define` and `Worker.spawn`; the factories remain in main.

Callers still choose their job scope with ordinary Effects. Sewed does not add a background-job registry, retries, or owner replacement to provide binding composition.

## Verification

Library checks exercise public Layer composition, pending calls during either scope's closure, runtime identity, duplicate slots, and owner independence. Type fixtures preserve runtime and middleware requirements. The external Electron playground starts a main-owned worker stream before opening windows and observes it through reload and application shutdown.
