# Fully on Sewed, Wave 2: Hooks That Wait, Refusals That Say So

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React tree that also ships as a plain web page calls every Sewed hook unconditionally: while the runtime is connecting the hooks wait, when it is unavailable they fail typed, and when it becomes ready they start for real with no remount. Code outside React can cancel what it started. A payload the client's own schema refuses is a typed failure that names the operation and the path. A renderer module is tested over in-process hosts with no seam of its own.

**Architecture:** The runtime store carries its runtime as an Effect that waits, succeeds or fails; every hook memoizes on the store and runs its work under that future runtime, so the runtime context and its throwing accessor go away. One core helper builds a client whose context resolves per call. One catch at the client's invoke turns a schema refusal into `Protocol`. A testing subpath of the React package builds the same store over in-process hosts.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), React 19.2, Electron 44.3.0, `node:test`.

**Spec:** `request-react-runtime-not-ready.md` (§1–§4) and `request-testing-surface-gaps.md` §1 in Jobwright's durable directory, as consolidated in `request-fully-on-sewed.md` (R1, R2, R3, T1), and the rulings below. Evidence: the scout's findings recorded in the wave-2 ledger (Effect's `RpcClient.js:321` `Effect.orDie` on payload encode; `RpcServer.js:439-452` shipping a success-schema refusal as a wire `Defect`; `Binding.ts:388-393` rewriting typed transport errors only).

## Global Constraints

- Commands run from the repository root: `pnpm build`, `pnpm typecheck`, `timeout 300 pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm docs:reference`, and one file with `node --import tsx --test --test-timeout=20000 packages/<pkg>/test/<file>.test.ts`.
- Effect stays at `4.0.0-rc.115`. Add no dependency to any package in the repository; `react-dom/server` is already installed and may be used by a test.
- The root package (`sewed`) imports no Electron module, no `node:` module, and reads no environment at the top level. `@sewed/react` uses external-store subscriptions only: no `useEffect`, no `useLayoutEffect`, in the adapter or in what it tells consumers to write.
- No `any`; no `as` beyond `as const` and `import * as` in `packages/*/src` (pre-existing documented bridges in `Binding.ts`'s `methods`/`table` excepted); no non-null assertions. A `*-types.ts` may use `undefined as unknown as Handle`; a `*.test.ts` may use `as never`.
- `*.test.ts` files are never type-checked; type claims live in `*-types.ts` / `types.ts`, and every `@ts-expect-error` is proven to bite after `pnpm format`.
- A test that forks work waits on a positive condition and bounds the wait; never a fixed sleep as a barrier.
- A JSDoc block must not contain `*/` before its end; every JSDoc body line starts with `*`.
- Breaking changes are allowed; no aliases; each removal pinned by a negative contract assertion.
- One writer in the worktree. Stage only your own paths; never `git add -A`. Checkpoint with a commit as soon as the focused suite is green. Never push. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Rulings

1. **Hooks run under the store's future runtime.** `RuntimeStore` gains `runtime: Effect<Context<Services>, SewedError>` — it succeeds at once when the store is ready, waits while it is connecting, and fails `Closed` carrying the cause when it is unavailable. Every hook memoizes its own store on the `RuntimeStore` (stable across the three states) and runs its work as `Effect.flatMap(store.runtime, (context) => Effect.provideContext(work, context))`. So `useStream` answers `loading` while connecting and `failure` with the `Closed` cause when unavailable; `useResource` the same; `useAction` answers `idle`, and `run` starts a `running` invocation that proceeds once ready or fails `Closed`; `useClient` answers operations whose every call waits while connecting and fails `Closed` when unavailable, with one identity across the three states. When the store becomes ready the waiting work starts: no remount, the hook count never changes. The `Runtime` context and `useRuntime`'s throw are deleted; `RuntimeProvider` provides the store alone; `mount` provides a store that is ready at once. The hooks' failure types widen to `E | SewedError`, because the hook itself can fail for want of a runtime. Cost if wrong: a tree that wants to render nothing until ready still reads `useRuntimeStatus`.
2. **`RuntimeStore.run(effect, { signal })` interrupts what it started.** An `AbortSignal` is the web's own cancellation handle and what the consumer bridged by hand; when it aborts, the fiber is interrupted and the host's stream finalizers run. The promise then rejects with the interruption. Cost if wrong: none measured; an options object that only ever carries `signal` is still the smallest honest shape.
3. **A payload the client's own schema refuses fails `Protocol`, naming the operation and the path, before anything is sent.** Effect's client encodes the payload and `orDie`s a `SchemaError` (`RpcClient.js:321`); Sewed's `invoke` wraps the call where the operation tag is in scope (`Binding.ts:388-393`) and rewrites only typed transport errors. It now also catches a defect that is a `SchemaError` and fails `SewedError({ code: "Protocol", message: \`${tag}: ${issue}\` })`, where the issue is Effect's own formatting and already names the path and the expectation (`Expected string at ["name"]`). A host value its own success schema refuses STAYS a defect: the host's bug is not the caller's, and the wire cannot tell that refusal from a handler's own die (`RpcServer.js:439-452`ships both as a`Defect` string). The guide says both, beside the three Layers, and says that a payload-less operation is called with no argument. Cost if wrong: a consumer who wanted a defect for a bad payload catches a typed error instead.
4. **`store(bindings)` from `@sewed/react/testing` is the `RuntimeStore` over in-process hosts.** It builds `Binding.clientContext(bindings)` and a renderer identity in one scope, answers `ready` at once, runs `run` and the hooks over that context exactly as `connect` does, and `close()` closes the scope. The renderer identity comes from a new `Testing.renderer` Layer in `sewed/testing`, beside `Testing.main`: a test asserts placement by providing the identity, which is what `Testing.main` already does. It is a subpath of the React package, not of `sewed/testing`, because the store's shape is the adapter's. Cost if wrong: one entry point.

## What the consumer writes

```tsx
// the same tree as a desktop and as a plain web page — no gate, no seam
function Status() {
  const session = useClient(Session); // stable; calls wait or fail Closed
  const owners = useStream(() => session.changes(), [session]);
  if (owners.status === "loading") return <Spinner />;
  if (owners.status === "failure") return <Offline cause={owners.cause} />;
  return <Owners value={owners.value} />;
}

// outside React
const controller = new AbortController();
void store.run(program, { signal: controller.signal });
controller.abort(); // the stream's host finalizers run

// a renderer module test, over in-process hosts
import { store } from "@sewed/react/testing";
const desktop = store([
  Binding.to(Client.capability.slot, yield * Testing.host(Client.protocol, handlers)),
]);
render(<RuntimeProvider store={desktop}>…</RuntimeProvider>);

// a refused payload
const exit = yield * Effect.exit(client.conversationTurn({ text: undefined }));
// SewedError { code: "Protocol", message: 'conversationTurn: Expected string at ["text"]' }
```

## File Structure

- Modify: `packages/sewed/src/Binding.ts` — the `SchemaError` catch in `invoke`; `pending(slot, { context, connection })`.
- Modify: `packages/sewed/src/Testing.ts` — `renderer`.
- Modify: `packages/react/src/internal/Connection.ts` (`runtime`, `run` with `signal`, `staticStore`), `Action.ts` and `Resource.ts` (a runtime Effect instead of a context), `index.tsx` (hooks over the store; the `Runtime` context deleted).
- Create: `packages/react/src/testing.ts`; `packages/react/package.json` gains the `./testing` export.
- Tests: `packages/sewed/test/binding.test.ts` (or the file that already drives `invoke`), `testing.test.ts`, `binding-types.ts`; `packages/react/test/connection.test.ts`, `resource.test.ts`, a new `hooks.test.tsx` over `react-dom/server`, `testing.test.tsx`, `types.ts`.
- Docs: `packages/react/README.md`, `docs/api.md` (the React paragraph; the client-refusal sentence; the pairing rule), `docs/testing.md` (the store; the refusal beside the Layers), `docs/reference.md` (generated), the spec and `docs/electron-coverage.md` (Task 4).
- Playground: `src/renderer/lib/sewed.tsx` loses `DesktopGate`; a small feature that renders every hook ungated and reports each state in the DOM; `scripts/verify.mjs` asserts connecting → ready with no remount (a render counter) and a plain page's typed failure.

---

### Task 1: The core — a refused payload says so, a client whose context arrives later, a renderer identity for tests

**Files:** modify `packages/sewed/src/Binding.ts`, `packages/sewed/src/Testing.ts`; tests as above; docs `docs/api.md`, `docs/testing.md`.

- [ ] **Step 1: Read** `Binding.ts` 350–435 (`RpcClient.make`, `invoke`, `transportFailure`, `deferredClient`, `deferred`), `packages/sewed/test/testing.test.ts` 150–185 (the host-side defect pin), Effect's `Schema.js` `SchemaError` (`_tag`, `issue`, `message`), and `RpcClient.js:321`.
- [ ] **Step 2: Failing tests.** Over `Testing.client` (the real wire): a call whose payload violates its schema fails with `SewedError` `Protocol` whose message starts with the operation tag and contains the issue's path; the host never ran (a counter); the host-side success refusal test keeps asserting a defect and its message. Over `Binding.pending`: a client built over a context Effect that has not resolved parks its call until the Effect resolves (a `Deferred`), then dispatches; one whose Effect fails `Closed` fails every call `Closed` with that cause; the operations object is the same identity before and after.
- [ ] **Step 3: Implement.** In `invoke`: catch the defect (`Effect.catchDefect`/`Effect.catchCause` with `Cause.findDieOption`, whichever the codebase's idiom is) — a `SchemaError` becomes `Protocol` `${tag}: ${error.message}`; any other defect stays a defect. `deferredClient(binding, context: Effect<ClientContext["Service"], SewedError>, connection)` — each call `Effect.flatMap`s the context first; `deferred` passes `Effect.succeed(context)`; `export const pending = (slot, options: { context: Effect<ClientContext["Service"], SewedError>; connection?: Connection }): Client<Rpcs>`. `Testing.renderer = Layer.succeed(RendererContext, rendererIdentity)`.
- [ ] **Step 4: Contracts.** `binding-types.ts`: `Binding.pending(slot, { context })` is `Client<Rpcs>`; a call's error type includes `SewedError`. `testing-types.ts`: `Testing.renderer` is `Layer<RendererContext>`.
- [ ] **Step 5: Docs and commit.** `docs/api.md`'s `Renderer.entry` paragraph gains the pairing rule in one sentence (the declared and served capability sets must match exactly, or the handshake fails as a whole) and the refusal sentence; `docs/testing.md` beside the Layers table: a payload the client refuses is `Protocol` naming the operation and the path; a host's own value its schema refuses is a defect; an operation with no payload is called with no argument. Commit: `fix(binding): a refused payload fails Protocol naming the operation; a client may wait for its context`.

---

### Task 1b: Two tests the review asked for

Task 1's review verified two behaviours by probe that no test pins: a refused payload on a STREAM-shaped operation fails the stream typed (`Stream.fail(Protocol)`, host never runs), and a `per-call` connection works through `Binding.pending`. Add both as tests, mirroring `testing.test.ts`'s refusal test and `shared-connection.test.ts`'s per-call test (the reviewer's probes under `.artifacts/review-wave-2-task-1/` show the shapes). No source change. Commit: `test(binding): a stream's refused payload fails typed, and a pending client opens per call`.

### Task 2: The adapter — hooks that wait, a run that cancels

**Files:** modify `packages/react/src/internal/Connection.ts`, `Action.ts`, `Resource.ts`, `index.tsx`; tests `connection.test.ts`, `resource.test.ts`, new `hooks.test.tsx`, `types.ts`; docs `packages/react/README.md`, `docs/api.md`; playground as above.

- [ ] **Step 1: Read** every file under `packages/react/src`, the two existing tests, `types.ts`, and the playground's `src/renderer/lib/sewed.tsx`, `app/desktop-context.tsx` and `scripts/verify.mjs` (how it drives the renderer over CDP).
- [ ] **Step 2: Failing tests.** `connection.test.ts`: `store.runtime` waits while connecting and succeeds once ready (a fake bridge as the file already builds); fails `Closed` with the cause when unavailable; `run(effect, { signal })` — a stream whose host finalizer records its release, aborted mid-way, rejects with an interruption and the finalizer ran (bounded wait). `hooks.test.tsx` over `react-dom/server`'s `renderToString` with a `RuntimeProvider` around a component that calls `useClient`, `useStream`, `useAction` and `useResource`: renders without throwing under a connecting store (states `loading`/`idle`) and under an unavailable store (`failure` with a `Closed` cause; the action's `run` fails `Closed`); the hook count is the same in both (React would throw otherwise — assert the render succeeds twice with the same tree). `resource.test.ts`: the owner takes a runtime Effect; a failing runtime yields `failure` with the `Closed` cause.
- [ ] **Step 3: Implement.** `Connection.ts`: `RuntimeStore.runtime`; `run(effect, options)` forks with `Effect.runForkWith`, `signal.addEventListener("abort", () => fiber.interruptUnsafe(), { once: true })`, and resolves the promise from the fiber's exit (`Effect.runPromiseExit`-shaped: an interruption rejects); `staticStore` and `connect` implement `runtime`; `mount`'s store holds the mount context. `Action.ts`/`Resource.ts`: `make(runtime: Effect<Context<Services>, SewedError>)` and run under it. `index.tsx`: delete `Runtime`/`useRuntime`; each hook reads the store from `StatusStore` and memoizes on `[store, …deps]`; `useClient` = `useMemo(() => Binding.pending(slot, { context: Effect.map(store.runtime, (c) => Context.get(c, ClientContext)), connection }), [store, slot, connection])`; state types `StreamState<A, E | SewedError>` etc.
- [ ] **Step 4: Contracts.** `types.ts`: the hooks' failure types include `SewedError`; `RuntimeProvider` takes a store; `store.run(effect, { signal })` compiles and `run(effect, { signal: "x" })` is `@ts-expect-error`; `store.runtime` is `Effect<Context<…>, SewedError>`. A negative pin that `useRuntime` no longer exists is not expressible for a private symbol; pin instead that the package's exports are exactly the documented list (an `Equal<keyof typeof import, …>` shape as `capability-types.ts` does).
- [ ] **Step 5: Playground.** Remove `DesktopGate` from `src/renderer/lib/sewed.tsx`; add a feature lane that calls the four hooks ungated and renders each state's `status` plus a render counter into data attributes; `scripts/verify.mjs`: assert the lane reports `loading`/`idle` before the handshake completes (read once early) and `value`/`ready` after, with the counter monotonic and the same DOM node (no remount: the node keeps a random id it minted on first render); under `verify:dx`'s plain-page build (no preload), assert `failure` and that the page rendered. Pack, reinstall, `verify`, `verify:dx`.
- [ ] **Step 6: Docs and commit.** README: the states each hook answers, the no-gate example, `signal`; `docs/api.md`'s React paragraph. Regenerate the reference. Commit: `feat(react): hooks wait for the runtime and fail typed without it; run takes a signal`.

---

### Task 3: The testing store

**Files:** create `packages/react/src/testing.ts`, `packages/react/test/testing.test.tsx`; modify `packages/react/package.json`, `packages/react/tsconfig*.json` if the entry needs listing, `packages/react/README.md`, `docs/testing.md`.

- [ ] **Step 1: Read** `Testing.layer` and `Testing.client` in `packages/sewed/src/Testing.ts` (how a host is built and bound), `Binding.clientContext`, and Task 2's `Connection.ts`.
- [ ] **Step 2: Failing test.** `testing.test.tsx`: `store([Binding.to(slot, host)])` over `Testing.host` answers `ready` at once; `store.run` reaches the host; a component rendered with `react-dom/server` under `RuntimeProvider` with `useClient`+`useStream` renders the host's value after the stream's first element (drive the stream to a value through `store.run` first, then render — or render a component whose `useStream` reads a `Stream.succeed`); `close()` releases the host (the host's scope finalizer ran).
- [ ] **Step 3: Implement.** `store(bindings, options?: { readonly onConnect?: () => void }): RuntimeStore` — one `Scope.makeUnsafe`, `clientContext(bindings)` + `Testing.renderer` provided, `runtime = Effect.succeed(context)`, `close` closes the scope and publishes `unavailable`. Export `./testing` from `package.json` (types + import), and make the build emit it.
- [ ] **Step 4: Docs and commit.** README: "Testing a renderer module"; `docs/testing.md`: the store beside the Layers table (it dispatches over the real wire? — say exactly which: it uses `Binding.to` over an in-process host, the same as `Testing.layer`, so it proves encoding). Commit: `feat(react): a runtime store over in-process hosts, for a renderer module's tests`.

---

### Task 3b: The vite package's peers and its notice

Two packaging defects the first consumer found on adopting `resolveElectron` (`request-fully-on-sewed.md`, V1 and V2): `@sewed/vite` lists `typescript` and `vite` as required peers, so a Node tool that imports only the resolver gets an unmet-peer warning and Vite installed beside it; and its tarball's NOTICE names `THIRD_PARTY_LICENSES.md`, which the tarball does not contain — and neither do `@sewed/react`, `@sewed/forge`, `@sewed/devtools` or `create-sewed`, whose NOTICE says the same. Only `sewed` ships the file.

**Files:** modify `packages/vite/package.json` (`peerDependenciesMeta`: `typescript` and `vite` optional, beside `electron`), `packages/{react,vite,forge,devtools,create}/package.json` (`files` gains `THIRD_PARTY_LICENSES.md`), create the file in each of those five packages as a copy of the root's, and extend `scripts/release.mjs`'s `check` so that every package whose NOTICE names `THIRD_PARTY_LICENSES.md` ships it and the copy matches the root's byte for byte — a regression here fails `pnpm test`. Docs: `docs/development.md` — one sentence that a tool importing only `resolveElectron` needs neither Vite nor TypeScript installed (both peers are optional; the plugin itself needs both and says so when one is missing).

- [ ] Reproduce V1 first: in a scratch directory under `.artifacts/wave-2/peer-probe/` with a `package.json` that depends on the packed `@sewed/vite` tarball only (`node scripts/release.mjs pack .artifacts` from the worktree; `file:` dependency), run `pnpm install` and record the unmet-peer line and whether `vite` lands in `node_modules`; after the fix, re-pack and re-run: no warning, no `vite`. Keep both logs.
- [ ] Reproduce V2: `tar -tzf .artifacts/sewed-vite-0.0.0-prototype.50.tgz | grep -c THIRD_PARTY` is 0 before, 1 after, for each of the five tarballs.
- [ ] `release.mjs check` fails when a copy is removed (record it), passes after.
- [ ] Commit: `fix(packaging): optional Vite and TypeScript peers, and the third-party notice every tarball names`.

### Task 4: Record, sweep, hand-back

- [ ] **Step 1:** Spec entries 42–45 for rulings 1–4 in the voice of entries 38–41; the closing record; `docs/electron-coverage.md` needs no row (no Electron surface) — say so in the wave paragraph. Commit the plan file with it.
- [ ] **Step 2:** `pnpm build && pnpm docs:reference && pnpm format:check && timeout 300 pnpm test && pnpm website:build`; pack; reinstall the playground; `verify`, `verify:dx`, `verify:binary`, `verify:app`.
- [ ] **Step 3:** The hand-back is the controller's: `fully-on-sewed-handback.md`, installment 2, naming the commit.

---

## Self-review

- **Requests covered.** R1 (Task 2), R2 (Task 2), R3 (Task 1, with the host-side ruling), T1 (Task 3), the react request's §4 doc lines (Task 1 Step 5), V1 and V2 (Task 3b).
- **Type consistency.** `RuntimeStore.runtime`, `run(effect, { signal })`, `Binding.pending(slot, { context, connection })`, `Testing.renderer`, `store(bindings)` from `@sewed/react/testing`, `StreamState<A, E | SewedError>` are spelled identically throughout.
- **Ordering.** Task 1 first (Task 2 uses `Binding.pending`); Task 3 after Task 2 (it builds the store Task 2 shapes); Task 3b any time after Task 1, under the one-writer rule. One writer, in order.
