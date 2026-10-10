# Build an application with Sewed

Build an application with one worker, one window, and a clock stream in React. You will declare the shared contract, implement the worker, connect it in main, and display its values in a component.

React continues to own your interface, and your router handles navigation. Sewed connects those components to the running owners and manages the lifetime of their work.

## Start from the scaffold

`create-sewed` writes the wiring below into a new directory: shared contracts and slots, a clock worker, a main entry that spawns it and loads one window, the React bootstrap adapter, the Vite integration, and both compiler projects. Until the packages are published, run it from this repository and point the generated dependencies at packed tarballs:

```sh
node packages/create/bin/create-sewed.mjs ../my-app
```

## Read the application in this order

| File                         | What it decides                           |
| ---------------------------- | ----------------------------------------- |
| `src/shared/contracts.ts`    | RPC payloads, results, errors and streams |
| `src/shared/bindings.ts`     | Named capabilities a caller can request   |
| `src/worker/clock.ts`        | The implementation that runs in a worker  |
| `src/main/app.ts`            | Which running owners each window receives |
| `src/renderer/lib/sewed.tsx` | Renderer lifetime and React root mounting |
| `src/renderer/App.tsx`       | React actions and subscriptions           |

`src/main/session.ts` is extra instrumentation in the playground: it reports status, logs cleanup, and starts a demonstration stream. The scaffold's smaller set of files is enough for this walkthrough.

## Connect the worker to your window

Start with the shared contract. It describes the clock's two operations and gives its client a name:

```ts
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding } from "sewed";

export const ClockProtocol = RpcGroup.make(
  Rpc.make("thread", { success: Schema.Number }),
  Rpc.make("ticks", { success: Schema.Number, stream: true }),
);
export const Clock = Binding.slot("clock", ClockProtocol);
export const bindings = [Clock];
```

Implement those operations in the worker module. Its default export is a definition; main starts the worker and Sewed builds its handler layer there. You can provide application services with ordinary layers:

```ts
import { Stream } from "effect";
import * as Worker from "sewed/worker";
import { ClockProtocol } from "../shared/bindings.js";

export default Worker.define(
  ClockProtocol,
  ClockProtocol.toLayer({
    thread: () => Worker.threadId,
    ticks: () =>
      Stream.tick(250).pipe(
        Stream.scan(
          () => 0,
          (count) => count + 1,
        ),
      ),
  }),
);
```

Main acquires the owners and chooses their bindings. This example assumes the worker and renderer build outputs are siblings of the main output directory:

```ts
import { Effect } from "effect";
import { Binding, Renderer } from "sewed";
import { App, BrowserWindow, Worker } from "sewed/main";
import { Clock, ClockProtocol, bindings } from "../shared/bindings.js";

App.run(
  [],
  Effect.gen(function* () {
    const clock = yield* Worker.spawn(
      Worker.entry(new URL("../worker/clock.js", import.meta.url), ClockProtocol),
    );
    const window = yield* BrowserWindow.make({ title: "Clock" });
    const url = new URL(
      process.env.SEWED_RENDERER_URL ?? "../renderer/index.html",
      import.meta.url,
    );
    yield* window.webContents.load(Renderer.entry(url, { bindings }), {
      bindings: [Binding.to(Clock, clock)],
    });
  }),
);
```

The renderer bootstrap calls `Renderer.run` with the same binding declarations and uses `mount` from `@sewed/react` to mount the ordinary React root. Keep this in one adapter file, as the playground does. Its Fast Refresh disposal interrupts the renderer lifetime before remounting the root.

Inside a feature hook, acquire the client and declare actions or streams:

```tsx
import { useAction, useClient, useStream } from "@sewed/react";
import { Clock } from "../../../shared/bindings.js";

export function useClock() {
  const clock = useClient(Clock);
  const ticks = useStream(() => clock.ticks(), [clock]);
  const thread = useAction(() => clock.thread());
  return { ticks, thread };
}
```

A component renders `ticks.status` and calls `thread.run()` from an event handler. `thread.cancel()` interrupts an action; unmount releases its resources. Use ordinary React state for local UI state and ordinary TanStack routes for navigation. No effect hook is needed to connect Sewed.

## Let scopes manage cleanup

| Work                       | Owner                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Shared worker or main host | The main Effect scope that acquired it                                                          |
| Native window              | Its main acquisition scope, ending early when the window closes                                 |
| Renderer clients           | The current document, ending on reload, navigation or shutdown                                  |
| `useStream` subscription   | The committed component subscription and its dependencies                                       |
| `useAction` invocation     | The accepted run, until replacement, cancellation, unmount or runtime loss; failure releases it |
| `useResource` lease        | The committed component subscription, until release, replacement, unmount or runtime loss       |
| `store.run` program        | Its own scope, until completion, signal cancellation or runtime loss                            |

Successful actions retain acquired resources until their invocation is released. If an action should return a value and release every resource immediately, put `Effect.scoped` around that action's program.

Runtime loss interrupts active hook and `store.run` work. Their finalizers finish before the hook reports `Closed` or the promise rejects; operation and cleanup failures remain available. Resource and action replacements wait for the previous invocation's cleanup before acquiring again.

To start application work before any window exists, use ordinary `Effect.provide(Binding.layer([...]))` and `Effect.forkScoped`. The [binding composition guide](binding-composition.md) explains how the client's scope and binding environment control cleanup.

## Diagnose wiring problems

| Symptom                                                  | What to inspect                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Missing bindings: sewed/binding/clock`                  | The declaration exists, but the corresponding `Binding.to(Clock, owner)` was not supplied |
| `Unexpected bindings: ...`                               | Main supplied a capability absent from this entry's declarations                          |
| `Duplicate declarations` or `Duplicate bindings`         | The same slot key occurs more than once; separate capabilities need distinct names        |
| `Sewed preload is missing`                               | The page needs to be loaded through `window.webContents.load` in Electron                 |
| `Renderer could not bind to main` (`Startup`)            | The document no longer matches main's configured entry or its handshake was rejected      |
| `Binding owner is unavailable` (`Closed`)                | Opening the selected owner failed; check its lifetime and the nested cause                |
| Main or worker requirements appear in a React type error | Implement that operation in its owning runtime and expose an explicit binding             |
| A stream restarts on every render                        | Check its dependency list for newly created objects or functions                          |
| A stream uses an old prop                                | Include that prop in the stream factory's dependency list                                 |

Stream dependencies use React's `Object.is` comparison. An object created during each render is a new dependency. Construct request payloads inside the factory and depend on the primitive values it reads. Development StrictMode and Fast Refresh can release and reacquire subscriptions; neither mechanism replaces the bound worker owner. The `@sewed/react` README describes the complete hook contract.

Effect requirements describe capabilities, not CPU cost. An arbitrary JavaScript loop in a component still blocks that renderer. Put computation in the worker implementation to obtain an execution boundary.

## Local and inline documents

`Renderer.entry` names any document by URL. Two narrower constructors cover the documents main shows outside the ordinary application window: `Renderer.local` for one shipped with the application, and `Renderer.inline` for one main writes itself.

Use `Renderer.local(path, importMetaUrl, { bindings })` for another page shipped with your application, such as an about box or crash screen. It resolves the path to a `file:` URL relative to `importMetaUrl`:

```ts
yield *
  window.webContents.load(
    Renderer.local("crash/index.html", import.meta.url, { bindings: [crashScreen] }),
    { bindings: [bound] },
  );
```

`window.webContents.load` checks that the resolved file exists before it configures the bridge or asks Electron to navigate, failing `Protocol` and naming the path when it does not. The consumer's Vite build declares the second page as another Rollup input, alongside the main renderer entry:

```ts
// vite.renderer.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: "renderer/index.html",
        crash: "renderer/crash/index.html",
      },
    },
  },
});
```

Use `Renderer.inline(html)` for a simple notice written by main. It creates a `data:text/html;base64,…` entry with an empty binding list:

```ts
yield *
  window.webContents.load(Renderer.inline(`<!doctype html><title>Jobwright stopped</title>…`), {
    bindings: [],
  });
```

An inline page has an opaque origin and cannot connect to main. Its type declares no binding keys, and an empty HTML string fails with `Protocol`.

For a page with actions such as exporting logs or retrying, use a local document with the bindings it needs. Build it as another Vite entry, as shown above.

## Try the playground

The separate `sewed-playground` directory is a working consumer of locally packed packages. From that directory, run `pnpm install` and `pnpm dev` to explore the examples in Electron.

Its Vite setup keeps React Fast Refresh and restarts the app after successful main or worker compilation. A compilation error leaves the running app available while you fix the code.
