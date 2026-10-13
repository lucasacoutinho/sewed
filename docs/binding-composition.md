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

## Share a worker without sharing window lifetimes

Acquire shared services in the application scope. Give each window a separate resource program that serves its native capabilities, loads its document and waits for `awaitClosed` before ending. Returning immediately after `load` would close a scoped window too soon; serving every window's controls in the application scope would keep those owners alive after their native windows close.

The following complete files extend the [generated scaffold](getting-started.md). Keep its HTML, styles and compiler projects. These files use a workspace contract alongside the scaffold's inert clock definitions.

```ts title="src/shared/workspace.ts"
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding, SewedError, WindowControls } from "sewed";

export const WorkspaceProtocol = RpcGroup.make(
  Rpc.make("thread", { success: Schema.Finite, error: SewedError }),
  Rpc.make("current", { success: Schema.Finite, error: SewedError }),
  Rpc.make("increment", { success: Schema.Finite, error: SewedError }),
  Rpc.make("changes", { success: Schema.Finite, error: SewedError, stream: true }),
);
export const Workspace = Binding.slot("workspace", WorkspaceProtocol);
export const Controls = WindowControls.capability.slot;
export const workspaceBindings = [Workspace, Controls];
```

The counter is constructed when the worker's handler layer builds, not when the module is imported:

```ts title="src/worker/workspace.ts"
import { Effect, Layer, SubscriptionRef } from "effect";
import * as Worker from "sewed/worker";
import { WorkspaceProtocol } from "../shared/workspace.js";

export default Worker.define(WorkspaceProtocol, (implement) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const count = yield* SubscriptionRef.make(0);
      return implement({
        thread: () => Worker.threadId,
        current: () => SubscriptionRef.get(count),
        increment: () => SubscriptionRef.updateAndGet(count, (value) => value + 1),
        changes: () => SubscriptionRef.changes(count),
      });
    }),
  ),
);
```

A window feature takes the least owner interface it needs, `Binding.Owner`. It does not spawn or replace the shared service, and it does not return a native handle outside its lifetime:

```ts title="src/main/workspace-window.ts"
import { Effect } from "effect";
import type { RpcGroup } from "effect/rpc";
import { Binding, Renderer } from "sewed";
import { BrowserWindow, Capability, WindowControls } from "sewed/main";
import { Controls, Workspace, workspaceBindings } from "../shared/workspace.js";
import type { WorkspaceProtocol } from "../shared/workspace.js";

export type WorkspaceOwner = Binding.Owner<RpcGroup.Rpcs<typeof WorkspaceProtocol>>;

export const runWorkspaceWindow = (workspace: WorkspaceOwner, rendererUrl: URL, title: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const window = yield* BrowserWindow.make({ title, width: 720, height: 480 });
      const controls = yield* Capability.serve(WindowControls.capability).pipe(
        Effect.provide(WindowControls.native(window)),
      );
      yield* window.webContents.load(Renderer.entry(rendererUrl, { bindings: workspaceBindings }), {
        bindings: [Binding.to(Workspace, workspace), Binding.to(Controls, controls)],
      });
      yield* window.awaitClosed;
    }),
  );
```

The application chooses one worker instance and passes it to both windows. `Effect.all` keeps their lifetimes concurrent and propagates startup failures; a normally closed window does not interrupt its sibling:

```ts title="src/main/workspace.ts"
import { Effect } from "effect";
import { Worker } from "sewed/main";
import { WorkspaceProtocol } from "../shared/workspace.js";
import { runWorkspaceWindow } from "./workspace-window.js";

export const workspaceApplication = Effect.gen(function* () {
  const workspace = yield* Worker.spawn(
    Worker.entry(new URL("../worker/workspace.js", import.meta.url), WorkspaceProtocol, {
      bindings: [],
    }),
  );
  const rendererUrl = new URL(
    process.env.SEWED_RENDERER_URL ?? "../renderer/index.html",
    import.meta.url,
  );
  yield* Effect.all(
    [
      runWorkspaceWindow(workspace, rendererUrl, "Workspace One"),
      runWorkspaceWindow(workspace, rendererUrl, "Workspace Two"),
    ],
    { concurrency: "unbounded" },
  );
});
```

The application entry starts that inert program in main:

```ts title="src/main/app.ts"
import { App } from "sewed/main";
import { workspaceApplication } from "./workspace.js";

App.run([], workspaceApplication);
```

The renderer entry declares the workspace's two slots and mounts `<App />` as an Effect for each document:

```tsx title="src/renderer/main.tsx"
import { Cause } from "effect";
import { Renderer } from "sewed";
import { mount } from "@sewed/react";
import { workspaceBindings } from "../shared/workspace.js";
import { App } from "./App.js";

const entry = Renderer.entry(new URL(location.href), { bindings: workspaceBindings });
const lifetime = Renderer.run(entry, mount("#root", <App />));

lifetime.addObserver((exit) => {
  if (exit._tag === "Failure") console.error(Cause.pretty(exit.cause));
});
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    lifetime.interruptUnsafe();
  });
}
```

Both documents reach the same counter and different controls owners. React's ordinary `title` element reflects each window's native state without an effect hook:

```tsx title="src/renderer/App.tsx"
import { Cause } from "effect";
import { useAction, useClient, useStream } from "@sewed/react";
import { Controls, Workspace } from "../shared/workspace.js";

export function App() {
  const workspace = useClient(Workspace);
  const controls = useClient(Controls);
  const count = useStream(() => workspace.changes(), [workspace]);
  const window = useStream(() => controls.changes(), [controls]);
  const increment = useAction(() => workspace.increment());
  const thread = useAction(() => workspace.thread());
  const rename = useAction(() => controls.setTitle({ title: "Renamed workspace" }));
  const close = useAction(() => controls.close());
  const title = window.status === "value" ? window.value.title : "Workspace";

  return (
    <main>
      <title>{title}</title>
      <h1>{title}</h1>
      <p>
        Shared value:{" "}
        {count.status === "value"
          ? count.value
          : count.status === "failure"
            ? Cause.pretty(count.cause)
            : "waiting"}
      </p>
      <button type="button" onClick={() => increment.run()}>
        Increment shared value
      </button>
      <button type="button" onClick={() => thread.run()}>
        Ask the shared worker for its thread id
      </button>
      <p>
        {thread.status === "success"
          ? `Worker thread: ${thread.value}`
          : thread.status === "failure"
            ? Cause.pretty(thread.cause)
            : thread.status}
      </p>
      <button type="button" onClick={() => rename.run()}>
        Rename this window
      </button>
      <button type="button" onClick={() => close.run()}>
        Close this window
      </button>
      <p>
        {increment.status === "failure" ? Cause.pretty(increment.cause) : null}
        {rename.status === "failure" ? Cause.pretty(rename.cause) : null}
        {close.status === "failure" ? Cause.pretty(close.cause) : null}
      </p>
    </main>
  );
}
```

Run `pnpm typecheck` and `pnpm dev` or `pnpm start` in the app. Incrementing in either window updates both; renaming or closing one affects only its native owner. Closing one window ends that window's served capability and document bindings, not the application-owned worker.

Both documents may declare the same controls slot because each receives a different `Binding.to` list. Do not merge their window-specific binding environments into one global `ClientContext` or reuse one served controls owner for every window. Sharing a renderer entry does not share its owners.

## Verification

Library checks exercise public Layer composition, pending calls during either scope's closure, runtime identity, duplicate slots, and owner independence. Type fixtures preserve runtime and middleware requirements. The external Electron playground starts a main-owned worker stream before opening windows and observes it through reload and application shutdown.

`pnpm check:consumer` copies the complete multi-window files above into a fresh app installed from packed public packages, typechecks and builds them, and runs the documented worker. Its independent client environments observe the same state and native worker thread; closing one environment invalidates its client without stopping the worker or the other client. Type checks reject a mismatched owner protocol, a missing controls binding and renderer placement for the native window program.

The copied app is also exercised in Electron: both windows observe shared increments, only the selected window renames, and closing it releases its controls owner without replacing the shared worker. Closing the last window exits normally with no owners, bindings or requests remaining in the diagnostics snapshot.
