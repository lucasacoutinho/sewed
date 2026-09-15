# Sewed capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split between main handles and hosted owners with one capability per surface: one contract, a native Layer that runs in-process, a client Layer over a binding, and an in-memory Layer for tests.

**Architecture:** A capability is a Context service whose shape is the protocol's client shape. `Capability.define(name, protocol)` creates the tag and its binding slot. `Capability.fromHandlers` builds a native Layer that calls handlers directly, with no encoding. `Capability.client` builds a deferred client Layer for documents, workers, and utilities. `Capability.serve` turns whichever Layer is in scope into a bound owner. Consumers write `yield* Shell` in every runtime.

**Tech Stack:** TypeScript 5 with Node 24, Effect `4.0.0-rc.115` (`effect/unstable/rpc`), Electron 44, the node test runner through tsx (`node --import tsx --test`), the external playground for native proof.

**Spec:** `docs/superpowers/specs/2026-09-15-platform-redesign-design.md`, section A, with the decisions at the end of that file.

## Global Constraints

- Commands run from the repository root: `pnpm typecheck` (`tsc -b`), `pnpm test`, `pnpm build`, and a single test file with `node --import tsx --test packages/sewed/test/<file>.test.ts`. There is no per-package `typecheck` script.

- Effect stays at the repository's pinned version. Add no dependency.
- The root package (`sewed`) imports no Electron module. Only `sewed/main` and `internal/*` main modules may.
- Keep definitions inert: a capability definition creates no native object and opens no connection.
- The native Layer must not encode, decode, or copy payloads. In-process calls pass the caller's value to the handler.
- Validate at transport boundaries only: the client Layer and the served owner keep today's schema validation.
- No `any`, no casts outside the two adapter functions that bridge the dynamic method table, which already exist in `Binding.ts` (`methods`, `table`).
- Every public addition has a contract test in `packages/sewed/test/*-types.ts` and node tests for behavior.
- Breaking changes are allowed. Migrate the playground in the same task that breaks it, and leave no aliases.
- `pnpm build`, `timeout 240 pnpm test`, and `pnpm website:build` pass before a task is complete.
- Each task ends in one local commit. Do not push. Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Scope

In scope: the capability model and the surfaces that have a hosted owner today (Shell, NativeTheme, Clipboard, PowerMonitor, Notification, Cookies), plus window controls and guest tabs.

Out of scope, and deliberately left for the next plans: decisions (spec section B), declarations and instance claim (C), contributions (D), readiness and local documents (E), the failure model (F), performance work (G), and `sewed check` (H). Session free functions move onto handle methods in the decisions plan, where those surfaces change anyway.

## File Structure

- Create: `packages/sewed/src/Capability.ts` — `define`, `client`, `fromHandlers`, `serve`, and the `Capability` type. Electron-free, exported from `sewed`.
- Create: `packages/sewed/src/internal/CapabilityDispatch.ts` — resolves handler entries from a built handler layer and invokes them in-process.
- Create: `packages/sewed/src/internal/CapabilityMemory.ts` — the shared in-memory Layer builder used by `sewed/testing`.
- Modify: `packages/sewed/src/Binding.ts` — export `slot` internals that `Capability` needs (`makeBound`, `factoryOf`, `Client`), no behavior change.
- Modify: `packages/sewed/src/index.ts`, `main.ts`, `Testing.ts` — export the capability API.
- Modify: `packages/sewed/src/Shell.ts`, `internal/Shell.ts`; then `NativeTheme`, `Clipboard`, `PowerMonitor`, `Notification`, `internal/Cookies.ts`; then `WindowControls`, `internal/Window.ts`, `internal/GuestView.ts`, `internal/GuestHost.ts`.
- Create: `packages/sewed/test/capability.test.ts`, `capability-dispatch.test.ts`, `capability-types.ts`.
- Modify: `packages/sewed/test/surfaces.test.ts`, `surfaces-types.ts`, `guest-host.test.ts`, `window-state.test.ts`, `testing-types.ts`.
- Modify: `docs/api.md`, `docs/desktop-surfaces.md`, `docs/window-controls.md`, `docs/guest-views.md`, `docs/testing.md`, `docs/electron-coverage.md`, `docs/reference.md` (generated), `README.md`, `packages/react/README.md`.
- Modify (playground, separate repository `../sewed-playground`): `src/shared/bindings.ts`, `src/main/app.ts`, `src/main/session.ts`, `src/renderer/**` where hooks name a slot.

---

### Task 1: The capability definition and its client Layer

**Files:**
- Create: `packages/sewed/src/Capability.ts`
- Create: `packages/sewed/test/capability.test.ts`
- Create: `packages/sewed/test/capability-types.ts`
- Modify: `packages/sewed/src/index.ts`

**Interfaces:**
- Consumes: `Binding.slot`, `Binding.deferred`, `Binding.Client` from `./Binding.ts`.
- Produces:
  ```ts
  export interface Capability<Rpcs extends Rpc.Any, Key extends string = string>
    extends Context.Service<Capability<Rpcs, Key>, Binding.Client<Rpcs>> {
    readonly key: Key;
    readonly protocol: RpcGroup.RpcGroup<Rpcs>;
    readonly slot: Binding.Slot<Rpcs, Key>;
  }
  export const define: <const Name extends string, Rpcs extends Rpc.Any>(
    name: Name,
    protocol: RpcGroup.RpcGroup<Rpcs>,
  ) => Capability<Rpcs, `sewed/binding/${Name}`>;
  export const client: <Rpcs extends Rpc.Any, Key extends string>(
    capability: Capability<Rpcs, Key>,
    options?: { readonly connection?: Binding.Connection },
  ) => Layer.Layer<Capability<Rpcs, Key>, never, ClientContext>;
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/sewed/test/capability.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Capability } from "sewed";
import * as Testing from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
);

describe("Capability", () => {
  it("names its slot after the capability and keeps the protocol", () => {
    const Calculator = Capability.define("calculator", Protocol);
    assert.equal(Calculator.key, "sewed/binding/calculator");
    assert.equal(Calculator.slot.key, "sewed/binding/calculator");
    assert.equal(Calculator.protocol, Protocol);
  });

  it("serves the capability to a client Layer over a binding", async () => {
    const Calculator = Capability.define("calculator", Protocol);
    const handlers = Protocol.toLayer({ double: ({ value }) => Effect.succeed(value * 2) });
    const program = Effect.gen(function* () {
      const calculator = yield* Calculator;
      return yield* calculator.double({ value: 21 });
    });
    const result = await Effect.runPromise(
      Effect.scoped(
        program.pipe(
          Effect.provide(
            Capability.client(Calculator).pipe(
              Layer.provide(Testing.layer(Calculator.slot, handlers)),
            ),
          ),
        ),
      ),
    );
    assert.equal(result, 42);
  });

  it("opens no connection until an operation runs", async () => {
    const Calculator = Capability.define("calculator", Protocol);
    let connections = 0;
    const handlers = Protocol.toLayer({
      double: ({ value }) => Effect.sync(() => value * 2),
    });
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* Calculator; // acquiring the capability alone must not connect
          assert.equal(connections, 0);
        }).pipe(
          Effect.provide(
            Capability.client(Calculator).pipe(
              Layer.provide(
                Testing.layer(Calculator.slot, handlers, {
                  onConnect: () => {
                    connections += 1;
                  },
                }),
              ),
            ),
          ),
        ),
      ),
    );
  });
});
```

The third test needs `Testing.layer` to accept an `onConnect` callback. Add it in this task: `Testing.layer(slot, handlers, options?)` where `options.onConnect` runs when a connection opens. Keep the two-argument form working.

- [ ] **Step 2: Run the test to watch it fail**

Run: `node --import tsx --test packages/sewed/test/capability.test.ts`
Expected: FAIL with `Capability is not exported` or `define is not a function`.

- [ ] **Step 3: Implement the capability definition**

Create `packages/sewed/src/Capability.ts`:

```ts
import { Context, Effect, Layer } from "effect";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Binding from "./Binding.ts";
import { ClientContext } from "./RuntimeContext.ts";

export interface Capability<Rpcs extends Rpc.Any, Key extends string = string>
  extends Context.Service<Capability<Rpcs, Key>, Binding.Client<Rpcs>> {
  readonly key: Key;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly slot: Binding.Slot<Rpcs, Key>;
}

export const define = <const Name extends string, Rpcs extends Rpc.Any>(
  name: Name,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Capability<Rpcs, `sewed/binding/${Name}`> => {
  const slot = Binding.slot(name, protocol);
  const tag = Context.Service<Capability<Rpcs, typeof slot.key>, Binding.Client<Rpcs>>(slot.key);
  return Object.assign(tag, { key: slot.key, protocol, slot }) as Capability<Rpcs, typeof slot.key>;
};

export const client = <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
  options: { readonly connection?: Binding.Connection } = {},
): Layer.Layer<Capability<Rpcs, Key>, never, ClientContext> =>
  Layer.effect(capability, Binding.deferred(capability.slot, options));
```

Export it from `packages/sewed/src/index.ts`: `export * as Capability from "./Capability.ts";`

- [ ] **Step 4: Run the test to watch it pass**

Run: `node --import tsx --test packages/sewed/test/capability.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Add the contract test**

Create `packages/sewed/test/capability-types.ts`:

```ts
import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Capability, type SewedError } from "sewed";
import { MainContext } from "sewed";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
);
const Calculator = Capability.define("calculator", Protocol);

// The capability's shape is the protocol's client shape.
export const call = Effect.gen(function* () {
  const calculator = yield* Calculator;
  const value: number = yield* calculator.double({ value: 1 });
  return value;
});

// The client Layer requires a client environment and provides the capability.
export const clientLayer: Layer.Layer<typeof Calculator["Service"] extends never ? never : never, never, never> =
  undefined as never;

// @ts-expect-error a client Layer cannot be built from main alone
export const wrong = Layer.provide(Capability.client(Calculator), Layer.succeed(MainContext, {} as never));
```

Replace the placeholder `clientLayer` line with the real assertion once the types exist: assert that `Capability.client(Calculator)` has type `Layer.Layer<typeof Calculator, never, ClientContext>` using the repository's existing `expectType` helper in `packages/sewed/test/types.ts`.

Run (repository root): `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/sewed/src/Capability.ts packages/sewed/src/index.ts packages/sewed/src/Testing.ts packages/sewed/test/capability.test.ts packages/sewed/test/capability-types.ts
git commit -m "feat: define capabilities with a client layer" -m "A capability is a Context service whose shape is its protocol's client shape, with the binding slot underneath. The client layer stays deferred, so acquiring the capability opens no connection." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: In-process dispatch for the native Layer

**Files:**
- Create: `packages/sewed/src/internal/CapabilityDispatch.ts`
- Create: `packages/sewed/test/capability-dispatch.test.ts`
- Modify: `packages/sewed/src/Capability.ts`

**Interfaces:**
- Consumes: `handlerLayer` from `./internal/HandlerLayer.ts`; Effect's handler entries, which `RpcServer` resolves from the built context under `rpc.key` and invokes as `entry.handler(payload, metadata)` with the entry's own context provided.
- Produces:
  ```ts
  export const fromHandlers: <Rpcs extends Rpc.Any, Key extends string, E, R>(
    capability: Capability<Rpcs, Key>,
    handlers: HandlerLayer<Rpcs, E, R>,
  ) => Layer.Layer<Capability<Rpcs, Key>, E | SewedError, R>;
  // The layer refuses to build when the protocol declares RPC middleware, which a native
  // in-process call cannot apply; that typed failure is why SewedError joins the error channel.
  ```

- [ ] **Step 1: Write the characterization test first**

This test pins how Effect exposes handlers, so the implementation cannot drift from the library.

Create `packages/sewed/test/capability-dispatch.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Context, Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.Unknown }, success: Schema.Unknown }),
);

describe("handler entries", () => {
  it("resolves one entry per rpc key and invokes it with the payload", async () => {
    const handlers = Protocol.toLayer({ echo: ({ value }) => Effect.succeed(value) });
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const services = yield* Layer.build(handlers);
          const rpc = Protocol.requests.get("echo")!;
          const entry = Context.getOrUndefinedUnsafe(services, rpc.key);
          assert.ok(entry, "an entry exists under the rpc key");
          const payload = { value: { marker: {} } };
          return yield* (entry.handler(payload, {
            rpc,
            requestId: "1",
            headers: {},
            client: undefined,
          }) as Effect.Effect<unknown>);
        }),
      ),
    );
    assert.deepEqual(result, { marker: {} });
  });
});
```

- [ ] **Step 2: Run it and record what Effect actually requires**

Run: `node --import tsx --test packages/sewed/test/capability-dispatch.test.ts`

If it fails, the failure names the missing metadata field or the real entry shape. Fix the test to match Effect's actual contract (not the implementation), rerun until it passes, and keep the corrected test. Record the resolved shape in a comment at the top of `internal/CapabilityDispatch.ts`.

- [ ] **Step 3: Write the failing test for the native Layer**

Append to `packages/sewed/test/capability.test.ts`:

```ts
it("calls handlers in-process without copying the payload", async () => {
  const Echo = Capability.define("echo", EchoProtocol);
  const marker = { instance: true };
  const handlers = EchoProtocol.toLayer({ echo: ({ value }) => Effect.succeed(value) });
  const value = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const echo = yield* Echo;
        return yield* echo.echo({ value: marker });
      }).pipe(Effect.provide(Capability.fromHandlers(Echo, handlers))),
    ),
  );
  assert.equal(value, marker, "the native layer returns the same reference, so nothing was encoded");
});

it("keeps handler failures typed", async () => {
  const Failing = Capability.define("failing", FailProtocol);
  const handlers = FailProtocol.toLayer({
    fail: () => Effect.fail(new SewedError({ code: "Protocol", message: "no" })),
  });
  const exit = await Effect.runPromise(
    Effect.exit(
      Effect.scoped(
        Effect.gen(function* () {
          const failing = yield* Failing;
          return yield* failing.fail({});
        }).pipe(Effect.provide(Capability.fromHandlers(Failing, handlers))),
      ),
    ),
  );
  assert.equal(exit._tag, "Failure");
});
```

Add `EchoProtocol` (payload `{ value: Schema.Unknown }`, success `Schema.Unknown`) and `FailProtocol` (payload `{}`, error `SewedError`) next to `Protocol` at the top of the file.

- [ ] **Step 4: Run it to watch it fail**

Run: `node --import tsx --test packages/sewed/test/capability.test.ts`
Expected: FAIL with `fromHandlers is not a function`.

- [ ] **Step 5: Implement in-process dispatch**

Create `packages/sewed/src/internal/CapabilityDispatch.ts` with a `dispatch` function that:
1. builds the handler layer with `Layer.build(handlerLayer(protocol, handlers))` in the Layer's scope;
2. for each tag in `protocol.requests`, resolves the entry under `rpc.key` from the built context, exactly as the characterization test pinned;
3. returns `Binding.methods(protocol, (tag, input) => ...)`, where the body invokes the entry's handler with the caller's value and provides the entry's context;
4. maps a missing entry to `SewedError` with code `Protocol` and the message `Capability <key> has no handler for <tag>`;
5. wraps a streaming success schema with `Stream.unwrap`, using `RpcSchema.isStreamSchema` as `Binding.deferredClient` already does.

Then add to `Capability.ts`:

```ts
export const fromHandlers = <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability<Rpcs, Key>,
  handlers: HandlerLayer<Rpcs, E, R>,
): Layer.Layer<Capability<Rpcs, Key>, E, R> =>
  Layer.effect(capability, CapabilityDispatch.dispatch(capability.protocol, handlers));
```

- [ ] **Step 6: Run the tests to watch them pass**

Run: `node --import tsx --test packages/sewed/test/capability.test.ts test/capability-dispatch.test.ts`
Expected: PASS, all tests. The reference-identity assertion proves no encoding happened.

- [ ] **Step 7: Commit**

```bash
git add packages/sewed/src/Capability.ts packages/sewed/src/internal/CapabilityDispatch.ts packages/sewed/test/capability.test.ts packages/sewed/test/capability-dispatch.test.ts
git commit -m "feat: run native capabilities in process" -m "The native layer resolves each handler entry from the built handler layer and calls it with the caller's value, so a main-side call pays no encoding. A characterization test pins Effect's handler entry contract." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Serving a capability to a document

**Files:**
- Modify: `packages/sewed/src/Capability.ts`, `packages/sewed/src/Host.ts`
- Modify: `packages/sewed/test/capability.test.ts`, `packages/sewed/test/capability-types.ts`

**Interfaces:**
- Produces:
  ```ts
  export const serve: <Rpcs extends Rpc.Any, Key extends string>(
    capability: Capability<Rpcs, Key>,
  ) => Effect.Effect<Binding.Owner<Rpcs>, SewedError, Capability<Rpcs, Key> | MainContext | Scope.Scope>;
  ```
  `Binding.to(capability.slot, owner)` binds it; a renderer entry declares `bindings: [Capability.declaration(capability)]`, which returns the slot.

- [ ] **Step 1: Write the failing test**

```ts
it("serves whichever layer provides the capability", async () => {
  const Calculator = Capability.define("calculator", Protocol);
  const handlers = Protocol.toLayer({ double: ({ value }) => Effect.succeed(value * 2) });
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Capability.serve(Calculator);
        const bound = Binding.to(Calculator.slot, owner);
        return yield* Effect.gen(function* () {
          const calculator = yield* Calculator;
          return yield* calculator.double({ value: 4 });
        }).pipe(
          Effect.provide(Capability.client(Calculator)),
          Effect.provide(Binding.layer([bound])),
        );
      }).pipe(
        Effect.provide(Capability.fromHandlers(Calculator, handlers)),
        Effect.provide(Testing.main),
      ),
    ),
  );
  assert.equal(result, 8);
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `node --import tsx --test packages/sewed/test/capability.test.ts`
Expected: FAIL with `serve is not a function`.

- [ ] **Step 3: Implement serve**

In `Capability.ts`:

```ts
export const serve = <Rpcs extends Rpc.Any, Key extends string>(capability: Capability<Rpcs, Key>) =>
  Effect.gen(function* () {
    const shape = yield* capability;
    const table = Binding.table(shape);
    return yield* host(
      capability.protocol,
      capability.protocol.toLayer(
        Object.fromEntries(
          [...capability.protocol.requests.keys()].map((tag) => [
            tag,
            (payload: unknown) => table[tag]!(payload),
          ]),
        ) as never,
      ),
    );
  });
```

The single `as never` is the same dynamic-table bridge `Binding.methods` already documents; keep the comment explaining the invariant.

- [ ] **Step 4: Run it to watch it pass**

Run: `node --import tsx --test packages/sewed/test/capability.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the declaration helper and its contract test**

Add `export const declaration = <Rpcs extends Rpc.Any, Key extends string>(capability: Capability<Rpcs, Key>): Binding.Declaration<Key> => capability.slot;` and a contract test asserting that `Renderer.entry(url, { bindings: [Capability.declaration(Calculator)] })` type-checks and that `window.webContents.load` rejects a binding list missing it.

Run (repository root): `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/sewed/src/Capability.ts packages/sewed/test/capability.test.ts packages/sewed/test/capability-types.ts
git commit -m "feat: serve a capability to bound documents" -m "serve hosts whichever capability layer is in scope, so the policy a native layer carries reaches renderers unchanged." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Move Shell onto the capability model

**Files:**
- Modify: `packages/sewed/src/Shell.ts` (add the capability), `packages/sewed/src/internal/Shell.ts` (native Layer), `packages/sewed/src/Testing.ts`
- Create: `packages/sewed/src/internal/CapabilityMemory.ts`
- Modify: `packages/sewed/test/surfaces.test.ts`, `packages/sewed/test/surfaces-types.ts`

**Interfaces:**
- Produces: `Shell.capability` (root, Electron-free), `Shell.native(options)` in `sewed/main`, `Shell.memory(options)` in `sewed/testing`.
- Removes: `Shell.make` and `handle.host`.

- [ ] **Step 1: Write the failing tests**

In `packages/sewed/test/surfaces.test.ts`, replace the Shell handle tests with capability tests that assert: an allowed URL opens, a URL outside the policy fails with `Protocol`, a path outside the roots fails with `Protocol`, and the memory Layer records calls. Use `Capability.fromHandlers` indirectly through `Shell.native` and `Shell.memory`, never through the removed handle.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `node --import tsx --test packages/sewed/test/surfaces.test.ts`
Expected: FAIL with `Shell.native is not a function`.

- [ ] **Step 3: Implement**

- In `Shell.ts` add `export const capability = Capability.define("shell", protocol);`
- In `internal/Shell.ts` keep the policy compilation and the operations, and replace `make` with:
  ```ts
  export const native = (options: Options): Layer.Layer<typeof Shell.capability, SewedError, MainContext> =>
    Capability.fromHandlers(Shell.capability, (implement) => Layer.effect(/* build operations, then */ implement({
      openExternal: ({ url }) => operations.openExternal(url),
      openPath: ({ path: target }) => operations.openPath(target),
      showItemInFolder: ({ path: target }) => operations.showItemInFolder(target),
      trashItem: ({ path: target }) => operations.trashItem(target),
    })));
  ```
  `beep` becomes an RPC in the protocol, so the capability covers the whole surface.
- Create `internal/CapabilityMemory.ts` with `memory(capability, handlers)`: it builds the same capability from handler functions the test supplies and adds a recorder service listing `{ tag, payload }` calls.
- In `Testing.ts` export `memory`.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `node --import tsx --test packages/sewed/test/surfaces.test.ts && pnpm typecheck`
Expected: PASS and exit 0.

- [ ] **Step 5: Update the playground and the docs for Shell**

In `../sewed-playground`, replace `Shell.make(...)` and `shell.host` with `Shell.native({ policy, paths })` provided to the program, and bind with `Binding.to(Shell.capability.slot, yield* Capability.serve(Shell.capability))`. Update `docs/desktop-surfaces.md` and `docs/api.md` for Shell only.

Run (playground): `pnpm build && pnpm check`
Expected: exit 0 for both.

- [ ] **Step 6: Commit**

```bash
git add packages/sewed/src/Shell.ts packages/sewed/src/internal/Shell.ts packages/sewed/src/internal/CapabilityMemory.ts packages/sewed/src/Testing.ts packages/sewed/test/surfaces.test.ts packages/sewed/test/surfaces-types.ts docs/desktop-surfaces.md docs/api.md
git commit -m "feat: make the shell a capability" -m "Shell.native carries the policy, Shell.memory records calls in tests, and serving the capability gives a renderer the same rules. Shell.make and shell.host are gone." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Move the remaining hosted surfaces

**Files:**
- Modify: `internal/NativeTheme.ts`, `internal/Clipboard.ts`, `internal/PowerMonitor.ts`, `internal/Notification.ts`, `internal/Cookies.ts`, their root modules, `Session.ts`, `Testing.ts`
- Modify: `packages/sewed/test/surfaces.test.ts`, `session-extras.test.ts`, `testing-types.ts`

**Interfaces:**
- Produces: `NativeTheme.capability` with `native({ allowSetSource })`, `Clipboard.capability` with `native(policy)`, `PowerMonitor.capability` with `native()`, `Notification.capability` with `native()`, `Cookie.capability` with `native(session, policy)`; each with a `memory` Layer in `sewed/testing`.
- Removes: `NativeTheme.host`, `Clipboard.host`, `PowerMonitor.host`, `Notification.host`, `Session.hostCookies`.

Follow Task 4's shape for each surface, one surface per commit, in this order: NativeTheme, PowerMonitor, Clipboard, Notification, Cookies. For each surface:

- [ ] **Step 1:** Rewrite its tests in `surfaces.test.ts` (or `session-extras.test.ts` for cookies) against `native` and `memory`, and run them to watch them fail.
- [ ] **Step 2:** Implement `capability` and `native`, keeping the existing policy checks and stream semantics unchanged.
- [ ] **Step 3:** Run its tests plus `pnpm typecheck` to watch them pass.
- [ ] **Step 4:** Update the playground wiring for that surface and run the playground's `pnpm build && pnpm check`.
- [ ] **Step 5:** Commit with the message `feat: make <surface> a capability`, the body naming what it replaces, and the trailer.

Keep the direct main operations that are not part of a protocol (`NativeTheme.current`, `PowerMonitor.state`, `Clipboard.read` and friends) exactly as they are: they are main-only queries, not the hosted path.

---

### Task 6: Window controls and guest tabs as served capabilities

**Files:**
- Modify: `packages/sewed/src/WindowControls.ts`, `internal/Window.ts`, `packages/sewed/src/GuestView.ts`, `internal/GuestView.ts`, `internal/GuestHost.ts`
- Modify: `packages/sewed/test/window-state.test.ts`, `guest-host.test.ts`, `window-extras-types.ts`, `guest-types.ts`

**Interfaces:**
- Produces: `WindowControls.capability` and `GuestView.tab` (the capability for a guest's hosted tab), plus `Capability.serve(capability, { of: owner })` for per-owner capabilities.
- Removes: `window.controls` and `guest.host(policy)`.

- [ ] **Step 1: Write the failing tests**

Assert that `Capability.serve(WindowControls.capability, { of: window })` produces an owner whose client drives that exact window, that two windows produce distinct owners, and that a closed window's client fails with `Closed`. For guests, assert that the host policy still gates `navigate` and `capture`.

- [ ] **Step 2: Run them to watch them fail**

Run: `node --import tsx --test packages/sewed/test/window-state.test.ts test/guest-host.test.ts`
Expected: FAIL with `serve does not accept an owner option`.

- [ ] **Step 3: Implement the per-owner overload**

Extend `serve` with `{ of }`: when given, it builds the handlers from that owner's own operations instead of from the capability in scope. The window and guest modules supply their handler builders, which already exist behind `window.controls` and `guest.host`.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `node --import tsx --test packages/sewed/test/window-state.test.ts test/guest-host.test.ts && pnpm typecheck`
Expected: PASS and exit 0.

- [ ] **Step 5: Migrate the playground**

Replace `Binding.to(Controls, window.controls)` with the served capability, and `guest.host({...})` with `Capability.serve(GuestView.tab, { of: guest, policy })`.

Run (playground): `pnpm build && pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/sewed/src/WindowControls.ts packages/sewed/src/internal/Window.ts packages/sewed/src/GuestView.ts packages/sewed/src/internal/GuestView.ts packages/sewed/src/internal/GuestHost.ts packages/sewed/test
git commit -m "feat: serve window controls and guest tabs as capabilities" -m "A per-owner capability replaces window.controls and guest.host, so every surface a renderer reaches is one concept." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Documentation, reference, and native proof

**Files:**
- Modify: `docs/api.md`, `docs/desktop-surfaces.md`, `docs/window-controls.md`, `docs/guest-views.md`, `docs/testing.md`, `docs/sessions.md`, `docs/electron-coverage.md`, `README.md`, `packages/react/README.md`, `docs/reference.md`
- Modify (playground): the remaining renderer hooks and `verify:*` fixtures that name a slot

- [ ] **Step 1: Rewrite the guides**

Replace every "handle plus host" explanation with the capability model: one contract, `native`, `client`, `memory`, and `serve`. State the rule that a native capability performs no encoding, and that policy travels with the native Layer.

- [ ] **Step 2: Regenerate the reference and check the site**

Run: `pnpm build && pnpm test && pnpm website:build`
Expected: all exit 0, and `docs/reference.md` shows `Capability` with `define`, `client`, `fromHandlers`, `serve`, and `declaration`.

- [ ] **Step 3: Prove it natively**

In the playground, run the full harness on the isolated display:

```sh
cd ../sewed-playground
SEWED_XVFB_TIMEOUT=3600 SEWED_XVFB=$PWD/.artifacts/ui-tools/xvfb.sh SEWED_WINDOW_MANAGER=$PWD/.artifacts/ui-tools/openbox.sh \
  python3 scripts/with-xvfb.py dbus-run-session -- pnpm verify:all
```

Expected: every fixture passes. A failure here is a real regression: fix it before the commit.

- [ ] **Step 4: Record the wave**

Add a "Wave 11" paragraph to `docs/electron-coverage.md` describing the capability model, what it replaced, and the native evidence.

- [ ] **Step 5: Commit**

```bash
git add docs README.md packages/react/README.md
git commit -m "docs: describe the capability model" -m "The guides, the reference, and the coverage record now describe one contract per surface with native, client, memory, and serve." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: section A of the spec maps to Tasks 1 to 6; its "Replaces" list is covered except the session free functions, which the scope section defers to the decisions plan with a reason.
- The only casts are the two dynamic-table bridges that already exist in `Binding.ts`, named in the Global Constraints.
- Task 2's characterization test exists because Effect's handler entry shape is library behavior this plan depends on; the test pins it rather than assuming it.
- Every task ends with the native or node evidence that proves it, and Task 7 runs the full native harness before the wave is recorded.
