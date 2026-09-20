# Hardening and the Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bytes are recognized by what they are rather than by which realm made them; both ends of a capability have a type a consumer can write; and an application's entry fails loudly when it declares too late, creates the directories it declares, exits with an exact code, reads the OS languages before readiness, and can grant the shell a path the user just chose.

**Architecture:** One realm-agnostic predicate replaces every `instanceof Uint8Array`, and bytes are re-viewed into the packer's realm before MessagePack sees them. Two type aliases name a capability's operations and its handler record. `Declarations.apply` learns whether Electron is ready and how to create a directory, through the same structural-native seam the walker already has. `App.exit(code)` threads an exit code through the existing shutdown request so the application scope closes first. A shell grant is a main-only service the native Layer provides beside the capability, so no operation a renderer can call widens its own policy.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), Electron 44.3.0, `node:test`.

**Spec:** Jobwright's request files in `/home/lucas/personal/projects/jobwright/experiments/jw-sewed-phase-4-20260920/.superpowers/sewed-01/` — `request-testing-surface-gaps.md` (§2, §4, §5 docs, §6) and `request-desktop-shell-gaps.md` (§A1's remainder, §A2's second half, §B5) plus their later message (directories for `Paths.declare`; `App.exit(code)`) — and the rulings below. Evidence: `.artifacts/probe-hardening/PROBE_REPORT.md` and `.artifacts/probe-hardening/CODE_MAP.md` (both git-ignored, in this worktree), `.artifacts/probe-ready/PROBE_REPORT.md`.

## Global Constraints

- Commands run from the repository root: `pnpm build`, `pnpm typecheck`, `timeout 300 pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm docs:reference`, and one file with `node --import tsx --test --test-timeout=20000 packages/sewed/test/<file>.test.ts` (`--test-timeout=60000` for `bulk.test.ts`). Node has no default test timeout.
- Effect stays at `4.0.0-rc.115`. Add no dependency to any package in the repository. A probe may install what it needs in its own directory under `.artifacts/`.
- The root package (`sewed`) imports no Electron module, no `node:` module, and reads no environment at the top level: `Binary.ts`, `Capability.ts`, `internal/Transport.ts`, `internal/BinaryWire.ts`, `internal/Bytes.ts`, `Runtime.ts`, `internal/Declarations.ts`, `internal/ShellPolicy.ts` run in renderers or are Electron-free by rule. `node:fs` may be imported only by a `sewed/main` module that already imports `electron` (`Paths.ts`, `App.ts`) and by `@sewed/forge`.
- No `any`; no `as` beyond `as const` and `import * as` in `packages/*/src` (pre-existing documented bridges excepted); no non-null assertions. A `*-types.ts` may use `undefined as unknown as Handle`; a `*.test.ts` may use `as never` to hand a runtime assertion an invalid value.
- `*.test.ts` files are never type-checked; type claims live in `*-types.ts`, and every `@ts-expect-error` is proven to bite (strip it, run the `tsc -p`, read the error, restore). After `pnpm format`, re-run `tsc -p`: oxfmt can reflow a line and detach a directive.
- A test that forks work waits on a positive condition and bounds the wait; never a fixed sleep as a barrier. In-process `pair()` delivers synchronously: a test about "between parts" uses `bulk.test.ts`'s `tap.hold`.
- A JSDoc block must not contain `*/` before its end; every JSDoc body line starts with `*`. Doc comments on public exports regenerate into `docs/reference.md`.
- Breaking changes are allowed; no aliases; each removal pinned by a negative contract assertion.
- One writer in the worktree. Stage only your own paths; never `git add -A`. Checkpoint with a commit as soon as the focused suite is green. Never push. Commit messages end with:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BVPFknzuoDTJ9NkEJGWesy
  ```

## Rulings

1. **Bytes are recognized by one predicate, everywhere: `ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]"`.** Probed: it accepts a `Uint8Array` from either realm and a Node `Buffer`, and rejects a `Uint8ClampedArray`, a `DataView`, a plain object with a spoofed `Symbol.toStringTag`, and a `Proxy` over a `Uint8Array` (`ArrayBuffer.isView` reads the internal slot). `constructor.name` was rejected: it refuses `Buffer`. `instanceof` is what failed — Effect's `Schema.Uint8Array` is `instanceOf(globalThis.Uint8Array)`, so under vitest's jsdom the bytes msgpackr returns (Node's realm) fail `Binary.Bytes`, and the owner's bulk check would disconnect an honest client. `Binary.Bytes`, the `Packet` and `RequestPart` envelopes, `bulkField`, `sizeOf` and `concat` all use the predicate. Cost if wrong: none measured; the predicate is two internal-slot reads.
2. **Bytes are re-viewed into the packer's realm before MessagePack sees them.** Probed: msgpackr dispatches on `instanceof` too, and packs a foreign-realm `Uint8Array` as a MAP of indices, not `bin` — silently, and four times the size. `new Uint8Array(value.buffer, value.byteOffset, value.byteLength)` is a zero-copy view in the current realm over the same memory. Where that re-view happens is settled by Task 1's first step, a reproduction under real vitest + jsdom in both directions: the node:vm model proves the mechanism, not which realm each side is in under vitest's mutated global. If the reproduction shows the encode side is unaffected there, the re-view still lands at the one place bytes enter the packer, because it costs one allocation-free view and closes the class.
3. **`Testing.host` does not erase its requirement; Effect's `RpcGroup.HandlersFrom` does.** The emitted declaration is `Effect<Owner<Rpcs>, E, R | MainContext | Scope>`, and every call site in Sewed's suite infers a concrete `R`. `HandlersFrom<Rpcs>` types each handler's requirement as `any`, so a record annotated with it makes `toLayer` extract `R = any`, and the union collapses. Sewed's part of the fix is the type a consumer lacked: `Capability.Implementation<C, R = never>`, a capability's handler RECORD with a real requirement, and `Capability.Client<C>`, its operations. Task 2 first reproduces the `any` with `HandlersFrom` in a contract file, then shows the new type yields `never`. Cost if wrong: two type aliases.
4. **`App.run` fails `Startup` when it declares after Electron is ready.** Probed (`.artifacts/probe-ready`): too late, only scheme registration throws; `--lang`, `setPath` and `setAppUserModelId` apply silently and do nothing. The walker takes `isReady` through its options and refuses a non-empty list when it answers true, before applying anything. An empty list after readiness is allowed: it declares nothing. No "hold readiness" API and no `() => Promise<Declaration>` entry: an ES-module entry's top-level await is the hold, and nothing else is (already settled and recorded; the first consumer reported no residual).
5. **A declared directory exists when the program starts.** `Paths.declare` and `CrashReporter.declare` create each declared directory, recursively and synchronously, before setting it; `exe` and `module` name files and are not created. Probed on Electron 44.3.0/Linux: `app.setPath` to a missing LEAF directory does not throw for six path names, and a relative path always throws. The consumer reported a bare `ENOENT` naming "paths" on the same Electron version, so Task 3's first step reproduces what actually fails — several missing parent levels, and `crashReporter.start` with a missing `crashDumps` — and the guide states that, not a guess. The ruling does not depend on the outcome: the step-3 entry shape removed the caller's chance to `mkdir` asynchronously, and "declared, therefore present" is a guarantee every composition otherwise writes by hand. Cost if wrong: a consumer who wanted a declared path to stay absent has no way to say so.
6. **`App.exit(code)` closes the application scope and then exits with exactly that code, bypassing the quit decider.** Probed: `app.exit(n)` fires no `before-quit`, `will-quit` or `quit`, and NOTHING scheduled after it runs — not the synchronous continuation, not a microtask — so finalizers must complete before it is called; and `process.exitCode` is overridden by `app.quit()`. So the code rides the existing shutdown request: the run loop's race completes, the scope closes, and `onExit` calls `app.exit(code)` as its last statement. It bypasses `App.Quit` because Electron's own `app.exit` does, and because a launcher that must answer 0 or 1 cannot be vetoed by a feature's unsaved-changes guard. `code` is an integer from 0 to 255. Cost if wrong: a consumer who wanted the quit decider consulted calls `App.quit`.
7. **`App.preferredSystemLanguages()` is synchronous, and that is deliberate.** Probed before readiness: `getPreferredSystemLanguages()` is safe and meaningful (`["fr"]` under `LANGUAGE=fr`); `getSystemLocale()` throws; `getLocale()` answers `""`. It is an input to a declaration thunk, read before any Effect runs, so it is a plain function, not an Effect; it returns the OS values as they are (a POSIX `C` locale answers `["c"]`), and mapping one to a `--lang` value is the application's. Cost if wrong: one function that is not an Effect in a namespace of Effects.
8. **A shell grant is a main-only, scoped service, never an operation.** `Shell.native(options)` provides `Shell.Grants` beside the capability; `grants.allow(path)` admits one absolute path — a file, or a directory and what is under it — for the caller's scope, under the same containment rule as `paths`, and closing the scope removes it. `Capability.serve(Shell.capability)` serves the protocol's operations only, so a renderer has no route to it: the policy a document is under can be widened by main alone. `Testing.Shell.memory` provides the same service. `trashItem` honours a grant exactly as it honours a root, since a grant is a root with a lifetime. Cost if wrong: a consumer wanting a per-call path writes a two-line scope.

9. **An install that names the resource type `other` makes the native filter unrestricted by type.** Probed on Electron 44.3.0 (`.artifacts/probe-types-other`): a native `types` list containing `"other"` THROWS (`TypeError: Invalid type other`), which is why `unionFilter` strips it; an EMPTY list delivers every type; and a non-empty list genuinely restricts. The strip therefore left a fail-open: with one install for `types: ["other"]` and another for `types: ["image"]`, Electron is handed `{ urls, types: ["image"] }`, a request it labels `other` (a `<link rel="prefetch">`) never reaches Sewed, and the `other` decider is silently never consulted. Electron cannot express `other`, so the only sound native filter once any install asks for it is "every type"; the per-install matcher, which already knows `other`, does the narrowing. The union moves into the Electron-free `internal/RequestStages.ts` so the unit suite pins it. Cost if wrong: a stage with an `other` install pays for delivery of every type to main.

10. **A registration Electron refuses leaves the stage's other deciders installed, positively.** When a new install makes `webRequest.on…` throw, `intercept` rolls back its own bookkeeping and then RE-REGISTERS the native listener for the surviving installs, rather than assuming Electron validated before it swapped. That assumption is proven only for a `types` list naming `"other"`; Task 1c probes it for a bad `urls` pattern and records which patterns Sewed's matcher accepts and Electron refuses. One bad install must never be able to silence every other decider on its stage. Cost if wrong: one redundant registration on a failure path.

## What the consumer writes

```ts
// entry — declared, therefore present; too late, therefore loud
App.run(
  [
    () => CommandLine.declare({ name: "lang", value: toChromiumLang(App.preferredSystemLanguages()) }),
    Paths.declare({ sessionData: paths.session, logs: paths.logs }), // created if missing
    CrashReporter.declare({ directory: paths.crashes, uploadToServer: false }),
  ],
  program,
);

// program — an exact exit code, after finalizers
if (handedOff) return yield* App.exit(0);
if (!(yield* afterQuitWait)) return yield* App.exit(1);

// program — reveal what the user just saved, wherever they saved it
const saved = yield* Dialog.save(window, { defaultPath: "diagnostics.zip" });
if (saved.kind === "selected") {
  const grants = yield* Shell.Grants;
  yield* grants.allow(saved.path);
  yield* shell.showItemInFolder({ path: saved.path });
}

// tests — both ends of a capability have a name
const overrides: Partial<Capability.Implementation<typeof Client.capability>> = { … };
const operations: Capability.Client<typeof Client.capability> = yield* Client.capability;
```

## File Structure

- Create: `packages/sewed/src/internal/Bytes.ts` — `isBytes(value)`, `here(bytes)` (the current-realm re-view). Electron-free, `node:`-free.
- Modify: `packages/sewed/src/Binary.ts` (`Bytes`), `internal/Bridge.ts` (`Packet`), `internal/Transport.ts` (`RequestPart`, `bulkField`, `sizeOf`, `concat`, `fragment`'s clamp), `internal/BinaryWire.ts` (re-view before pack), `Runtime.ts` (whatever reads `bulkField`).
- Modify: `packages/sewed/src/Capability.ts` — `Client<C>`, `Implementation<C, R>`.
- Modify: `packages/sewed/src/internal/Declarations.ts` (`apply(entries, options)`, `PathsNative.ensureDirectory`), `Paths.ts`, `App.ts` (`run`, `exit`, `preferredSystemLanguages`), `internal/AppRuntime.ts` (exit code on the shutdown request), `packages/forge/src/CrashReporter.ts`.
- Modify: `packages/sewed/src/internal/ShellPolicy.ts` (grantable roots), `Shell.ts` (the `Grants` service's shape, root-safe), `internal/Shell.ts`, `internal/ShellMemory.ts`.
- Tests: create `bytes.test.ts`, `shell-grants.test.ts`; modify `binary.test.ts`, `bulk.test.ts`, `declarations.test.ts`, `lifecycle.test.ts` or a new `app-exit.test.ts` over `AppRuntime`, `shell-policy.test.ts`, `capability-types.ts`, `testing-types.ts`, `declaration-types.ts`, `surfaces-types.ts`, `lifecycle-types.ts`, `packages/forge/test/types.ts`.
- Docs: `docs/binary-streams.md`, `docs/testing.md`, `docs/api.md`, `docs/app-lifecycle.md`, `docs/desktop-surfaces.md`, `docs/forge.md`, `docs/reference.md` (generated), the spec, `docs/electron-coverage.md`.
- Playground (separate checkout): `scripts/app-extras-fixture.mjs` or `app-lifecycle-fixture.mjs` (exit code, paths created, too-late failure), `scripts/surfaces-fixture.mjs` (grants).

---

### Task 1: Bytes by what they are

**Files:** create `packages/sewed/src/internal/Bytes.ts`, `packages/sewed/test/bytes.test.ts`; modify `Binary.ts`, `internal/Bridge.ts`, `internal/Transport.ts`, `internal/BinaryWire.ts`, `Runtime.ts`, `packages/sewed/test/binary.test.ts`, `bulk.test.ts`; docs `docs/binary-streams.md`, `docs/testing.md`.

**Interfaces:** Produces `Bytes.isBytes(value: unknown): value is Uint8Array`, `Bytes.here(bytes: Uint8Array): Uint8Array`.

- [ ] **Step 1: Reproduce under real vitest + jsdom, both directions, before changing anything.** In `.artifacts/probe-vitest-jsdom/` make a scratch package (`pnpm init`, `pnpm add -D vitest jsdom`; if the network is unavailable, say so and fall back to the `node:vm` model in `.artifacts/probe-hardening/probe1-realm.mjs`), link this worktree's built `packages/sewed` and `effect`/`msgpackr` by path, and write one `// @vitest-environment jsdom` test that, over `sewed/testing`, (a) streams `Binary.Bytes` from an in-process owner to the client — the reported failure, `Expected Uint8Array`; (b) sends a `Binary.bulk` request of 1 MiB from the client to the owner — predicted: disconnected as `invalid-bulk-request`, or packed as a map; (c) sends a small `Binary.Bytes` payload in an ordinary request. Record for each: pass/fail, the error, `value instanceof Uint8Array` on each side, and the first byte of the packed frame (`0xc4`–`0xc6` is `bin`; `0xde`/`0xdf`/`0x8x` is a map). This decides where `here` is applied. Keep the harness and a `REPORT.md`.
- [ ] **Step 2: Failing tests.** `bytes.test.ts`: with `node:vm` (`vm.runInNewContext("new Uint8Array([1,2,3,4])")`), assert `isBytes` accepts a Node `Uint8Array`, a `Buffer`, a foreign-realm `Uint8Array` and a view with a non-zero `byteOffset`; rejects a foreign `Uint8ClampedArray`, a `DataView`, `{ byteLength: 4 }`, an object with `[Symbol.toStringTag]: "Uint8Array"`, a `Proxy` over a `Uint8Array`, `null`, a string. `here(foreign)` is `instanceof Uint8Array`, shares memory (mutate one, read the other), keeps `byteOffset`/`byteLength` of a sub-view, and returns the SAME object for a current-realm input. `Schema.decodeUnknownSync(Binary.Bytes)(foreign)` succeeds. `encodeBinary({ bytes: foreign })` starts with a `bin` byte and round-trips to the same four bytes. In `bulk.test.ts`: a bulk request whose field is a foreign-realm `Uint8Array` arrives intact, and an owner handed a foreign-realm field does not disconnect.
- [ ] **Step 3: Implement.** `internal/Bytes.ts`:

```ts
/**
 * Whether a value is a `Uint8Array`, from this realm or another. `instanceof` asks which realm
 * made it, which is the wrong question: under a test environment that swaps the global, the bytes
 * a packer returns and the bytes a schema expects come from different realms. `ArrayBuffer.isView`
 * reads the internal slot, so neither a spoofed tag nor a Proxy passes; a Node `Buffer` does.
 */
export const isBytes = (value: unknown): value is Uint8Array =>
  ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]";

/** The same memory as a view this realm made; the input itself when this realm already made it. */
export const here = (bytes: Uint8Array): Uint8Array =>
  bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
```

`Binary.Bytes` becomes a declared schema over `isBytes` that keeps the `toCodecJson: () => undefined` annotation (read how `Schema.Uint8Array` is declared in `packages/sewed/node_modules/effect/dist/Schema.js` and declare the same way with the predicate; its `Type` stays `Uint8Array`). `Bridge.ts`'s `Packet` and `Transport.ts`'s `RequestPart` use it. `bulkField`, `sizeOf`, `concat` use `isBytes`. Apply `here` where Step 1 showed bytes enter the packer in the wrong realm — at minimum in `encodeBinary`'s input path for the bulk field and for `RequestPart.bytes`; if a general `Binary.Bytes` field needs it, do it in the schema's encode side, not by walking messages. Clamp `fragment`'s halving: `slice = Math.max(minPartBytes, Math.floor(slice / 2))`, with the loop's exit condition adjusted so a slice at the floor that still fails ends in the `Protocol` failure rather than spinning.

- [ ] **Step 4: Re-run Step 1's vitest harness against the rebuilt package**; all three cases pass. Record before/after in the report.
- [ ] **Step 5: Docs and commit.** `docs/binary-streams.md`: one paragraph — bytes are recognized by what they are, so a test environment with its own realm (vitest's jsdom) works; `docs/testing.md`: one sentence pointing at it. `pnpm build && pnpm docs:reference && pnpm format && timeout 300 pnpm test && pnpm format:check`. Commit: `fix(wire): recognize bytes by what they are, not by which realm made them`.

---

### Task 1b: A decider for the resource type `other` is always consulted

A security fix: at `2c7c1969` it is a fail-open. Small, independent of every other task, and it goes in right behind Task 1.

**Files:** modify `packages/sewed/src/internal/RequestStages.ts`, `packages/sewed/src/internal/WebRequest.ts`; test `packages/sewed/test/decidables-request.test.ts` (or a new `request-union.test.ts`); docs `docs/session-extras.md` (the interception section); playground `scripts/session-extras-fixture.mjs`.

- [ ] **Step 1: Read** `.artifacts/probe-types-other/PROBE_REPORT.md` and `.artifacts/probe-websocket-filter/PROBE_REPORT.md` ("What is established"), then `internal/WebRequest.ts` `unionFilter` (~136-151) and how its result is installed (~260-310), and `internal/RequestStages.ts` (the per-install `selects`).
- [ ] **Step 2: Failing tests** over the union as a PURE function in `RequestStages.ts` (move it there first as a no-behaviour-change refactor if that is what makes it importable; `WebRequest.ts` imports Electron for a value and the unit suite cannot import it): no installs gives `undefined`; one install with no `types` gives `{ urls }`; `types: ["image"]` and `types: ["script"]` give `{ urls, types: ["image", "script"] }` (order-insensitive); **`types: ["other"]` alone gives `{ urls }` with NO `types` key; `types: ["other"]` plus `types: ["image"]` gives `{ urls }` with NO `types` key** (today: `{ urls, types: ["image"] }` — the fail-open; record the RED output); `types: ["image", "other"]` on one install gives `{ urls }`; the result never contains `"other"`; `urls` is the de-duplicated union. Then one behavioural test through `Testing.requests()`: with an `other`-only decider that blocks and an `image`-only decider that passes, an event of `resourceType: "other"` resolves to `block` and an `image` event to the fallback — the stand-in routes by `selects`, so this pins that the MATCHER already handled `other` and only the native union was wrong.
- [ ] **Step 3: Implement.** In the union: `const wanted = new Set(entries.flatMap((entry) => entry.types ?? []));` and `everything = entries.some((entry) => entry.types === undefined) || wanted.has("other")`. Keep the type guard that excludes `"other"` from the emitted list, and say in the doc comment WHY: Electron throws on it, an empty list means every type, and a restrictive list would starve an `other` decider. `WebRequest.ts` keeps one line: the call.
- [ ] **Step 4: Pin it against real Electron.** In the playground's `scripts/session-extras-fixture.mjs` (read it for the idiom): on one session install an `image`-only decider that passes and an `other`-only decider that blocks; load a page with `<link rel="prefetch" href="/prefetch.txt">` and an `<img>`; assert the prefetch is blocked (the server never serves it, or the page observes the failure) and the image loads. In the same fixture pin the WebSocket facts so an Electron upgrade cannot regress them silently: a block-everything decider under `{ urls: ["<all_urls>"] }` stops a `ws:` socket (server sees no upgrade), and with no decider the socket opens. Pack, reinstall (delete the stale `node_modules/sewed` and its `.pnpm` entry first), `env -u FORCE_COLOR pnpm verify:session-extras`.
- [ ] **Step 5: Docs and commit.** `docs/session-extras.md`, where a consumer chooses an `intercept` filter: `<all_urls>` is everything a webRequest hook can see, WebSocket handshakes included (their `resourceType` is `webSocket`); `*://*/*` is http and https ONLY, so a rule meant to be total says `<all_urls>`; the native filter is the union of a stage's installs, and one install naming `other` — or naming no types — makes it every type. `pnpm build && pnpm docs:reference && pnpm format && timeout 300 pnpm test && pnpm format:check`. Commit: `fix(requests): an install for the resource type other is always consulted`.

---

### Task 1c: A refused registration cannot silence a stage

Same class as Task 1b, a different trigger. Small; it goes in right behind Task 1's fix round.

**Files:** modify `packages/sewed/src/internal/WebRequest.ts` (the `intercept` and `observe` acquire paths); test `packages/sewed/test/request-union.test.ts`; docs `docs/session-extras.md`; playground `scripts/session-extras-fixture.mjs`.

- [ ] **Step 1: Probe** (Electron 44.3.0, harness under `.artifacts/probe-refused-registration/`, reuse `.artifacts/probe-types-other/`'s structure; `timeout 90`, `env -u FORCE_COLOR`, fresh session per case): register a working cancel-images listener with `{ urls: ["<all_urls>"] }`; confirm it blocks an `<img>`. Then call `onBeforeRequest(badFilter, otherListener)` for each bad filter and record whether it THROWS and whether the FIRST listener still blocks afterwards: `types: ["other"]`; and a list of `urls` patterns that `WebRequest.compilePattern` ACCEPTS — find which of them Electron refuses: `custom://host/*`, `chrome-extension://abc/*`, `https://*.*.example.com/*`, `https://exa mple.com/*`, `https://example.com:99999/*`, `*://*:*/*`, `file:///*`, `ws://*/*`, an IPv4 host, a host with a trailing dot, an empty-host `http:///x`. Repeat for `onBeforeSendHeaders` and one observation hook (`onCompleted`). Table: filter → throws? → previous listener intact?
- [ ] **Step 2: Fix.** In `intercept`'s and `observe`'s acquire paths, after rolling back the new install on a throw, call the reinstall for the surviving installs (guarded so a second throw cannot mask the first failure: the ORIGINAL error is what the caller gets). Say in a comment what Step 1 established and that the restore does not depend on it.
- [ ] **Step 3: Tests.** Unit: complete Task 1b's behavioural test with the co-installed `image`-only decider its brief asked for (an `other` event blocks, an `image` event reaches the fallback, with BOTH installed). Real Electron, in `session-extras-fixture.mjs`: install a blocking decider; then attempt an install whose filter Electron refuses (one Step 1 found; if Sewed's schema refuses every such pattern first, say so — then the trigger is unreachable from the public API and the check asserts the schema's refusal instead); assert the attempt fails with a typed `SewedError` and the FIRST decider still blocks. Pack, reinstall, `verify:session-extras`.
- [ ] **Step 4: Docs and commit.** One sentence in `docs/session-extras.md`: an install Electron refuses fails by itself and leaves the stage's other deciders consulted. If Step 1 found patterns Sewed accepts and Electron refuses, list them. Commit: `fix(requests): a registration Electron refuses leaves the stage's other deciders installed`.

---

### Task 2: Both ends of a capability have a name

**Files:** modify `packages/sewed/src/Capability.ts`, `packages/sewed/test/capability-types.ts`, `testing-types.ts`; docs `docs/testing.md`, `docs/api.md`.

- [ ] **Step 1: Reproduce the `any`, in a contract file.** In `testing-types.ts` write Jobwright's shape: `type Handlers<P> = P extends RpcGroup.RpcGroup<infer R> ? RpcGroup.HandlersFrom<R> : never;`, a `Partial<Handlers<typeof Protocol>>` record spread into `Protocol.toLayer({...})`, handed to `Testing.host`. Show its requirement is `any` with a line that would not compile otherwise (`const leaked: Effect.Effect<unknown, unknown, never> = thatEffect` compiles ONLY because `any` is assignable — so pin it the other way: a helper `type IsAny<T> = 0 extends 1 & T ? true : false` and `const isAny: IsAny<Requirement> = true`). Keep it as a documented contract: it is Effect's `HandlersFrom`, not `Testing.host`.
- [ ] **Step 2: The types.**

```ts
/** The `Rpcs` of a capability. */
type RpcsOf<C> = C extends Capability<infer Rpcs, string> ? Rpcs : never;

/** A capability's operations: what `yield* capability` answers, named so a helper can take it. */
export type Client<C extends Capability<Rpc.Any, string>> = Operations<RpcsOf<C>>;

/**
 * A capability's handler record — one function per operation — with the requirement its handlers
 * share. Unlike Effect's `RpcGroup.HandlersFrom`, whose requirement is `any`, a record typed with
 * this keeps `R`, so a host built from it over `toLayer` has a requirement a caller can discharge.
 */
export type Implementation<C extends Capability<Rpc.Any, string>, R = never> = {
  readonly [Current in RpcsOf<C> as Current["_tag"]]: Rpc.ToHandlerFn<Current, R>;
};
```

Read `packages/sewed/node_modules/effect/dist/unstable/rpc/Rpc.d.ts` for `ToHandlerFn`'s real name and parameters in rc.115 and use it as it is; if `RpcsOf` is wanted publicly by the contract, export it — otherwise keep it private.

- [ ] **Step 3: Contracts.** `capability-types.ts`: `const ops: Capability.Client<typeof Calculator> = …` equals `Capability.Operations<…>` both ways; a `Partial<Capability.Implementation<typeof Calculator>>` spread over defaults into `toLayer`, handed to `Testing.host`, has requirement `MainContext | Scope` — pin with `IsAny<…> = false` and an exact annotation; with `R = Business` the requirement carries `Business`; `@ts-expect-error` for a handler of the wrong payload type and for a missing operation in a non-`Partial` record. Prove each bites.
- [ ] **Step 4: Docs and commit.** `docs/testing.md`: where a helper takes a host or overrides handlers, name `Capability.Implementation` and say why not `HandlersFrom`; `docs/api.md`'s `Capability` line gains both names. Regenerate the reference. Commit: `feat(capability): name a capability's operations and its handler record`.

---

### Task 3: The entry — too late is loud, and declared is present

**Files:** modify `packages/sewed/src/internal/Declarations.ts`, `Paths.ts`, `App.ts`, `packages/forge/src/CrashReporter.ts`, `packages/sewed/test/declarations.test.ts`, `declaration-types.ts`, `packages/forge/test/types.ts`; docs `docs/app-lifecycle.md`, `docs/forge.md`; playground `scripts/app-extras-fixture.mjs`.

- [ ] **Step 1: Probe what actually fails for a missing directory** (Electron 44.3.0, harness under `.artifacts/probe-setpath/`, each case `timeout 60`, `env -u FORCE_COLOR`): before ready, `app.setPath(name, p)` where `p` has THREE missing parent levels, for `sessionData`, `userData`, `logs`, `crashDumps`; then `crashReporter.start({ uploadToServer: false })` after `setPath("crashDumps", missing)`; then let the app reach `ready` and open nothing — does Chromium create `sessionData`, or fail, and with what message? Record the table. This is what the guide will say.
- [ ] **Step 2: Failing tests** in `declarations.test.ts`: `apply(entries, { isReady: () => true })` with a non-empty list returns `Startup` whose message names readiness and the fix, and applies NOTHING (the fake natives record no call); with an empty list it returns `undefined`; with `isReady: () => false` it behaves as today. `paths` with a fake `ensureDirectory` records a create for every declared name before any `setPath`, in declaration order, none for `exe`/`module`, and a throwing `ensureDirectory` fails `Startup` naming `paths` with the path in its message and sets nothing.
- [ ] **Step 3: Implement.** `apply(entries, options: { readonly isReady: () => boolean })` — refuse first:

```ts
if (entries.length > 0 && options.isReady())
  return startupError(
    "App.run was called after Electron was ready, so its declarations cannot apply. Call App.run in the entry module's first synchronous pass, or after a top-level await in an ES-module entry",
    undefined,
  );
```

`PathsNative` gains `ensureDirectory(path: string): void`; `paths` decodes every entry, then creates, then sets; a create failure is rethrown with the path in its message. `Paths.ts` binds `ensureDirectory: (path) => mkdirSync(path, { recursive: true })` beside `setPath`. `App.run` passes `{ isReady: () => app.isReady() }`. `@sewed/forge`'s `CrashReporter.declare` creates `directory` before `app.setPath("crashDumps", directory)`.

- [ ] **Step 4: Contracts.** `declaration-types.ts` is unaffected in shape; add nothing unless a signature changed.
- [ ] **Step 5: Playground.** In `app-extras-fixture.mjs` (read it first): declare a `logs` path three levels deep that does not exist and assert it exists once the program runs; add a second scenario entry that awaits inside an `async function main()` before `App.run([CommandLine.declare(…)], …)` and assert the process exits 1 with `Startup` and the readiness message on stderr. Pack, reinstall, `verify:app-extras`.
- [ ] **Step 6: Docs and commit.** `docs/app-lifecycle.md` `## Declarations`: the entry rule with the probe's facts (an ES-module entry's top-level await holds readiness; an un-awaited async function, a CommonJS entry and a dynamic `import()` do not; too late, only a scheme throws on its own — which is why `App.run` refuses); "declared, therefore present", with Step 1's finding. `docs/forge.md`: `directory` is created. Commit: `fix(app): App.run refuses to declare after readiness, and a declared directory exists`.

---

### Task 4: `App.exit(code)` and `App.preferredSystemLanguages()`

**Files:** modify `packages/sewed/src/App.ts`, `internal/AppRuntime.ts`, `packages/sewed/test/lifecycle.test.ts`, `lifecycle-types.ts`, `app-extras-types.ts`; docs `docs/app-lifecycle.md`; playground `scripts/app-lifecycle-fixture.mjs`.

- [ ] **Step 1: Failing tests over `AppRuntime`** (Electron-free): `AppRuntime.make(approve)`'s `approve` now receives an optional code; `owner.exit(7)` calls it with `7` and does NOT consult the quit decider (install a `deny` decider on `App.Quit`, call `owner.exit(7)`, assert `approve` ran with 7 and the decider was never asked); `owner.gate.request()` still approves with no code; a second `exit` after the first is ignored; `exit` with a non-integer or a code outside 0–255 is refused.
- [ ] **Step 2: Implement.** `AppRuntime.make(approveQuit: (code?: number) => void)` gains `exit(code: number): void`. In `App.run`: `quitRequested` becomes `Deferred<number | undefined>`; `requestShutdown = (code?: number) => Deferred.doneUnsafe(quitRequested, Effect.succeed(code))`; after the race, keep the code; in `onExit`, after listeners are removed and `owner.close()` has completed, a failure still prints and `app.exit(1)`; otherwise `code === undefined ? app.quit() : app.exit(code)` as the LAST statement (nothing after `app.exit` runs). `App.exit`:

```ts
/**
 * Ends the application with exactly this exit code, once the application scope has closed and
 * its finalizers have run. It does not consult `Decidables.App.Quit`: Electron's own `app.exit`
 * fires no quit event, and a launcher that must answer a code cannot be vetoed by a feature.
 * Use {@link quit} for a quit a feature may refuse. `code` is an integer from 0 to 255.
 */
export const exit = (code: number): Effect.Effect<never, SewedError, MainContext> => …
```

It fails `Protocol` for an invalid code and `Closed` with no running owner, requests the shutdown, then `Effect.never` (the closing scope interrupts it). `preferredSystemLanguages`: `export const preferredSystemLanguages = (): readonly string[] => [...app.getPreferredSystemLanguages()];` with the doc comment from ruling 7.

- [ ] **Step 3: Contracts.** `lifecycle-types.ts`: `App.exit(0)` is `Effect<never, SewedError, MainContext>`; `@ts-expect-error` for erasing `MainContext` and for a string code; `App.preferredSystemLanguages()` is `readonly string[]` and is NOT an Effect (`@ts-expect-error` on `yield*`).
- [ ] **Step 4: Playground.** `app-lifecycle-fixture.mjs`: a scenario whose program registers a finalizer that writes a marker file, installs a `deny` `App.Quit` decider, then `yield* App.exit(7)`; the verifier asserts exit code 7, the marker exists, and the decider was never consulted. A scenario that logs `App.preferredSystemLanguages()` from a declaration thunk under `LANGUAGE=fr` and asserts `fr` reached the renderer's `--lang`. Pack, reinstall, `verify:app`.
- [ ] **Step 5: Docs and commit.** `docs/app-lifecycle.md`: `App.exit` beside the quit decisions, with the probe's fact that nothing runs after Electron's exit; the synchronous accessor beside the declarations. Regenerate the reference. Commit: `feat(app): exit with an exact code after finalizers, and read the OS languages before readiness`.

---

### Task 5: A shell grant

**Files:** modify `packages/sewed/src/Shell.ts`, `internal/ShellPolicy.ts`, `internal/Shell.ts`, `internal/ShellMemory.ts`; create `packages/sewed/test/shell-grants.test.ts`; modify `surfaces-types.ts`; docs `docs/desktop-surfaces.md`; playground `scripts/surfaces-fixture.mjs`.

**Interfaces:** Produces `Shell.Grants` (a main-only `Context.Service`, exported from `sewed/main`'s `Shell` and from `Testing.Shell`), `Grants["Service"] = { readonly allow: (path: string) => Effect<void, SewedError, Scope> }`; `Shell.native(options)` and `Testing.Shell.memory(options)` provide it beside the capability.

- [ ] **Step 1: Read** `.artifacts/probe-hardening/CODE_MAP.md` §7 and §8 (how `paths` roots are validated and how `allowedPath` contains a path; what `Dialog.save`/`open` return). The grant reuses `allowedPath`'s rule; do not write a second containment check.
- [ ] **Step 2: Failing tests** (`shell-grants.test.ts`, over `ShellPolicy.operations` with a recording core, and over `Testing.Shell.memory`): with `paths: []`, `showItemInFolder({ path: "/home/u/saved/diagnostics.zip" })` fails `Protocol`; inside a scope after `grants.allow("/home/u/saved/diagnostics.zip")` it reaches the core; after the scope closes it fails `Protocol` again; a grant of a directory admits a file under it and refuses `..` out of it; a relative path is refused `Protocol`; two scopes granting the same path — closing one keeps the other's grant (count, do not delete); a grant made under one Layer instance does not leak into another.
- [ ] **Step 3: Implement.** `ShellPolicy.operations` holds the static roots plus a counted map of granted roots and answers `{ operations, allow }`; `allowedPath` consults both. `Shell.ts` (root, Electron-free) declares the service's shape; `internal/Shell.ts` and `internal/ShellMemory.ts` provide `Layer` of both services from one `operations` instance (`Layer.effectContext`/`Layer.mergeAll` as the file's idiom allows). The capability's protocol is untouched: confirm by reading `Capability.serve` that only the protocol's operations are served.
- [ ] **Step 4: Contracts.** `surfaces-types.ts`: `Shell.native(...)` is `Layer<typeof ShellData.capability | Shell.Grants, SewedError, MainContext>`; `grants.allow(p)` requires `Scope`; `@ts-expect-error` that the capability's operations have no `allow`; `@ts-expect-error` that `Shell.Grants` is not reachable from the root `sewed` entry's `Shell` namespace if it is main-only there.
- [ ] **Step 5: Playground.** `surfaces-fixture.mjs`: with `paths: [root]`, a path outside `root` is refused; granted in a scope, `showItemInFolder` is accepted by the policy (follow the block's existing approach to not actually launching a file manager); after the scope, refused; and a served Shell bound to a renderer has no `allow` operation. Pack, reinstall, `verify:surfaces`.
- [ ] **Step 6: Docs and commit.** `docs/desktop-surfaces.md` `## Shell`: the grant, the dialog example, that it is main-only and why. Regenerate the reference. Commit: `feat(shell): main grants the shell a path for a scope`.

---

### Task 6: Record, sweep, hand-backs

- [ ] **Step 1:** Spec `docs/superpowers/specs/2026-09-15-platform-redesign-design.md`: entries 30 onward for rulings 1–8 in the voice of entries 27–29 (merge 1+2; merge 4+5); align line ~834 and the bulk plan's ruling 7 with the guides (after the final part, a lost connection is an interruption today on the default shared connection); a closing record for this wave with what each probe established. `docs/electron-coverage.md`: a wave paragraph and catalog rows (`app.exit`, `app.getPreferredSystemLanguages`, the shell grant). Never cite plan task numbers in the spec. Commit the plan file with it.
- [ ] **Step 2:** `pnpm build && pnpm docs:reference && pnpm format:check && timeout 300 pnpm test && pnpm website:build`; pack; reinstall the playground; `verify:binary`, `verify:app`, `verify:app-extras`, `verify:surfaces`, `verify:lifecycle`, `verify:forge`.
- [ ] **Step 3:** Hand-backs are the controller's: `testing-gaps-handback.md` and an extension of `shell-gaps-handback.md`, in Jobwright's durable directory, each naming the commit.

---

## Self-review

- **Requests covered.** Testing gaps: §6 (Task 1), §2 and §4 (Task 2, with §2's cause corrected), §5's guide line (Task 6 Step 1 adds it to `docs/testing.md` beside the Layers table; the typed `Protocol` refusal is the next wave's), §1 and §3 belong to later waves and are said so in the hand-back. Shell gaps: §A1's remainder (Task 3), the directories and `App.exit` from the later message (Tasks 3, 4), §B5 (Task 4), §A2's second half (Task 5). The parked clamp (Task 1).
- **Type consistency.** `Bytes.isBytes`, `Bytes.here`, `Capability.Client`, `Capability.Implementation`, `Declarations.apply(entries, { isReady })`, `PathsNative.ensureDirectory`, `App.exit`, `App.preferredSystemLanguages`, `Shell.Grants`, `grants.allow` are spelled identically throughout.
- **Ordering.** Tasks 1, 1b and 2–5 are independent of each other; each starts with a reproduction or a read. Task 6 depends on all.
