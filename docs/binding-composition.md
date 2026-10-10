# Binding composition

Call a worker or host from your main program with `Binding.layer`. You choose the running owner with `Binding.to`, then use its client through ordinary Effect composition.

The client environment has its own scope. It can end independently of the worker or host, which lets you make a one-off call or keep an application-owned stream running.

## Call an owner from main

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

## API details

```ts
Binding.layer(
  bindings: readonly Binding.Bound[],
): Layer.Layer<ClientContext, SewedError, MainContext>
```

The Layer is inert until built. It validates duplicate slot names, creates a client identity, and installs the selected connection factories. It supplies only `ClientContext`. Main, worker, scope, schema, and middleware requirements remain checked by the existing public signatures.

Each acquired connection has a child scope attached to its binding environment and a finalizer in the client's acquisition scope. Either owner can close the connection. Layer closure invalidates its clients and closes pending connections without stopping the bound service. Other client environments remain independent.

## Choose the client lifetime

Use `Effect.provide` for the binding environment and `Effect.forkScoped` when work should continue in the background. Closing the client environment releases its connections. The bound worker or host stays owned by the scope that acquired it.

`Binding.layer` requires `MainContext` because its owners and connection factories are local to main. For clients inside a worker, follow [worker dependencies](worker-bindings.md).

`Binding.clientContext` is also public. Use it when you are building a runtime adapter that installs its own client environment, as `@sewed/react/testing` does. Application programs usually use the layer.

## Verification

Library checks exercise public Layer composition, pending calls during either scope's closure, runtime identity, duplicate slots, and owner independence. Type fixtures preserve runtime and middleware requirements. The external Electron playground starts a main-owned worker stream before opening windows and observes it through reload and application shutdown.
