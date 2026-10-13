# Build an application with Sewed

Build an application with one worker, one window, and a clock stream in React. You will declare the shared contract, implement the worker, connect it in main, and display its values in a component.

React continues to own your interface, and your router handles navigation. Sewed connects those components to the running owners and manages the lifetime of their work.

## Start from the scaffold

`create-sewed` writes the wiring below into a new directory: shared contracts and slots, a clock worker, a main entry that spawns it and loads one window, the React bootstrap adapter, the Vite integration, and both compiler projects. Until the packages are published, pack them locally and let the scaffolder select the artifacts:

```sh
pnpm install
pnpm release:pack
node packages/create/bin/create-sewed.mjs ../my-app --local-packages .artifacts
pnpm --dir ../my-app install
pnpm --dir ../my-app typecheck
pnpm --dir ../my-app dev
```

The local package directory must contain `sewed`, `@sewed/react`, and `@sewed/vite` tarballs named for the same version as `create-sewed`. Missing archives fail before the project is placed, leaving an existing empty destination intact. Paths are resolved from the command's working directory, including paths with spaces; use `--name` if the destination's name is not a valid package name. The generated app references the archives by absolute `file:` paths, so keep the package directory in place for subsequent installs.

## Read the application in this order

| File                      | What it decides                           |
| ------------------------- | ----------------------------------------- |
| `src/shared/contracts.ts` | RPC payloads, results, errors and streams |
| `src/shared/bindings.ts`  | Named capabilities a caller can request   |
| `src/worker/clock.ts`     | The implementation that runs in a worker  |
| `src/main/app.ts`         | Which running owners each window receives |
| `src/renderer/App.tsx`    | React actions and subscriptions           |
| `src/renderer/main.tsx`   | Renderer scope and React root mounting    |
| `src/shared/attempt.ts`   | Explicit outcomes for uncertain delivery  |

The following named blocks are complete files. Replace those files in the scaffold to run the smaller clock application; keep its HTML, styles, Vite configuration and compiler projects. The packed consumer check compiles these exact blocks, then exercises their worker and recovery behavior through public exports.

## Connect the worker to your window

The contract module exports one protocol value. Main, worker and binding declarations import that value rather than reconstructing a structurally identical protocol.

```ts title="src/shared/contracts.ts"
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const ClockProtocol = RpcGroup.make(
  Rpc.make("thread", { success: Schema.Finite }),
  Rpc.make("ticks", { success: Schema.Finite, stream: true }),
);
```

A separate module names the client and declares exactly what the renderer receives:

```ts title="src/shared/bindings.ts"
import { Binding } from "sewed";
import { ClockProtocol } from "./contracts.js";

export const Clock = Binding.slot("clock", ClockProtocol);
export const bindings = [Clock];
```

The worker's default export is an inert definition. Main starts it, and Sewed builds its handler layer in that worker:

```ts title="src/worker/clock.ts"
import { Stream } from "effect";
import * as Worker from "sewed/worker";
import { ClockProtocol } from "../shared/contracts.js";

export default Worker.define(ClockProtocol, (implement) =>
  implement({
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

Main acquires the owner and binds that exact instance to the window. The scaffold emits main, worker and renderer directories as siblings:

```ts title="src/main/app.ts"
import { Effect } from "effect";
import { Binding, Renderer } from "sewed";
import { App, BrowserWindow, Worker } from "sewed/main";
import { Clock, bindings } from "../shared/bindings.js";
import { ClockProtocol } from "../shared/contracts.js";

App.run(
  [],
  Effect.gen(function* () {
    const clock = yield* Worker.spawn(
      Worker.entry(new URL("../worker/clock.js", import.meta.url), ClockProtocol, {
        bindings: [],
      }),
    );
    const window = yield* BrowserWindow.make({ title: "Clock", width: 960, height: 640 });
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

The component calls its client from an event and subscribes to the stream without effect hooks:

```tsx title="src/renderer/App.tsx"
import { Cause } from "effect";
import { useAction, useClient, useStream } from "@sewed/react";
import { Clock } from "../shared/bindings.js";

export function App() {
  const clock = useClient(Clock);
  const ticks = useStream(() => clock.ticks(), [clock]);
  const thread = useAction(() => clock.thread());

  return (
    <main>
      <h1>Clock</h1>
      <p>
        Worker ticks:{" "}
        {ticks.status === "value"
          ? ticks.value
          : ticks.status === "failure"
            ? Cause.pretty(ticks.cause)
            : "waiting"}
      </p>
      <button type="button" onClick={() => thread.run()}>
        Ask the worker for its thread id
      </button>
      <p>
        {thread.status === "success"
          ? `Worker thread: ${thread.value}`
          : thread.status === "failure"
            ? Cause.pretty(thread.cause)
            : thread.status}
      </p>
    </main>
  );
}
```

The renderer entry supplies the same binding declarations and mounts `<App />` directly as an Effect. `Renderer.run` owns the React root's scope; Fast Refresh disposal interrupts that lifetime:

```tsx title="src/renderer/main.tsx"
import { Cause } from "effect";
import { Renderer } from "sewed";
import { mount } from "@sewed/react";
import { bindings } from "../shared/bindings.js";
import { App } from "./App.js";

const entry = Renderer.entry(new URL(location.href), { bindings });
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

Run `pnpm typecheck`, `pnpm dev` or `pnpm start` from the application directory. `thread.cancel()` interrupts an invocation; unmount releases its resources. Use ordinary React state for local UI state and your router for navigation.

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

## Handle uncertain outcomes without replaying work

An operation that changes data needs a different recovery policy from a read. A connection lost after send reports `Unknown`: the operation may already have committed. Do not infer that a general `Closed` error means nothing happened; only `Closed` with `reason: "transport/closed-before-send"` makes that transport guarantee.

Not every early failure carries that reason. For example, an owner can disappear while a caller's payload encoder is still suspended, before the transport has registered its message. Preserve an unqualified `Closed` failure rather than inventing a delivery guarantee.

This application helper runs its input once, preserving its service requirements, other typed errors, defects and interruption:

```ts title="src/shared/attempt.ts"
import { Effect } from "effect";
import { SewedError } from "sewed";

export type Attempt<A> =
  | { readonly status: "success"; readonly value: A }
  | { readonly status: "not-sent"; readonly error: SewedError }
  | { readonly status: "uncertain"; readonly error: SewedError };

export const attempt = <A, E, R>(
  program: Effect.Effect<A, E | SewedError, R>,
): Effect.Effect<Attempt<A>, E | SewedError, R> =>
  program.pipe(
    Effect.map((value): Attempt<A> => ({ status: "success", value })),
    Effect.catchIf(
      (error): error is SewedError => error instanceof SewedError,
      (error): Effect.Effect<Attempt<A>, SewedError> => {
        if (error.code === "Unknown") return Effect.succeed({ status: "uncertain", error });
        if (error.code === "Closed" && error.reason === "transport/closed-before-send")
          return Effect.succeed({ status: "not-sent", error });
        return Effect.fail(error);
      },
    ),
  );
```

Pass a mutation wrapped in `attempt` to `useAction`, or compose it inside an ordinary Effect program. A successful hook invocation exposes the helper's result in its `value`; unrelated failures still use the hook's `failure` state.

| Outcome     | Application decision                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| `success`   | Present the confirmed result                                                          |
| `not-sent`  | Let the person choose whether to submit again to an available owner                   |
| `uncertain` | Query durable operation status or refresh authoritative state before another mutation |

Keep the error and its cause available for diagnostics. There is no retry loop or owner replacement in this helper. Interruption is not evidence that a side effect was rolled back; a durable operation identifier and status query belong in your application's contract when that distinction matters.

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
