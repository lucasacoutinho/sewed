# Declarations and Launch Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything that must happen before Electron is ready becomes an inert declaration applied by `App.run(declarations, program)`; the single-instance lock becomes a scoped resource the program claims when it chooses; the `App.run` options object disappears.

**Architecture:** A `Declaration` is an opaque value made from a name and a synchronous step, applied in order by an Electron-free walker before `App.run` waits for readiness; each `declare` in `sewed/main` is a one-line binding of an Electron-free factory to the real `app`. `App.claimInstance` acquires Electron's lock inside the caller's scope and hands back the stream of later launches, failing `App.SecondaryInstance` when another process holds it. The application menu, whose contributions are step 4, becomes a scoped resource `App.menu` in the meantime.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), Electron 44.3.0, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-15-platform-redesign-design.md`, section C, plus the rulings under "Step 3 rulings" below, which Task 4 records in the spec.

## Global Constraints

- Commands run from the repository root: `pnpm typecheck` (`tsc -b`), `timeout 240 pnpm test`, `pnpm build`, `pnpm format`, and a single test file with `node --import tsx --test --test-timeout=20000 packages/sewed/test/<file>.test.ts`. Node has no default test timeout; every ad-hoc run passes one.
- Effect stays at `4.0.0-rc.115`. Add no dependency.
- The root package (`sewed`) imports no Electron module and reads no environment at the top level. `Declaration.ts`, `Launch.ts`, `internal/Declarations.ts`, `internal/Instance.ts` and `internal/LaunchQueue.ts` are Electron-free.
- Keep definitions inert: a declaration calls nothing when it is made, and a thunk is not called until `App.run` applies it.
- No `any`; no `as` beyond `as const` and `import * as`; no non-null assertions.
- `*.test.ts` files are never type-checked. Every type-level claim lives in a `*-types.ts` file, and every `@ts-expect-error` is proven to bite by stripping it once and reading the error before it is committed.
- Breaking changes are allowed. No aliases; each removal is pinned by a negative contract assertion.
- Every task migrates the playground fixtures it breaks (`/home/lucas/personal/typescript/sewed-playground`, a separate non-git checkout; use `command ls` there, never bare `ls`).
- Regenerate `docs/reference.md` (`pnpm docs:reference`, after `pnpm build`) in any task that changes a doc comment on a public export. `pnpm test` runs `api-reference.mjs --check` and fails on drift.
- `pnpm build`, `timeout 240 pnpm test` and `pnpm format:check` pass before a task is complete. Task 4 also runs `pnpm website:build`.
- Each task ends in one local commit. Never push. Commit messages end with:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BVPFknzuoDTJ9NkEJGWesy
  ```

## Scope

In scope: spec section C in full — declarations, `App.claimInstance`, the removal of every `App.run` option — plus the interim application-menu path section C leaves open.

Out of scope: contributions and the menu skeleton (D), readiness receipts (E), the failure model (F), performance (G), `sewed check` (H). `certificateErrors` and `quitOnLastWindowClosed` are already gone.

## Step 3 rulings

Settled here so every task is written against one answer. Task 4 copies them into the spec's "Decisions settled while implementing" as entries 17 onward.

1. **One `App.run` signature: `App.run(declarations, program)`.** An application with nothing to declare writes `App.run([], program)`. No overload takes a bare program: one spelling for every entry, and the empty list says visibly that nothing runs before readiness. Cost if wrong: one `[]` per entry.
2. **A declaration is an opaque value; `Declaration.make(name, apply)` is its one door.** Its definition (`name`, a synchronous `apply`) lives in a `WeakMap`, exactly as `Protocol.scheme` keeps a scheme's. Every `declare` in Sewed is built on `make`, and it is public because `@sewed/forge` consumes public exports only. A `Declaration` cannot be forged structurally, so `App.run` is never handed an arbitrary object.
3. **`App.run`'s list holds declarations and synchronous thunks: `readonly Declaration.Entry[]`, `Entry = Declaration | (() => Declaration)`.** A thunk is called by `App.run` in list order; that is what "a value may come from a synchronous thunk at the entry" means. A thunk keeps the entry inert — a module can export a list without computing anything — and a throw inside it fails `Startup` with the thunk's position instead of escaping as an uncaught exception at module load. One thunk yields one declaration.
4. **Application is in order, and stops at the first failure.** Failure is `SewedError` code `Startup`, message `Could not apply declaration "<name>"`, cause the throw. Nothing after a failed declaration is applied, because `App.run` exits on it regardless.
5. **Where each `declare` lives.** All in `sewed/main`: `Protocol.declare(...schemes)` in `internal/Protocol.ts`; `CommandLine.declare(flag)`, `Paths.declare(table)`, `Gpu.declare(options)` in new thin main modules of the same names; `App.declare({ userModelId })` in `App.ts` for the Windows application user model id, which is a fact about the application and has no better home; `CrashReporter.declare(options)` in `@sewed/forge`; `Declaration.make` in a new `sewed/main` namespace `Declaration`.
6. **`Protocol.declare` is variadic and one-shot.** Electron registers privileged schemes in exactly one call, so one declaration carries every scheme, and a second `Protocol.declare` in the list fails `Startup` naming the declaration, with `registerSchemes`'s once-only error as its cause. `registerSchemes` stops being public: `declare` is the only door.
7. **`Paths.declare` takes a partial table over `Application.PathName`.** `Schema.Record` over a literal union requires every key, so the table is typed by hand and each entry is decoded at apply time — every entry first, then every `setPath`, so a bad name applies nothing.
8. **`CrashReporter.declare` takes the existing `Options` plus `directory`.** `directory` sets Electron's `crashDumps` path before `crashReporter.start`, in that order, which a consumer setting the path through `Paths.declare` could get wrong silently. The upload flag keeps its name `uploadToServer`: the module's `uploadToServer` and `setUploadToServer` already use it, and the spec's `upload` was illustrative.
9. **`App.claimInstance({ data })` is a scoped resource, one at a time.** Acquire decodes `data` as a JSON object, calls `requestSingleInstanceLock(data)`, and on `false` fails `App.SecondaryInstance` — Electron forwards the arguments, working directory and data to the primary inside that call, so "after forwarding" is Electron's own contract. On `true` it installs the `second-instance` listener and starts the launch queue. Release removes the listener, ends the queue and releases the lock. A second claim while one is held fails `Limit`; a claim after a release succeeds. `App.run` does not special-case `SecondaryInstance`: the program catches it and decides, and an uncaught one exits 1 like any other failure. The cost the spec accepts: a secondary process reaches readiness before it learns it is secondary, since the program runs after `whenReady`; a consumer wanting the cheapest exit claims first.
10. **`instance.launches` is `Stream<Launch.SecondInstance, SewedError>`; `App.launches` keeps `initial`, `file` and `url`.** `second-instance` only ever arrives at the lock holder, so it belongs to the claim, and a union member that could never arrive on `App.launches` is removed rather than left representable. `SecondInstance` is `{ arguments, workingDirectory, additionalData }` with no `kind`. Both streams share one queue module: capacity 128, one draining consumer, retention before subscription, `Limit` on overflow and on a launch over 256 KiB, `Closed` after release.
11. **The application menu's interim path is `App.menu(options)`: `Effect<App.Menu, SewedError, MainContext | Scope>` with `replace` and `selections`.** `App.setMenu`, `App.menuSelections` and the `ApplicationMenu.Owner` service go. Release stops the menu's callbacks and fails its observers `Closed`; it does not restore or clear the native menu, because the X11 finding recorded in `docs/application-menus.md` still stands — that finding rejected a _restoring_ release, not a scoped acquisition. A second live `App.menu` fails `Limit`: shared native state has one owner. Step 4 replaces `App.menu` with the skeleton and contributions; nothing here should survive it.
12. **`App.Options` and `App.Startup` are removed.** `Declaration.make` is what `Startup` was.

## What the consumer writes

The entry program the first consumer writes, in its natural spelling. Task 3 lands it as a type-checked contract in `packages/forge/test/types.ts` (where both `sewed/main` and `@sewed/forge` resolve) and its core-only half in `packages/sewed/test/guide-examples-types.ts`. Every signature in this plan is derived from it.

```ts
import { Effect, Stream } from "effect";
import { App, BrowserWindow, CommandLine, Gpu, Paths, Protocol, Session } from "sewed/main";
import { CrashReporter } from "@sewed/forge";

const jobwright = Protocol.scheme("jobwright", {
  standard: true,
  secure: true,
  supportFetchAPI: true,
});

App.run(
  [
    Protocol.declare(jobwright),
    () => CommandLine.declare({ name: "lang", value: osLocale() }),
    Paths.declare({ sessionData: paths.session }),
    CrashReporter.declare({ directory: paths.crashes, uploadToServer: false }),
    Gpu.declare({ acceleration: true }),
  ],
  Effect.gen(function* () {
    yield* launcherChecks;
    if (yield* handoff) return yield* App.quit;
    const instance = yield* App.claimInstance({ data: { source: "desktop" } });
    const session = yield* Session.defaultSession;
    yield* Protocol.handle(session, jobwright, serve);
    const window = yield* BrowserWindow.make({ title: "Jobwright" });
    yield* instance.launches.pipe(
      Stream.runForEach(() => window.focus),
      Effect.forkScoped,
    );
  }).pipe(Effect.catchTag("SecondaryInstance", () => App.quit)),
);
```

`osLocale`, `paths`, `launcherChecks`, `handoff` and `serve` are the consumer's; the contract declares them.

## File Structure

- Create: `packages/sewed/src/Declaration.ts` — `Declaration`, `Entry`, `Definition`, `make`, `definition`. Electron-free; exported from `sewed/main` as `Declaration`.
- Create: `packages/sewed/src/internal/Declarations.ts` — `apply(entries)` and the four Electron-free factories `commandLine`, `paths`, `gpu`, `identity`, each over a structural slice of Electron's `app`.
- Create: `packages/sewed/src/CommandLine.ts`, `packages/sewed/src/Paths.ts`, `packages/sewed/src/Gpu.ts` — one `declare` each, binding a factory to `app`.
- Create: `packages/sewed/src/internal/LaunchQueue.ts` — the bounded single-consumer launch queue, extracted from `internal/AppRuntime.ts`.
- Create: `packages/sewed/src/internal/Instance.ts` — `SecondaryInstance`, `Instance`, `Options`, `Native`, `make(native)`.
- Modify: `packages/sewed/src/App.ts` — `run`, `claimInstance`, `menu`, `declare`; remove `Options`, `Startup`, `setMenu`, `menuSelections`.
- Modify: `packages/sewed/src/internal/AppRuntime.ts` — use `LaunchQueue`.
- Modify: `packages/sewed/src/internal/ApplicationMenu.ts` — `make` returns the handle; remove `Owner`, `replace`, `selections`.
- Modify: `packages/sewed/src/internal/Protocol.ts` — `declare`; `registerSchemes` becomes private.
- Modify: `packages/sewed/src/Launch.ts`, `packages/sewed/src/Application.ts`, `packages/sewed/src/main.ts`, `packages/sewed/src/internal/StandardSchemes.ts` (doc comment).
- Modify: `packages/forge/src/CrashReporter.ts`, `packages/forge/src/CrashReporterSchema.ts`.
- Tests: create `packages/sewed/test/declarations.test.ts`, `instance.test.ts`, `declaration-types.ts`; modify `lifecycle-types.ts`, `app-extras-types.ts`, `session-resources-types.ts`, `types.ts`, `guide-examples-types.ts`, `packages/forge/test/types.ts`.
- Docs: `docs/app-lifecycle.md`, `docs/application-menus.md`, `docs/session-resources.md`, `docs/forge.md`, `docs/api.md`, `docs/native-policy.md`, `docs/electron-coverage.md`, `docs/getting-started.md`, `docs/devtools.md`, `docs/context-menus.md`, `docs/dialogs.md`, `docs/sessions.md`, `docs/utility-processes.md`, `docs/reference.md` (generated), `README.md`, `packages/forge/README.md`, `packages/create/template/src/main/app.ts`, the spec.
- Playground (separate checkout): `scripts/lifecycle-foundations-fixture.mjs`, `scripts/application-menu-fixture.mjs`, `scripts/session-resources-fixture.mjs`, `scripts/app-extras-fixture.mjs`, `scripts/forge-fixture.mjs`, every other `App.run(` call site (29, listed in Task 3), `README.md`.

---

### Task 1: The instance claim

`App.claimInstance` as a scoped resource over an Electron-free core, the launch queue it shares with the application's own launches, and the removal of `App.run`'s `singleInstance` option.

**Files:**

- Create: `packages/sewed/src/internal/LaunchQueue.ts`, `packages/sewed/src/internal/Instance.ts`
- Modify: `packages/sewed/src/internal/AppRuntime.ts`, `packages/sewed/src/App.ts`, `packages/sewed/src/Launch.ts`
- Test: create `packages/sewed/test/instance.test.ts`; modify `packages/sewed/test/lifecycle-types.ts`, `packages/sewed/test/guide-examples-types.ts`
- Docs: `docs/app-lifecycle.md` (`## Launch ownership`), `docs/api.md:118`, `docs/reference.md`
- Playground: `scripts/lifecycle-foundations-fixture.mjs`, `README.md:168`

**Interfaces:**

- Consumes: `Launch.Request` (`packages/sewed/src/Launch.ts`), `SewedError`, `MainContext`, `AppRuntime.Owner`.
- Produces: `Launch.SecondInstance`; `LaunchQueue.make<A>(what, decode)`; `Instance.make(native)`, `Instance.SecondaryInstance`, `Instance.Instance`, `Instance.Options`, `Instance.Native`; `App.claimInstance(options?)`, `App.Instance`, `App.SecondaryInstance`. `App.run(program, options)` still takes `menu`, `schemes`, `commandLine`, `appUserModelId`, `hardwareAcceleration` and `startup` after this task; Tasks 2 and 3 remove them.

- [ ] **Step 1: Write the contract for the claim, and prove the negatives bite**

Replace `packages/sewed/test/lifecycle-types.ts:62-64` (the two `App.run(Effect.void, { singleInstance … })` lines) with:

```ts
// Step 3: the single-instance lock is a scoped resource the program claims when it chooses.
const claimed: Effect.Effect<
  App.Instance,
  SewedError | App.SecondaryInstance,
  MainContext | Scope.Scope
> = App.claimInstance({ data: { url: "sewed://open", count: 1 } });
const bare: Effect.Effect<
  App.Instance,
  SewedError | App.SecondaryInstance,
  MainContext | Scope.Scope
> = App.claimInstance();
// A secondary process fails with a tagged error the program catches by name.
const quiet: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.gen(function* () {
  const instance = yield* App.claimInstance({ data: { source: "desktop" } });
  yield* instance.launches.pipe(
    Stream.runForEach(() => Effect.void),
    Effect.forkScoped,
  );
}).pipe(Effect.catchTag("SecondaryInstance", () => App.quit));
// Later launches carry the forwarded arguments and data, with no kind: they are all second instances.
const later: Stream.Stream<Launch.SecondInstance, SewedError> = Effect.runSync(
  Effect.succeed(undefined as unknown as App.Instance),
).launches;
// @ts-expect-error instance data is a JSON object; a function cannot be forwarded to another process.
App.claimInstance({ data: { callback: () => {} } });
// @ts-expect-error `singleInstance` is no longer an App.run option; claim the instance in the program.
App.run(Effect.void, { singleInstance: { additionalData: { url: "sewed://open" } } });
// @ts-expect-error `App.launches` no longer carries second instances; those belong to the claim.
const never: Stream.Stream<{ readonly kind: "second-instance" }, SewedError, MainContext> =
  App.launches;
void claimed;
void bare;
void quiet;
void later;
void never;
```

Add `Stream` to the `effect` import, `Launch` to the `sewed` import. Note the `undefined as unknown as App.Instance` spelling is the one `packages/forge/test/types.ts:27` already uses for a handle a contract file has no way to acquire; it is the only cast the plan allows, and only in a `*-types.ts` file.

Before the implementation exists, `tsc -p packages/sewed/test/tsconfig.json` must fail on `App.claimInstance` and `Launch.SecondInstance` not existing. After Step 5, strip each `@ts-expect-error` in turn, run the same command, and confirm each produces an error on exactly that line; restore it.

- [ ] **Step 2: Write the failing tests for the Electron-free core**

```ts
// packages/sewed/test/instance.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Exit, Fiber, Scope, Stream } from "effect";
import * as Instance from "../src/internal/Instance.ts";
import { waitUntil } from "./wait.ts";

type Listener = Parameters<Instance.Native["on"]>[1];

/** A structural stand-in for the slice of Electron's `app` the claim uses. */
const fakeNative = (primary: boolean) => {
  const calls: string[] = [];
  const listeners = new Set<Listener>();
  let requested: unknown;
  const native: Instance.Native = {
    requestSingleInstanceLock(data) {
      requested = data;
      calls.push("request");
      return primary;
    },
    releaseSingleInstanceLock() {
      calls.push("release");
    },
    on(_event, listener) {
      listeners.add(listener);
      calls.push("on");
    },
    off(_event, listener) {
      listeners.delete(listener);
      calls.push("off");
    },
  };
  return {
    native,
    calls,
    requested: () => requested,
    listeners,
    emit: (argv: string[], workingDirectory: string, additionalData: unknown) => {
      for (const listener of listeners) listener(undefined, argv, workingDirectory, additionalData);
    },
  };
};

test("a primary claim requests the lock with its decoded data and listens for second instances", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* instances.claim({ data: { source: "desktop" } });
        assert.deepEqual(fake.requested(), { source: "desktop" });
        assert.deepEqual(fake.calls, ["request", "on"]);
      }),
    ),
  );
  assert.deepEqual(fake.calls, ["request", "on", "off", "release"]);
  assert.equal(fake.listeners.size, 0);
});

test("a secondary claim fails SecondaryInstance after the lock call forwarded its arguments, and holds nothing", async () => {
  const fake = fakeNative(false);
  const instances = Instance.make(fake.native);
  const exit = await Effect.runPromiseExit(Effect.scoped(instances.claim({ data: { a: 1 } })));
  assert.ok(Exit.isFailure(exit));
  const error = await Effect.runPromise(Effect.flip(Effect.scoped(instances.claim())));
  assert.equal(error._tag, "SecondaryInstance");
  assert.deepEqual(fake.calls, ["request", "request"]);
  assert.equal(fake.listeners.size, 0);
});

test("later launches reach the stream with null for absent data, and are retained before a consumer exists", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const instance = yield* instances.claim();
        fake.emit(["app", "--open=1"], "/work", { token: "t" });
        fake.emit(["app"], "/work", undefined);
        const launches = yield* instance.launches.pipe(Stream.take(2), Stream.runCollect);
        assert.deepEqual(launches, [
          {
            arguments: ["app", "--open=1"],
            workingDirectory: "/work",
            additionalData: { token: "t" },
          },
          { arguments: ["app"], workingDirectory: "/work", additionalData: null },
        ]);
      }),
    ),
  );
});

test("the stream has one consumer at a time, and fails Closed once the claim's scope closes", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  const scope = await Effect.runPromise(Scope.make());
  const instance = await Effect.runPromise(
    instances.claim().pipe(Effect.provideService(Scope.Scope, scope)),
  );
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const observing = yield* Deferred.make<void>();
        const first = yield* instance.launches.pipe(
          Stream.tap(() => Deferred.succeed(observing, undefined)),
          Stream.runDrain,
          Effect.forkScoped,
        );
        fake.emit(["app"], "/work", null);
        yield* Deferred.await(observing);
        const duplicate = yield* instance.launches.pipe(Stream.runDrain, Effect.flip);
        assert.equal(duplicate.code, "Limit");
        yield* Fiber.interrupt(first);
      }),
    ),
  );
  await Effect.runPromise(Scope.close(scope, Exit.void));
  const closed = await Effect.runPromise(instance.launches.pipe(Stream.runDrain, Effect.flip));
  assert.equal(closed.code, "Closed");
  assert.deepEqual(fake.calls, ["request", "on", "off", "release"]);
});

test("a second concurrent claim fails Limit; a claim after release succeeds", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* instances.claim();
        const second = yield* Effect.flip(Effect.scoped(instances.claim()));
        assert.equal(second._tag, "SewedError");
        if (second._tag === "SewedError") assert.equal(second.code, "Limit");
      }),
    ),
  );
  await Effect.runPromise(Effect.scoped(instances.claim()));
  assert.deepEqual(fake.calls, [
    "request",
    "on",
    "off",
    "release",
    "request",
    "on",
    "off",
    "release",
  ]);
});

test("invalid data fails Protocol before the lock is requested, and a native throw fails Native", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  const invalid = await Effect.runPromise(
    Effect.flip(Effect.scoped(instances.claim({ data: { callback: () => {} } as never }))),
  );
  assert.equal(invalid._tag, "SewedError");
  if (invalid._tag === "SewedError") assert.equal(invalid.code, "Protocol");
  assert.deepEqual(fake.calls, []);
  const throwing = Instance.make({
    ...fake.native,
    requestSingleInstanceLock() {
      throw new Error("no lock");
    },
  });
  const failure = await Effect.runPromise(Effect.flip(Effect.scoped(throwing.claim())));
  assert.equal(failure._tag, "SewedError");
  if (failure._tag === "SewedError") assert.equal(failure.code, "Native");
});

test("a launch over 256 KiB fails the consumer with Limit after earlier launches drain", async () => {
  const fake = fakeNative(true);
  const instances = Instance.make(fake.native);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const instance = yield* instances.claim();
        fake.emit(["app"], "/work", null);
        fake.emit(["app"], "/work", { blob: "x".repeat(262144) });
        const collected: unknown[] = [];
        const error = yield* instance.launches.pipe(
          Stream.runForEach((launch) => Effect.sync(() => collected.push(launch))),
          Effect.flip,
        );
        assert.equal(collected.length, 1);
        assert.equal(error.code, "Limit");
      }),
    ),
  );
});

void waitUntil;
```

The `as never` in the invalid-data test is the one place a runtime test feeds a value its type forbids; a `*.test.ts` file is not type-checked, so it is documentation, not a cast the compiler sees. Remove the `void waitUntil` line and its import if no test ends up needing the helper.

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --import tsx --test --test-timeout=20000 packages/sewed/test/instance.test.ts`
Expected: FAIL — `Cannot find module '../src/internal/Instance.ts'`.

- [ ] **Step 4: Extract the launch queue and write the instance core**

`packages/sewed/src/internal/LaunchQueue.ts`:

```ts
import { Cause, Effect, Queue, Stream } from "effect";
import { SewedError } from "../SewedError.ts";

export interface LaunchQueue<A> {
  /** Decodes and enqueues one native launch; a bad or oversized one fails the consumer instead. */
  readonly offer: (value: unknown) => void;
  /** The launches, in order, to exactly one draining consumer at a time. */
  readonly launches: Stream.Stream<A, SewedError>;
  /** Ends the queue: buffered launches still drain, and a later consumer fails `Closed`. */
  readonly end: () => void;
}

/**
 * One ordered, bounded queue of launch requests. Two owners share it: the application's own
 * launches (`internal/AppRuntime.ts`: initial, file, url) and a claimed instance's second-instance
 * launches (`internal/Instance.ts`). Launches offered before a consumer exists are retained, so a
 * launch that arrives before the program subscribes is not lost; the capacity is 128 and a launch
 * is at most 256 KiB, and overflow of either fails the consumer with `Limit` after what was
 * buffered drains. There is exactly one draining consumer; a second fails `Limit`.
 */
export const make = <A>(what: string, decode: (value: unknown) => A): LaunchQueue<A> => {
  const queue = Effect.runSync(
    Queue.make<A, SewedError | Cause.Done>({ capacity: 128, strategy: "dropping" }),
  );
  let observing = false;
  let closed = false;
  return {
    offer(value) {
      if (closed) return;
      try {
        const request = decode(value);
        if (Buffer.byteLength(JSON.stringify(request)) > 262144) {
          throw new SewedError({ code: "Limit", message: `${what} exceeds 256 KiB` });
        }
        if (!Queue.offerUnsafe(queue, request)) {
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(new SewedError({ code: "Limit", message: `${what} queue is full` })),
          );
        }
      } catch (cause) {
        Queue.failCauseUnsafe(
          queue,
          Cause.fail(
            cause instanceof SewedError
              ? cause
              : new SewedError({
                  code: "Protocol",
                  message: `Invalid ${what.toLowerCase()}`,
                  cause,
                }),
          ),
        );
      }
    },
    launches: Stream.unwrap(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.suspend(() => {
            if (closed)
              return Effect.fail(
                new SewedError({ code: "Closed", message: `${what} owner is closed` }),
              );
            if (observing)
              return Effect.fail(
                new SewedError({ code: "Limit", message: `${what} already has a consumer` }),
              );
            observing = true;
            return Effect.void;
          }),
          () =>
            Effect.sync(() => {
              observing = false;
            }),
        );
        return Stream.fromQueue(queue);
      }),
    ),
    end() {
      closed = true;
      Queue.endUnsafe(queue);
    },
  };
};
```

`packages/sewed/src/internal/AppRuntime.ts` becomes:

```ts
import { Context, Schema } from "effect";
import { App } from "../Decidables.ts";
import { Request } from "../Launch.ts";
import * as CloseGate from "./CloseGate.ts";
import * as Registry from "./DecisionRegistry.ts";
import * as LaunchQueue from "./LaunchQueue.ts";

const decode = Schema.decodeUnknownSync(Request);

export const make = (approveQuit: () => void) => {
  const registry = Registry.make({ owner: "app" });
  const queue = LaunchQueue.make("Application launch", decode);
  let closed = false;
  const gate = CloseGate.make(approveQuit, registry, App.Quit, {}, "allow");
  return {
    registry,
    gate,
    /** What `App.decide` reads through `Registry.decide`'s `Control`, so it refuses after this closes. */
    isClosed: () => closed,
    offer: queue.offer,
    launches: queue.launches,
    close() {
      closed = true;
      queue.end();
      return gate.close();
    },
  };
};

export class Owner extends Context.Service<Owner, ReturnType<typeof make>>()(
  "sewed/internal/AppRuntime",
) {}
```

`packages/sewed/src/Launch.ts`:

```ts
import { Schema } from "effect";

const Arguments = Schema.Array(Schema.String);

/** How this process was launched: its own arguments, or a file or URL the platform handed it. */
export const Request = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("initial"),
    arguments: Arguments,
    workingDirectory: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("file"), path: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("url"), url: Schema.String }),
]);
export type Request = typeof Request.Type;

/**
 * A later launch of the application while this process holds the single-instance lock: the other
 * process's arguments and working directory, and the JSON `data` it claimed with (`null` when it
 * claimed with none). Delivered on `App.Instance`'s `launches`, never on `App.launches`.
 */
export const SecondInstance = Schema.Struct({
  arguments: Arguments,
  workingDirectory: Schema.String,
  additionalData: Schema.Json,
});
export type SecondInstance = typeof SecondInstance.Type;
```

`packages/sewed/src/internal/Instance.ts`:

```ts
import { Effect, Schema } from "effect";
import type { Scope, Stream } from "effect";
import { SecondInstance } from "../Launch.ts";
import { SewedError } from "../SewedError.ts";
import * as LaunchQueue from "./LaunchQueue.ts";

/**
 * Another process already holds the single-instance lock. Electron forwarded this process's
 * arguments, working directory and claim data to it inside the lock request, so nothing is lost;
 * what remains is for the program to decide how this process exits.
 */
export class SecondaryInstance extends Schema.TaggedError<SecondaryInstance>()(
  "SecondaryInstance",
  {},
) {
  override get message(): string {
    return "Another process holds the single-instance lock; this launch was forwarded to it";
  }
}

export interface Options {
  /** A JSON object forwarded to the primary process when this one turns out to be secondary. */
  readonly data?: typeof Schema.JsonObject.Type;
}

/** The claimed single instance: the launches of later processes, for as long as the claim's scope lives. */
export interface Instance {
  readonly launches: Stream.Stream<SecondInstance, SewedError>;
}

type Listener = (
  event: unknown,
  argv: string[],
  workingDirectory: string,
  additionalData: unknown,
) => void;

/** The slice of Electron's `app` a claim uses; `App.ts` hands this module the real one. */
export interface Native {
  requestSingleInstanceLock(data?: Record<string, unknown>): boolean;
  releaseSingleInstanceLock(): void;
  on(event: "second-instance", listener: Listener): unknown;
  off(event: "second-instance", listener: Listener): unknown;
}

const decodeData = Schema.decodeUnknownSync(Schema.JsonObject);
const decodeLaunch = Schema.decodeUnknownSync(SecondInstance);

/**
 * The single-instance claim over one native `app`. One claim may be held at a time; a second
 * fails `Limit` rather than asking Electron, which would answer `true` to the holder and leave two
 * scopes believing they own one lock.
 */
export const make = (native: Native) => {
  let held = false;
  const claim = (
    options: Options = {},
  ): Effect.Effect<Instance, SewedError | SecondaryInstance, Scope.Scope> =>
    Effect.acquireRelease(
      Effect.suspend(() => {
        if (held)
          return Effect.fail(
            new SewedError({ code: "Limit", message: "The single instance is already claimed" }),
          );
        let data: typeof Schema.JsonObject.Type;
        try {
          data = decodeData(options.data ?? {});
        } catch (cause) {
          return Effect.fail(
            new SewedError({ code: "Protocol", message: "Invalid instance data", cause }),
          );
        }
        let primary: boolean;
        try {
          primary = native.requestSingleInstanceLock(data);
        } catch (cause) {
          return Effect.fail(
            new SewedError({
              code: "Native",
              message: "Could not request the single-instance lock",
              cause,
            }),
          );
        }
        if (!primary) return Effect.fail(new SecondaryInstance({}));
        held = true;
        const queue = LaunchQueue.make("Second-instance launch", decodeLaunch);
        const listener: Listener = (_event, argv, workingDirectory, additionalData) =>
          queue.offer({
            arguments: argv,
            workingDirectory,
            additionalData: additionalData ?? null,
          });
        native.on("second-instance", listener);
        return Effect.succeed({
          instance: { launches: queue.launches },
          release: () => {
            native.off("second-instance", listener);
            queue.end();
            native.releaseSingleInstanceLock();
            held = false;
          },
        });
      }),
      ({ release }) => Effect.sync(release),
    ).pipe(Effect.map(({ instance }) => instance));
  return { claim };
};
```

If `Schema.TaggedError` with empty fields does not accept `new SecondaryInstance({})` or refuses the `message` override, read `packages/sewed/src/SewedError.ts` and Effect's `Schema.d.ts` for the constructor shape and adjust — the contract is `_tag: "SecondaryInstance"` and a message that says what happened; the spelling is the implementer's.

- [ ] **Step 5: Wire `App.ts`**

In `packages/sewed/src/App.ts`:

- Remove `singleInstance` from `Options` and its doc.
- Add `import * as Instance from "./internal/Instance.ts";` and, after the `launches` export:

```ts
export { SecondaryInstance } from "./internal/Instance.ts";
export type { Instance } from "./internal/Instance.ts";

// Inert: captures `app`, calls nothing. The compiler proves `app` satisfies `Instance.Native`; the
// playground's lifecycle fixture proves the lock and the forwarded launch against real Electron.
const instances = Instance.make(app);

/**
 * Claims the single instance for the caller's scope, when the program chooses — after any
 * launcher or handoff checks it wants to run first. A second process's claim fails
 * {@link SecondaryInstance} once Electron has forwarded its arguments to this one, and that
 * process's program decides how to exit. Later launches arrive on the instance's `launches`; the
 * lock is released when the scope closes. One claim may be held at a time; a second fails `Limit`.
 */
export const claimInstance = (
  options?: Instance.Options,
): Effect.Effect<
  Instance.Instance,
  SewedError | Instance.SecondaryInstance,
  MainContext | Scope.Scope
> => Effect.andThen(MainContext, instances.claim(options));
```

- In `run`: delete the `secondInstance` listener, its `app.on`/`app.off` lines, the `singleInstance` branch of `admission` (it returns `{ status: "primary", locked: false }` unconditionally now — simplify to the try/catch returning `undefined` on success and the `Startup` error on failure), the `admission.status === "secondary"` early return, the `releaseSingleInstanceLock` line and the `app.exit(0)` branch. Keep everything else exactly as it is.

- [ ] **Step 6: Run the tests and the type contracts**

Run: `pnpm build && node --import tsx --test --test-timeout=20000 packages/sewed/test/instance.test.ts packages/sewed/test/lifecycle.test.ts && tsc -p packages/sewed/test/tsconfig.json`
Expected: PASS. `lifecycle.test.ts` imports the built `lib/internal/AppRuntime.js`, so `pnpm build` must precede it; its launch-queue tests are the extraction's regression suite. Then strip each of the three `@ts-expect-error` lines in `lifecycle-types.ts` in turn and confirm the error.

- [ ] **Step 7: Add the guide example to the type-checked contract**

In `packages/sewed/test/guide-examples-types.ts`, add a section:

```ts
// --- docs/app-lifecycle.md --------------------------------------------------------------------

declare const launcherChecks: Effect.Effect<void, SewedError, MainContext>;
declare const focusMainWindow: Effect.Effect<void, SewedError>;

// "Claim the instance when the program chooses; a secondary process catches the failure and quits."
export const appLifecycleClaim: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  Effect.gen(function* () {
    yield* launcherChecks;
    const instance = yield* App.claimInstance({ data: { source: "desktop" } });
    yield* instance.launches.pipe(
      Stream.runForEach(() => focusMainWindow),
      Effect.forkScoped,
    );
  }).pipe(Effect.catchTag("SecondaryInstance", () => App.quit));
```

Add `Stream` to its `effect` import.

- [ ] **Step 8: Rewrite the guide's launch-ownership section**

Replace `docs/app-lifecycle.md` lines 5–24 (`## Launch ownership` through the macOS paragraph) with:

````markdown
## Launch ownership

```ts
const program = Effect.gen(function* () {
  yield* launcherChecks;
  const instance = yield* App.claimInstance({ data: { source: "desktop" } });
  yield* instance.launches.pipe(
    Stream.runForEach(() => focusMainWindow),
    Effect.forkScoped,
  );
}).pipe(Effect.catchTag("SecondaryInstance", () => App.quit));
```

`App.claimInstance` claims Electron's single-instance lock for the caller's scope, when the program chooses: an application that runs launcher or handoff checks first claims after them, and one that wants the cheapest possible secondary exit claims first. The claim's `data` is a JSON object. A second process's claim fails `App.SecondaryInstance`, a tagged error, once Electron has forwarded that process's arguments, working directory and `data` to the holder; the program decides how that process exits, and `App.quit` in a `catchTag` is the quiet way. `App.run` does not treat the failure specially: left uncaught, it exits with code 1 like any other. The lock is released when the claim's scope closes. One claim may be held at a time; a second fails `Limit`.

`instance.launches` is a `Stream<Launch.SecondInstance, SewedError>` of later launches, each carrying `arguments`, `workingDirectory` and the JSON `additionalData` the other process claimed with (`null` when it claimed with none). `App.launches` is a `Stream<Launch.Request, SewedError, MainContext>` of this process's own launch facts:

| Kind      | Data                            |
| --------- | ------------------------------- |
| `initial` | `arguments`, `workingDirectory` |
| `file`    | `path`                          |
| `url`     | `url`                           |

Each stream owns one ordered queue with capacity 128. Launches that arrive before the program subscribes remain available — file and URL requests received before readiness, and second instances between the claim and the subscription. There is exactly one draining consumer per stream; a second simultaneous consumer fails with `Limit`. Interrupting the consumer leaves undelivered launches in the queue. Delivered launches are not replayed. Malformed native data fails with `Protocol`; queue overflow or a launch larger than 256 KiB fails with `Limit` after already buffered launches drain. Closing the application ends `App.launches`, and closing the claim's scope ends `instance.launches`; subscribing afterward fails with `Closed`.

On macOS, Electron's [`open-file` and `open-url` events](https://www.electronjs.org/docs/latest/api/app) can arrive before readiness. Call `App.run` in the entry module without first awaiting readiness or unrelated initialization. On Windows and Linux, interpret the initial and second-instance argument lists according to the application's own contract. Platform URL handlers and file associations still require application packaging configuration. Launch input is external data: select allowed schemes and destinations before acting on it.
````

In `docs/api.md:118`, replace `` `App.run(program, { singleInstance: {} })` opts into single-instance launch routing. `App.launches` has one ordered, bounded consumer and retains events captured before readiness. `` with `` `App.claimInstance` claims the single-instance lock for the caller's scope, when the program chooses; a secondary process fails `App.SecondaryInstance` after its arguments were forwarded. `App.launches` and the claim's `launches` each have one ordered, bounded consumer and retain launches that arrived before it. ``

- [ ] **Step 9: Migrate the playground's lifecycle fixture**

In `/home/lucas/personal/typescript/sewed-playground/scripts/lifecycle-foundations-fixture.mjs`:

- Secondary role (lines 124–147): the secondary now runs its program up to the claim. Replace the `secondarySetup` / `App.run(...)` block with:

```js
const secondaryProgram = Effect.gen(function* () {
  yield* App.decide(
    Decidables.App.LastWindowClosed,
    Decision.sync(() => "stay"),
  );
  writeJsonSync(path.join(root, "secondary-checks-ran.json"), {
    pid: process.pid,
    userData: safeUserData(),
  });
  yield* App.claimInstance({ data: secondaryAdditionalData });
  state.secondarySetupRan = true;
  writeJsonSync(path.join(root, "secondary-setup-ran.json"), { pid: process.pid });
  process.exit(91);
}).pipe(Effect.catchTag("SecondaryInstance", () => App.quit));
App.run(secondaryProgram);
```

- Primary role: replace the `App.run(prepareApplication…, { singleInstance: … })` call at lines 586–603 with `App.run(prepareApplication.pipe(...))` (no options), and inside `prepareApplication`, immediately after `yield* runLaunchChecks(launchFiber, expectedInitialArguments);`, add:

```js
const instance =
  yield *
  App.claimInstance({
    data: { kind: "lifecycle-foundations-primary", pid: process.pid },
  });
yield *
  instance.launches.pipe(
    Stream.runForEach((launch) =>
      Effect.sync(() => state.launches.push({ kind: "second-instance", ...launch })),
    ),
    Effect.forkScoped,
  );
```

- Secondary assertions (lines 483–493): keep `exitCode === 0` and `setupRan === false`; add `assert.equal(existsSync(path.join(root, "secondary-checks-ran.json")), true)` so the fixture proves the secondary ran its checks before the claim and stopped at it; the `second-instance` assertions on `state.launches` keep working through the `kind` the fixture now adds itself.

In the playground `README.md:168`, describe the lifecycle script as proving that a secondary process runs its checks, fails its claim after forwarding, and quits with code 0, while the primary receives the forwarded launch on `instance.launches`.

- [ ] **Step 10: Pack, reinstall, and run the lifecycle verification**

```bash
node scripts/release.mjs pack .artifacts
cd /home/lucas/personal/typescript/sewed-playground && pnpm install --offline 2>/dev/null || pnpm install
pnpm build && env -u FORCE_COLOR pnpm verify:lifecycle
```

Expected: `verify:lifecycle` passes. The playground's `package.json` points at `../sewed-round-two/.artifacts/*.tgz`, so pack from this worktree. If `pnpm install` reports the tarball unchanged, delete `node_modules/sewed` and `node_modules/.pnpm/sewed@*` there first.

- [ ] **Step 11: Regenerate the reference, run every check, and commit**

```bash
pnpm build && pnpm docs:reference && pnpm format && timeout 240 pnpm test && pnpm format:check
git add -A packages/sewed docs/app-lifecycle.md docs/api.md docs/reference.md
git commit -m "feat(app): claim the single instance as a scoped resource, when the program chooses"
```

---

### Task 2: The application menu as a resource

`App.menu(options)` acquires the menu for the caller's scope and hands back `replace` and `selections`; `App.run` drops `menu`, and `App.setMenu`, `App.menuSelections` and the `ApplicationMenu.Owner` service go.

**Files:**

- Modify: `packages/sewed/src/internal/ApplicationMenu.ts`, `packages/sewed/src/App.ts`
- Test: modify `packages/sewed/test/types.ts:600-622`, `packages/sewed/test/app-extras-types.ts:175-185`, `packages/sewed/test/guide-examples-types.ts`
- Docs: `docs/application-menus.md`, `docs/api.md:98`, `docs/electron-coverage.md:447`, `docs/reference.md`
- Playground: `scripts/application-menu-fixture.mjs`, `README.md:158`

**Interfaces:**

- Consumes: `Menu.ApplicationOptions`, `Menu.Selection` (`packages/sewed/src/Menu.ts`), `ApplicationMenu.make`.
- Produces: `App.menu(options): Effect<App.Menu, SewedError, MainContext | Scope>`; `App.Menu = { replace(options): Effect<void, SewedError>; selections: Stream<Menu.Selection, SewedError> }`.

- [ ] **Step 1: Write the contract, and prove the negatives bite**

In `packages/sewed/test/types.ts`, replace the block at lines 600–622 (`App.run(…, { menu: applicationOptions })`, the `App.menuSelections` typing, and the four `@ts-expect-error` `menu` cases) with:

```ts
// Step 3: the application menu is a scoped resource the program acquires; step 4 replaces it
// with contributions.
const applicationMenu: Effect.Effect<App.Menu, SewedError, MainContext | Scope.Scope> =
  App.menu(applicationOptions);
const menuSelections: Stream.Stream<Menu.Selection, SewedError> = Effect.runSync(
  Effect.succeed(undefined as unknown as App.Menu),
).selections;
const replaced: Effect.Effect<void, SewedError> = Effect.runSync(
  Effect.succeed(undefined as unknown as App.Menu),
).replace(applicationOptions);
// @ts-expect-error `menu` is no longer an App.run option; acquire the menu with App.menu.
App.run(Effect.void, { menu: applicationOptions });
// @ts-expect-error App.setMenu is gone; the menu handle's `replace` is the operation.
App.setMenu(applicationOptions);
// @ts-expect-error App.menuSelections is gone; the menu handle's `selections` is the stream.
App.menuSelections;
// @ts-expect-error a role item at the top level needs a submenu role, as before.
App.menu({ items: [{ kind: "role", role: "undo" }] });
void applicationMenu;
void menuSelections;
void replaced;
```

Keep whichever of the four old negative cases were about the _options schema_ (not about the `menu` option's existence) by pointing them at `App.menu(...)` instead — read them first; each documents a rule the schema still enforces. Delete `packages/sewed/test/app-extras-types.ts:175-185` (`App.setMenu` typing) and, in the same file, keep nothing that names `setMenu`. Run `tsc -p packages/sewed/test/tsconfig.json` and confirm it fails on `App.menu` not existing.

- [ ] **Step 2: Turn `ApplicationMenu.make` into the handle**

`packages/sewed/src/internal/ApplicationMenu.ts`: remove the `Owner` class, `replace` and `selections`. `make` keeps its acquire/release and its `install`, refuses a second live menu, and returns the handle:

```ts
export interface Handle {
  /** Replaces the menu; the replaced menu's callbacks stop and nothing is restored. */
  readonly replace: (options: Menu.ApplicationOptions) => Effect.Effect<void, SewedError>;
  /** Future custom selections, to any number of observers, each with a queue of 128. */
  readonly selections: Stream.Stream<Menu.Selection, SewedError>;
}

let installed = false;

/**
 * Installs the application menu for the caller's scope. Shared native state has one owner, so a
 * second live menu fails `Limit`. Releasing stops this menu's callbacks and fails its observers
 * `Closed`; it does not restore or clear the native menu — restoring one was tried on X11 and left
 * an open submenu on screen, which `docs/application-menus.md` records.
 */
export const make = (
  options: Menu.ApplicationOptions,
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    // … observers, closed, install as today …
    yield* Effect.acquireRelease(
      Effect.suspend(() =>
        installed
          ? Effect.fail(new SewedError({ code: "Limit", message: "An application menu is already installed" }))
          : Effect.try({
              try: () => {
                install(options);
                installed = true;
              },
              catch: (cause) =>
                cause instanceof Schema.SchemaError
                  ? new SewedError({ code: "Protocol", message: "Invalid application menu", cause })
                  : new SewedError({ code: "Native", message: "Could not install application menu", cause }),
            }),
      ),
      () =>
        Effect.sync(() => {
          closed = true;
          installed = false;
          for (const queue of observers) Queue.failCauseUnsafe(queue, Cause.fail(closedError()));
          observers.clear();
        }),
    );
    const observe = (queue: Observer): Effect.Effect<void, SewedError, Scope.Scope> => /* as today */;
    return {
      replace: /* as today */,
      selections: Stream.callback<Menu.Selection, SewedError>(
        (queue) => observe(queue).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
        { bufferSize: 128 },
      ),
    };
  });
```

Invalid options at acquisition now fail `Protocol`, matching `replace`; the old `make` wrapped them as `Native` only because `App.run` reported every startup failure the same way.

- [ ] **Step 3: Wire `App.ts`**

Remove `menu` from `Options`, the `menuSelections` and `setMenu` exports, and the `menu`/`program` lines inside `run` (the program is `setup` directly). Add:

```ts
export type Menu = ApplicationMenu.Handle;

/**
 * Installs the application menu for the caller's scope and returns its handle: `replace` swaps
 * the menu, `selections` streams custom selections. One menu at a time; a second fails `Limit`.
 * Release stops the menu's callbacks without restoring or clearing the native menu. Step 4 of the
 * platform redesign replaces this with contributions.
 */
export const menu = ApplicationMenu.make;
```

`App.ts` imports `Menu.ts` as `type * as Menu` for `Menu.ApplicationOptions`; rename that import to `MenuSchema` so the exported handle type can be `App.Menu`.

- [ ] **Step 4: Type-check and prove the negatives**

Run: `pnpm build && tsc -p packages/sewed/test/tsconfig.json`
Expected: PASS. Strip each `@ts-expect-error` from Step 1 in turn and confirm each errors.

- [ ] **Step 5: Update the guide example contract**

In `packages/sewed/test/guide-examples-types.ts`, add:

```ts
// --- docs/application-menus.md ----------------------------------------------------------------

// "Acquire the menu in the program; observe its selections from the handle."
export const applicationMenusExample: Program = Effect.gen(function* () {
  const menu = yield* App.menu({
    items: [
      {
        kind: "submenu",
        label: "&Window",
        items: [
          {
            kind: "command",
            id: "show",
            label: "Show window",
            accelerator: "CommandOrControl+Shift+S",
          },
          { kind: "role", role: "close" },
        ],
      },
      { kind: "role", role: "editMenu" },
    ],
  });
  yield* menu.selections.pipe(
    Stream.runForEach((selection) =>
      selection.kind === "command" && selection.id === "show" ? window.show : Effect.void,
    ),
    Effect.forkScoped,
  );
});
```

- [ ] **Step 6: Rewrite the guide**

`docs/application-menus.md`: the opening paragraph and example become the acquisition above (`const menu = yield* App.menu({ items })` inside `App.run([], Effect.gen(...))`, with the `Match`-based dispatch the guide has today reading from `menu.selections`). Under `## Data and boundaries`, "Menu installation belongs to `App.run` in `sewed/main`. `App.menuSelections` retains `MainContext`…" becomes "Menu installation is `App.menu` in `sewed/main`, a scoped main resource; its `selections` stream carries no requirement of its own because the handle was acquired under `MainContext`." Under `## Lifetimes and failure`, "`App.run` installs the configured menu once" becomes "`App.menu` installs the menu once for its scope", "Omitting `menu` leaves Electron's default…; observing `App.menuSelections` in that application fails…" becomes "An application that never calls `App.menu` keeps Electron's default menu behavior; a second live `App.menu` fails `Limit`", and "Invalid options … become `Native` errors … fail `App.run` before setup starts" becomes "Invalid options fail acquisition with `Protocol`; native construction or installation failures fail it with `Native`." `## Replacing the menu` describes `menu.replace(options)` with the same semantics minus the "started without `menu`" case, which is now the `Limit`/`Closed` pair above. `## Design decision` keeps the X11 finding verbatim and ends: "The scoped handle here therefore does not restore on release; it stops the menu's callbacks and leaves the native menu in place. It is the interim path between this step and the contribution model, which replaces it." Update `docs/api.md:98` and `docs/electron-coverage.md:447` to name `App.menu` and the handle's `replace` instead of `App.setMenu`.

- [ ] **Step 7: Migrate the playground fixture**

In `/home/lucas/personal/typescript/sewed-playground/scripts/application-menu-fixture.mjs`: `App.run(program, scenario === "none" ? {} : { menu })` at line 585 becomes `App.run(program)` with the program acquiring `const menu = scenario === "none" ? undefined : yield* App.menu(menuOptions)` first; `App.menuSelections` at line 160 becomes `menu.selections`; `App.setMenu(...)` at 200, 509 and 525 become `menu.replace(...)`; where the fixture asserts that `setMenu` in a `none` scenario fails `Closed`, assert instead that observing a menu never acquired is impossible and that a second `App.menu` fails `Limit`. Update `README.md:158` accordingly.

- [ ] **Step 8: Pack and verify**

```bash
node scripts/release.mjs pack .artifacts
cd /home/lucas/personal/typescript/sewed-playground && pnpm install && pnpm build
```

`verify:application-menus` needs Xvfb, Openbox and a private D-Bus session on this machine (`pnpm ui-tools` builds the wrappers; then `SEWED_XVFB_TIMEOUT=3600 env -u FORCE_COLOR <wrapper> dbus-run-session -- pnpm verify:application-menus`). Run it if the wrappers exist under the playground's tool directory; otherwise record that Task 4's sweep proves it and continue.

- [ ] **Step 9: Regenerate the reference, run every check, and commit**

```bash
pnpm build && pnpm docs:reference && pnpm format && timeout 240 pnpm test && pnpm format:check
git add -A packages/sewed docs
git commit -m "feat(app): the application menu is a scoped resource the program acquires"
```

---

### Task 3: Declarations, and `App.run(declarations, program)`

The `Declaration` value, the Electron-free walker and factories, every `declare`, the crash reporter's, and the signature flip that removes the options object.

**Files:**

- Create: `packages/sewed/src/Declaration.ts`, `packages/sewed/src/internal/Declarations.ts`, `packages/sewed/src/CommandLine.ts`, `packages/sewed/src/Paths.ts`, `packages/sewed/src/Gpu.ts`
- Modify: `packages/sewed/src/App.ts`, `packages/sewed/src/main.ts`, `packages/sewed/src/Application.ts`, `packages/sewed/src/internal/Protocol.ts`, `packages/sewed/src/internal/StandardSchemes.ts`, `packages/forge/src/CrashReporter.ts`, `packages/forge/src/CrashReporterSchema.ts`
- Test: create `packages/sewed/test/declarations.test.ts`, `packages/sewed/test/declaration-types.ts`; modify `packages/sewed/test/app-extras-types.ts:77-84,192-194`, `packages/sewed/test/session-resources-types.ts:74`, `packages/sewed/test/lifecycle-types.ts`, `packages/sewed/test/types.ts`, `packages/sewed/test/guide-examples-types.ts`, `packages/forge/test/types.ts:43-52`
- Docs: `docs/app-lifecycle.md:131-135`, `docs/session-resources.md:24-33`, `docs/forge.md:67-94`, `packages/forge/README.md:70-84`, `docs/native-policy.md:284`, `docs/api.md:68,84,96`, `docs/electron-coverage.md:366`, every no-options `App.run` example (`docs/getting-started.md:69`, `docs/devtools.md:15`, `docs/context-menus.md:9`, `docs/dialogs.md:15`, `docs/sessions.md:9`, `docs/utility-processes.md:26`, `docs/electron-coverage.md:17,53`, `README.md:40`, `packages/create/template/src/main/app.ts:7`), `docs/reference.md`
- Playground: `scripts/session-resources-fixture.mjs`, `scripts/app-extras-fixture.mjs`, `scripts/forge-fixture.mjs`, and the 29 no-options call sites (`src/main/app.ts:88`; `scripts/platform-fixture.mjs:209`, `transport-fixture.mjs:92`, `resource-inspection-fixture.mjs:205`, `diagnostics-fixture.mjs:105`, `menu-fixture.mjs:533`, `webcontents-fixture.mjs:682`, `remote-fixture.mjs:324`, `file-dialog-fixture.mjs:658`, `session-extras-fixture.mjs:669`, `guest-fixture.mjs:580`, `binary-fixture.mjs:17`, `operations-fixture.mjs:143`, `webcontents-extras-fixture.mjs:424`, `surfaces-fixture.mjs:405`, `desktop-resources-fixture.mjs:758`, `native-views-fixture.mjs:410`, `dialog-fixture.mjs:440`, `session-fixture.mjs:725`, `app-lifecycle-fixture.mjs:548`, `screen-fixture.mjs:414`, `responsiveness-fixture.mjs:25`, `utility-process-fixture.mjs:755`, `window-controls-fixture.mjs:1105`, `devtools-fixture.mjs:439`, `dx-fixture.mjs:298`, `lifecycle-finalizer-failure.mjs:5`, `verify-development.mjs:253` (inside a template string), plus `lifecycle-foundations-fixture.mjs` and `application-menu-fixture.mjs` as Tasks 1 and 2 left them), `README.md:175`

**Interfaces:**

- Consumes: `Application.CommandLineSwitch`, `Application.PathName`, `Protocol.Scheme`, `registerSchemes` (`internal/Protocol.ts:86`), `CrashReporter.Options`.
- Produces: `Declaration.Declaration`, `Declaration.Entry`, `Declaration.Definition`, `Declaration.make(name, apply)`, `Declaration.definition(value)`; `Declarations.apply(entries): SewedError | undefined`, `Declarations.commandLine(native, flag)`, `Declarations.paths(native, table)`, `Declarations.gpu(native, options)`, `Declarations.identity(native, options)`, `Declarations.PathTable`; `CommandLine.declare(flag)`, `Paths.declare(table)`, `Paths.Table`, `Gpu.declare(options)`, `Gpu.Options`, `App.declare(options)`, `Application.Gpu`, `Application.Identity`, `Protocol.declare(...schemes)`, `CrashReporter.declare(options)`, `CrashReporter.Declaration`; `App.run(declarations, program)`.

- [ ] **Step 1: Write the consumer's entry program as the contract**

Replace `packages/forge/test/types.ts:43-52` (the `App.run(…, { startup: [CrashReporter.startup(…)] })` block) with the program from "What the consumer writes", declared inputs included:

```ts
// The first consumer's entry, in its natural spelling: declarations before readiness, then the
// program claims the instance after its own checks. Every signature in step 3 answers to this.
declare const paths: { readonly session: string; readonly crashes: string };
declare const osLocale: () => string;
declare const launcherChecks: Effect.Effect<void, SewedError, MainContext>;
declare const handoff: Effect.Effect<boolean, SewedError, MainContext>;
declare const serve: Protocol.Handler;
const jobwright = Protocol.scheme("jobwright", {
  standard: true,
  secure: true,
  supportFetchAPI: true,
});
App.run(
  [
    Protocol.declare(jobwright),
    () => CommandLine.declare({ name: "lang", value: osLocale() }),
    Paths.declare({ sessionData: paths.session }),
    CrashReporter.declare({ directory: paths.crashes, uploadToServer: false }),
    Gpu.declare({ acceleration: true }),
  ],
  Effect.gen(function* () {
    yield* launcherChecks;
    if (yield* handoff) return yield* App.quit;
    const instance = yield* App.claimInstance({ data: { source: "desktop" } });
    const session = yield* Session.defaultSession;
    yield* Protocol.handle(session, jobwright, serve);
    const window = yield* BrowserWindow.make({ title: "Jobwright" });
    yield* instance.launches.pipe(
      Stream.runForEach(() => window.focus),
      Effect.forkScoped,
    );
  }).pipe(Effect.catchTag("SecondaryInstance", () => App.quit)),
);
// @ts-expect-error CrashReporter.startup is gone; declare the reporter.
CrashReporter.startup({ productName: "app" });
// @ts-expect-error a declaration is a value, not an Effect: it cannot be yielded after readiness.
Effect.gen(function* () {
  yield* CrashReporter.declare({ productName: "app" });
});
```

Import `Stream` from `effect`, `BrowserWindow`, `CommandLine`, `Gpu`, `Paths`, `Protocol`, `Session` from `sewed/main`. Read `packages/sewed/src/Session.ts` for the exact name of the default-session accessor and `packages/sewed/src/Protocol.ts` for `Handler`'s type parameters; use them as they are.

Create `packages/sewed/test/declaration-types.ts`:

```ts
import { Effect } from "effect";
import type { Scope } from "effect";
import { MainContext, RendererContext, SewedError } from "sewed";
import { App, CommandLine, Declaration, Gpu, Paths, Protocol } from "sewed/main";

declare const program: Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
declare const scheme: Protocol.Scheme;

// One signature: the declarations, then the program. Nothing to declare is an empty list.
App.run([], program);
App.run(
  [
    Protocol.declare(scheme, scheme),
    CommandLine.declare({ name: "lang", value: "en" }),
    CommandLine.declare({ name: "enable-logging" }),
    Paths.declare({ sessionData: "/tmp/session", crashDumps: "/tmp/crashes" }),
    Gpu.declare({ acceleration: false }),
    App.declare({ userModelId: "dev.sewed.app" }),
    Declaration.make("sandbox", () => {}),
    () => Paths.declare({ userData: "/tmp/data" }),
  ],
  program,
);
const value: Declaration.Declaration = Gpu.declare({ acceleration: true });
const thunk: Declaration.Entry = () => value;
// @ts-expect-error the program is the second argument; the first is the declaration list.
App.run(program);
// @ts-expect-error the options object is gone; each option is a declaration now.
App.run(program, { schemes: [scheme] });
// @ts-expect-error a thunk yields one declaration, not a list.
App.run([() => [value]], program);
// @ts-expect-error a declaration is not an Effect and cannot be yielded.
Effect.gen(function* () {
  yield* Gpu.declare({ acceleration: true });
});
// @ts-expect-error a path name outside Application.PathName is refused at compile time.
Paths.declare({ cache: "/tmp/cache" });
// @ts-expect-error a switch name has a fixed pattern, but its value is a string.
CommandLine.declare({ name: "lang", value: 1 });
// @ts-expect-error App.Startup is gone; Declaration.make is what it was.
const step: App.Startup = { name: "x", apply: () => {} };
// @ts-expect-error App.Options is gone.
const options: App.Options = {};
// @ts-expect-error a program that needs a renderer's context cannot be run by main.
App.run([], Effect.andThen(RendererContext, Effect.void));
void thunk;
void step;
void options;
```

Run `tsc -p packages/sewed/test/tsconfig.json` and `tsc -p packages/forge/test/tsconfig.json`; both must fail on the missing modules. After Step 6, strip each `@ts-expect-error` in turn and confirm it bites.

- [ ] **Step 2: Write the failing tests for the walker and the factories**

```ts
// packages/sewed/test/declarations.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Declaration from "../src/Declaration.ts";
import * as Declarations from "../src/internal/Declarations.ts";

test("a declaration is inert when made, frozen, and readable through its definition", () => {
  let applied = 0;
  const value = Declaration.make("counter", () => {
    applied++;
  });
  assert.equal(applied, 0);
  assert.ok(Object.isFrozen(value));
  const definition = Declaration.definition(value);
  assert.equal(definition?.name, "counter");
  definition?.apply();
  assert.equal(applied, 1);
  assert.equal(Declaration.definition({ name: "forged", apply() {} } as never), undefined);
});

test("apply walks the list in order, calling thunks where they stand", () => {
  const order: string[] = [];
  const step = (name: string) => Declaration.make(name, () => order.push(name));
  const error = Declarations.apply([step("a"), () => step("b"), step("c")]);
  assert.equal(error, undefined);
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("a failing declaration stops the walk with Startup naming it, and later ones do not apply", () => {
  const order: string[] = [];
  const error = Declarations.apply([
    Declaration.make("first", () => order.push("first")),
    Declaration.make("broken", () => {
      throw new Error("no");
    }),
    Declaration.make("never", () => order.push("never")),
  ]);
  assert.equal(error?.code, "Startup");
  assert.match(error?.message ?? "", /"broken"/);
  assert.equal((error?.cause as Error).message, "no");
  assert.deepEqual(order, ["first"]);
});

test("a thunk that throws fails Startup with its position, and a foreign value is refused", () => {
  const thrown = Declarations.apply([
    Declaration.make("ok", () => {}),
    () => {
      throw new Error("cannot compute");
    },
  ]);
  assert.equal(thrown?.code, "Startup");
  assert.match(thrown?.message ?? "", /1/);
  const foreign = Declarations.apply([{ name: "x", apply() {} } as never]);
  assert.equal(foreign?.code, "Startup");
});

test("commandLine appends a switch with or without a value, and refuses a bad name at apply", () => {
  const appended: unknown[][] = [];
  const native: Declarations.CommandLineNative = {
    appendSwitch: (...args) => {
      appended.push(args);
    },
  };
  assert.equal(
    Declarations.apply([
      Declarations.commandLine(native, { name: "lang", value: "en" }),
      Declarations.commandLine(native, { name: "enable-logging" }),
    ]),
    undefined,
  );
  assert.deepEqual(appended, [["lang", "en"], ["enable-logging"]]);
  const bad = Declarations.apply([
    Declarations.commandLine(native, { name: "--lang", value: "en" }),
  ]);
  assert.equal(bad?.code, "Startup");
  assert.equal(appended.length, 2);
});

test("paths decodes every entry before setting any, so a bad name sets nothing", () => {
  const set: [string, string][] = [];
  const native: Declarations.PathsNative = {
    setPath: (name, path) => {
      set.push([name, path]);
    },
  };
  assert.equal(
    Declarations.apply([Declarations.paths(native, { sessionData: "/s", crashDumps: "/c" })]),
    undefined,
  );
  assert.deepEqual(set, [
    ["sessionData", "/s"],
    ["crashDumps", "/c"],
  ]);
  const bad = Declarations.apply([
    Declarations.paths(native, { userData: "/u", cache: "/x" } as never),
  ]);
  assert.equal(bad?.code, "Startup");
  assert.equal(set.length, 2);
  const empty = Declarations.apply([Declarations.paths(native, { userData: "" })]);
  assert.equal(empty?.code, "Startup");
});

test("gpu disables acceleration only when told to, and refuses a non-boolean", () => {
  let disabled = 0;
  const native: Declarations.GpuNative = {
    disableHardwareAcceleration: () => {
      disabled++;
    },
  };
  assert.equal(Declarations.apply([Declarations.gpu(native, { acceleration: true })]), undefined);
  assert.equal(disabled, 0);
  assert.equal(Declarations.apply([Declarations.gpu(native, { acceleration: false })]), undefined);
  assert.equal(disabled, 1);
  assert.equal(
    Declarations.apply([Declarations.gpu(native, { acceleration: "no" } as never)])?.code,
    "Startup",
  );
});

test("identity sets the user model id, and refuses an empty one", () => {
  const ids: string[] = [];
  const native: Declarations.IdentityNative = {
    setAppUserModelId: (id) => {
      ids.push(id);
    },
  };
  assert.equal(
    Declarations.apply([Declarations.identity(native, { userModelId: "dev.sewed.app" })]),
    undefined,
  );
  assert.deepEqual(ids, ["dev.sewed.app"]);
  assert.equal(Declarations.apply([Declarations.identity(native, {})]), undefined);
  assert.equal(
    Declarations.apply([Declarations.identity(native, { userModelId: "" })])?.code,
    "Startup",
  );
  assert.deepEqual(ids, ["dev.sewed.app"]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --import tsx --test --test-timeout=20000 packages/sewed/test/declarations.test.ts`
Expected: FAIL — `Cannot find module '../src/Declaration.ts'`.

- [ ] **Step 4: Write `Declaration.ts` and the Electron-free factories**

`packages/sewed/src/Declaration.ts`:

```ts
const identity: unique symbol = Symbol("sewed/Declaration");

/**
 * An inert value `App.run` applies synchronously before Electron is ready. Making one runs
 * nothing, and it is not an Effect: a program cannot yield one after readiness.
 */
export interface Declaration {
  readonly [identity]: true;
}

/** What `App.run`'s list holds: a declaration, or a synchronous thunk `App.run` calls for one. */
export type Entry = Declaration | (() => Declaration);

export interface Definition {
  readonly name: string;
  readonly apply: () => void;
}

const definitions = new WeakMap<Declaration, Definition>();

/**
 * Makes a declaration from a name and the synchronous step that applies it. Every `declare` in
 * Sewed is built on this, and a package with its own pre-readiness step (`@sewed/forge`'s crash
 * reporter) uses it directly. A throw from `apply` fails startup with code `Startup`, naming the
 * declaration.
 */
export const make = (name: string, apply: () => void): Declaration => {
  const value: Declaration = { [identity]: true };
  definitions.set(value, Object.freeze({ name, apply }));
  return Object.freeze(value);
};

export const definition = (value: Declaration): Definition | undefined => definitions.get(value);
```

Add to `packages/sewed/src/Application.ts`, after `CommandLineSwitch`:

```ts
const text = Schema.String.check(Schema.isMinLength(1));
/** GPU settings that must precede readiness. */
export const Gpu = Schema.Struct({ acceleration: Schema.Boolean });
export type Gpu = typeof Gpu.Type;
/** Facts about the application that must precede readiness. */
export const Identity = Schema.Struct({
  /** The Windows application user model id. */
  userModelId: Schema.optionalKey(text),
});
export type Identity = typeof Identity.Type;
```

`packages/sewed/src/internal/Declarations.ts`:

```ts
import { Schema } from "effect";
import * as Application from "../Application.ts";
import * as Declaration from "../Declaration.ts";
import { SewedError } from "../SewedError.ts";

const startupError = (message: string, cause: unknown) =>
  new SewedError({ code: "Startup", message, ...(cause === undefined ? {} : { cause }) });

/**
 * Applies `App.run`'s declarations in order: a thunk is called for its declaration where it
 * stands, then the declaration's step runs. The first failure stops the walk and is returned as
 * `Startup`, naming the declaration — or the position, for a thunk that threw before it had one.
 * `App.run` exits on any failure, so nothing after one is applied.
 */
export const apply = (entries: readonly Declaration.Entry[]): SewedError | undefined => {
  for (const [index, entry] of entries.entries()) {
    let value: Declaration.Declaration;
    if (typeof entry === "function") {
      try {
        value = entry();
      } catch (cause) {
        return startupError(`Declaration ${index} could not be produced`, cause);
      }
    } else value = entry;
    const definition = Declaration.definition(value);
    if (definition === undefined)
      return startupError(`Declaration ${index} was not made by Declaration.make`, undefined);
    try {
      definition.apply();
    } catch (cause) {
      return startupError(`Could not apply declaration "${definition.name}"`, cause);
    }
  }
  return undefined;
};

// Each factory takes the slice of Electron's `app` it uses, so the unit suite drives it with a
// structural fake and the one line left in the main module binds it to the real one.

export interface CommandLineNative {
  appendSwitch(name: string, value?: string): void;
}
const decodeSwitch = Schema.decodeUnknownSync(Application.CommandLineSwitch);
export const commandLine = (
  native: CommandLineNative,
  flag: Application.CommandLineSwitch,
): Declaration.Declaration =>
  Declaration.make(`command-line switch ${String(flag.name)}`, () => {
    const value = decodeSwitch(flag);
    if (value.value === undefined) native.appendSwitch(value.name);
    else native.appendSwitch(value.name, value.value);
  });

export interface PathsNative {
  setPath(name: Application.PathName, path: string): void;
}
/** A partial table of application paths; `Schema.Record` over a literal union would require every key. */
export type PathTable = { readonly [Name in Application.PathName]?: string };
const decodePathName = Schema.decodeUnknownSync(Application.PathName);
const decodePath = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
export const paths = (native: PathsNative, table: PathTable): Declaration.Declaration =>
  Declaration.make("paths", () => {
    const entries = Object.entries(table).map(
      ([name, path]) => [decodePathName(name), decodePath(path)] as const,
    );
    for (const [name, path] of entries) native.setPath(name, path);
  });

export interface GpuNative {
  disableHardwareAcceleration(): void;
}
const decodeGpu = Schema.decodeUnknownSync(Application.Gpu);
export const gpu = (native: GpuNative, options: Application.Gpu): Declaration.Declaration =>
  Declaration.make("gpu", () => {
    if (!decodeGpu(options).acceleration) native.disableHardwareAcceleration();
  });

export interface IdentityNative {
  setAppUserModelId(id: string): void;
}
const decodeIdentity = Schema.decodeUnknownSync(Application.Identity);
export const identity = (
  native: IdentityNative,
  options: Application.Identity,
): Declaration.Declaration =>
  Declaration.make("application", () => {
    const value = decodeIdentity(options);
    if (value.userModelId !== undefined) native.setAppUserModelId(value.userModelId);
  });
```

`String(flag.name)` names the declaration from whatever a JavaScript caller passed without decoding it yet; decoding happens at apply so the failure is `Startup`, like every other.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --import tsx --test --test-timeout=20000 packages/sewed/test/declarations.test.ts`
Expected: PASS.

- [ ] **Step 6: The main modules, the crash reporter, and the signature**

`packages/sewed/src/CommandLine.ts`:

```ts
import { app } from "electron";
import type * as Application from "./Application.ts";
import type * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";

/** Declares one Chromium command-line switch, appended before readiness. One switch per declaration. */
export const declare = (flag: Application.CommandLineSwitch): Declaration.Declaration =>
  Declarations.commandLine(app.commandLine, flag);
```

`packages/sewed/src/Paths.ts`:

```ts
import { app } from "electron";
import type * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";

export type Table = Declarations.PathTable;

/** Declares application paths set before readiness; every entry is checked before any is set. */
export const declare = (table: Table): Declaration.Declaration => Declarations.paths(app, table);
```

`packages/sewed/src/Gpu.ts`:

```ts
import { app } from "electron";
import type * as Application from "./Application.ts";
import type * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";

export type Options = Application.Gpu;

/** Declares GPU settings that must precede readiness; `acceleration: false` disables the GPU. */
export const declare = (options: Options): Declaration.Declaration =>
  Declarations.gpu(app, options);
```

In `packages/sewed/src/App.ts`: delete `Options` and `Startup`; delete the `decodeSwitches` decoder; add `import * as Declaration from "./Declaration.ts";` and `import * as Declarations from "./internal/Declarations.ts";`; add

```ts
/** Declares facts about the application that must precede readiness, such as the Windows user model id. */
export const declare = (options: Application.Identity): Declaration.Declaration =>
  Declarations.identity(app, options);
```

and change `run`:

```ts
/**
 * Runs the application: installs the launch and quit listeners, applies every declaration in
 * order — failing `Startup` on the first that cannot apply — waits for Electron readiness, and
 * runs `program` under `MainContext` in the application scope until quit. A declaration is applied
 * synchronously and before readiness; asynchronous work belongs in `program`.
 */
export const run = <E>(
  declarations: readonly Declaration.Entry[],
  program: Effect.Effect<unknown, E, MainContext | Scope.Scope>,
) => {
  // … listeners as they are …
  const admission = Declarations.apply(declarations);
  owner.offer({ kind: "initial", arguments: [...process.argv], workingDirectory: process.cwd() });
  return Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        if (admission !== undefined) return yield* Effect.fail(admission);
        yield* Effect.promise(() => app.whenReady());
        yield* Effect.andThen(program, Effect.never);
      }).pipe(Effect.raceFirst(Deferred.await(quitRequested))),
    ).pipe(/* provideService, onExit as they are */),
  );
};
```

The old `admission` block's `commandLine`, `appUserModelId`, `hardwareAcceleration`, `startup` and `registerSchemes` lines all go; `Declarations.apply` is what they became.

`packages/sewed/src/internal/Protocol.ts`: make `registerSchemes` a non-exported `const`, add `import * as Declaration from "../Declaration.ts";` and:

```ts
/**
 * Declares privileged schemes, registered in one call before readiness. Electron accepts that
 * call once per process, so one declaration carries every scheme and a second in the same list
 * fails `Startup`.
 */
export const declare = (...schemes: readonly Protocol.Scheme[]): Declaration.Declaration =>
  Declaration.make("privileged protocol schemes", () => registerSchemes(schemes));
```

`packages/sewed/src/internal/StandardSchemes.ts:1`: the doc comment says `App.run({ schemes })`; it now says `Protocol.declare`.

`packages/sewed/src/main.ts`: add `export * as Declaration from "./Declaration.ts";`, `export * as CommandLine from "./CommandLine.ts";`, `export * as Paths from "./Paths.ts";`, `export * as Gpu from "./Gpu.ts";`.

`packages/forge/src/CrashReporterSchema.ts`: add

```ts
/** `Options` plus the crash-dump directory, set as Electron's `crashDumps` path before the reporter starts. */
export const Declaration = Schema.Struct({
  ...Options.fields,
  directory: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});
export type Declaration = typeof Declaration.Type;
```

(read Effect's `Schema.Struct` for the spelling of field reuse — `Options.fields` or an equivalent accessor — and use it; do not duplicate the field list.)

`packages/forge/src/CrashReporter.ts`: replace `startup` with

```ts
import { app, crashReporter } from "electron";
import { Declaration as SewedDeclaration } from "sewed/main";

/**
 * Declares the crash reporter for `App.run`: it starts before readiness so every later process is
 * covered. `directory` sets the crash-dump path first, in the order Electron needs; invalid
 * options fail startup with code `Startup`.
 */
export const declare = (options: Declaration): SewedDeclaration.Declaration =>
  SewedDeclaration.make("crash reporter", () => {
    const { directory, submitUrl, extra, globalExtra, ...rest } = decodeDeclaration(options);
    if (directory !== undefined) app.setPath("crashDumps", directory);
    crashReporter.start({
      ...rest,
      ...(submitUrl === undefined ? {} : { submitURL: submitUrl }),
      ...(extra === undefined ? {} : { extra: { ...extra } }),
      ...(globalExtra === undefined ? {} : { globalExtra: { ...globalExtra } }),
    });
  });
```

with `const decodeDeclaration = Schema.decodeUnknownSync(Declaration);`, `Declaration` exported beside `Options`, and the `App` type import removed.

- [ ] **Step 7: Migrate the remaining contract files**

- `packages/sewed/test/app-extras-types.ts:77-84`: the `App.run(…, { commandLine, appUserModelId, hardwareAcceleration })` block becomes `App.run([CommandLine.declare({ name: "sewed-extras", value: "on" }), App.declare({ userModelId: "dev.sewed.playground" }), Gpu.declare({ acceleration: false })], program)`; lines 192 and 194 (`@ts-expect-error` on `quitOnLastWindowClosed` and `certificateErrors`) become one `@ts-expect-error` on `App.run(program, {})`, since the options object itself is gone.
- `packages/sewed/test/session-resources-types.ts:74`: `App.run(program, { schemes: [scheme] })` becomes `App.run([Protocol.declare(scheme)], program)`.
- `packages/sewed/test/lifecycle-types.ts` and `types.ts`: every `App.run(x, …)` becomes `App.run([], x)`; the `@ts-expect-error` cases Tasks 1 and 2 added that spell `App.run(Effect.void, { … })` now fail for the arity, which still proves the option is gone — keep them.
- `packages/sewed/test/guide-examples-types.ts`: wrap the lifecycle and menu examples in `App.run([...], …)` where the guide shows the entry, and add the core-only declaration list from the app-lifecycle guide (`Protocol.declare`, a `CommandLine.declare` thunk, `Paths.declare`, `Gpu.declare`).

Run `pnpm build && tsc -p packages/sewed/test/tsconfig.json && tsc -p packages/forge/test/tsconfig.json`; PASS. Strip each new `@ts-expect-error` in turn and confirm it bites.

- [ ] **Step 8: Guides and examples**

- `docs/app-lifecycle.md`: replace the intro line with "`App.run(declarations, program)` owns the application scope. It installs launch and quit listeners synchronously, applies every declaration in order, waits for Electron readiness, then runs `program`." Add, before `## Launch ownership`:

````markdown
## Declarations

```ts
App.run(
  [
    Protocol.declare(jobwright),
    () => CommandLine.declare({ name: "lang", value: osLocale() }),
    Paths.declare({ sessionData: paths.session }),
    Gpu.declare({ acceleration: true }),
  ],
  program,
);
```

A declaration is an inert value: making one runs nothing, and it is not an Effect, so a program cannot yield one after readiness. `App.run` applies the list in order, synchronously, before it waits for readiness, and fails with `Startup` naming the first declaration that cannot apply; nothing after it is applied. An entry may be a synchronous thunk, called where it stands, for a value the entry computes — the OS locale above; a throw inside it fails `Startup` with the thunk's position. Asynchronous work belongs in the program. An application with nothing to declare writes `App.run([], program)`.

| Declaration                             | Applies                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| `Protocol.declare(...schemes)`          | privileged schemes, in one call; a second declaration fails `Startup` |
| `CommandLine.declare({ name, value? })` | one Chromium switch                                                   |
| `Paths.declare({ [name]: path })`       | application paths, every entry checked before any is set              |
| `Gpu.declare({ acceleration })`         | `false` disables hardware acceleration                                |
| `App.declare({ userModelId })`          | the Windows application user model id                                 |
| `CrashReporter.declare(options)`        | `@sewed/forge`'s crash reporter, with its `directory` set first       |
| `Declaration.make(name, apply)`         | a step of your own; every declaration above is built on it            |
````

and replace the paragraph at `:131-135` (`App.run` options … `startup` lists named steps) with a one-line pointer to the section.

- `docs/session-resources.md:24-33`: "`App.run` accepts definitions through `schemes`…" becomes "`Protocol.declare(...schemes)` is the declaration `App.run` applies before readiness:" with the example `App.run([Protocol.declare(assets)], program)`; keep the registration rules that follow.
- `docs/forge.md:67-94` and `packages/forge/README.md:70-84`: `CrashReporter.startup` becomes `CrashReporter.declare` in the example (`App.run([CrashReporter.declare({ productName, uploadToServer: false })], program)`) and in prose; note `directory`.
- `docs/native-policy.md:284`, `docs/api.md:68,84,96`, `docs/electron-coverage.md:366`: replace the option names with the declaration names.
- Every no-options example (listed in Files) becomes `App.run([], …)`; `packages/create/template/src/main/app.ts:7` and `README.md:40` too.

- [ ] **Step 9: Migrate the playground**

- `scripts/session-resources-fixture.mjs:455-456`: `App.run(Effect.void, { schemes: [protocolScheme, protocolScheme] })` — the duplicate-rejection probe — becomes `App.run([Protocol.declare(protocolScheme, protocolScheme)], Effect.void)`; the assertion at `:467-470` on the duplicate failure stays; the real run at `:456` becomes `App.run([Protocol.declare(protocolScheme)], program)` if it declared the scheme before, else `App.run([], program)`.
- `scripts/app-extras-fixture.mjs:196,221-224`: `App.run([CommandLine.declare({ name: "sewed-extras", value: "on" }), App.declare({ userModelId: "dev.sewed.playground" })], program)`; import `CommandLine` from `sewed/main`.
- `scripts/forge-fixture.mjs:75,89-96`: `App.run([CrashReporter.declare({ productName, uploadToServer: false, extra: { channel: "playground" } })], program)`.
- The 29 no-options call sites: `App.run(x)` → `App.run([], x)`; in `verify-development.mjs:253` the text is inside a template string that generates a source file — change the generated text.
- `README.md:175` (session resources) names `Protocol.declare`.

Then:

```bash
node scripts/release.mjs pack .artifacts
cd /home/lucas/personal/typescript/sewed-playground && pnpm install && pnpm build
env -u FORCE_COLOR pnpm verify:session-resources && env -u FORCE_COLOR pnpm verify:app-extras && env -u FORCE_COLOR pnpm verify:forge && env -u FORCE_COLOR pnpm verify:app
```

Expected: all four pass. Any failure is real: fix it here.

- [ ] **Step 10: Regenerate the reference, run every check, and commit**

```bash
pnpm build && pnpm docs:reference && pnpm format && timeout 240 pnpm test && pnpm format:check
git add -A packages docs README.md
git commit -m "feat(app): declarations replace the App.run options"
```

---

### Task 4: The record, the sweep, and the hand-back

**Files:**

- Modify: `docs/superpowers/specs/2026-09-15-platform-redesign-design.md`, `docs/electron-coverage.md`, `docs/reference.md`
- Playground: `README.md`

- [ ] **Step 1: Record the rulings in the spec**

Append entries 17–24 under "Decisions settled while implementing", one per ruling in "Step 3 rulings" above (merge 2 and 12; merge 9 and 10), each stating the ruling and what it costs if wrong, in the voice of entries 1–16. Under section C, add after "Replaces": "**Between step 3 and step 4** the application menu is `App.menu(options)`, a scoped resource returning `replace` and `selections`; `App.setMenu` and `App.menuSelections` are gone, and step 4 replaces `App.menu` itself." Under "Recorded when the decisions wave closed", add a short "Recorded when the declarations wave closed" section: the secondary-process cost (readiness before `SecondaryInstance`), the `second-instance` move off `App.launches`, and which line in each unimportable module is proven by what — `Instance.make(app)` and each `declare`'s binding by the compiler (the structural `Native` types), `run`'s sequence and the scheme registration by the playground's `verify:lifecycle`, `verify:session-resources`, `verify:app-extras`, `verify:forge`.

- [ ] **Step 2: Record the wave in the coverage document**

In `docs/electron-coverage.md`, add the wave: `app.requestSingleInstanceLock`/`releaseSingleInstanceLock`/`second-instance` now under `App.claimInstance`; `app.commandLine`, `setAppUserModelId`, `disableHardwareAcceleration`, `setPath` before ready and `protocol.registerSchemesAsPrivileged` under declarations; `crashReporter.start` under `CrashReporter.declare`. Note that `App.claimInstance`'s real-Electron coverage is the playground's lifecycle fixture, and that the fake-native suite covers the claim's every path but the lock itself.

- [ ] **Step 3: Run the playground sweep**

```bash
node scripts/release.mjs pack .artifacts
cd /home/lucas/personal/typescript/sewed-playground && pnpm install && pnpm build
rm -rf /tmp/sewed-lib-check && cp -r node_modules/sewed/lib /tmp/sewed-lib-check
cd /home/lucas/personal/typescript/sewed-round-two && rm -rf packages/sewed/lib && pnpm build && diff -r packages/sewed/lib /tmp/sewed-lib-check && echo "lib identical"
cd /home/lucas/personal/typescript/sewed-playground && SEWED_XVFB_TIMEOUT=3600 env -u FORCE_COLOR <xvfb wrapper> dbus-run-session -- pnpm verify:all
```

Expected: the installed `lib` is byte-identical to a clean build; `verify:all` passes except the scripts recorded as host failures (`verify`, `verify:webcontents`, `verify:webcontents-extras`, `verify:diagnostics`, `verify:responsiveness` die at a deliberate renderer crash under the sandbox and pass with `--no-sandbox`; `verify:menus` and `verify:application-menus` need the Xvfb wrapper). Any other failure is real.

- [ ] **Step 4: Final checks and commit**

```bash
pnpm build && pnpm docs:reference && pnpm format && timeout 240 pnpm test && pnpm format:check && pnpm website:build
git add -A docs
git commit -m "docs: record the declarations wave as it landed"
```

- [ ] **Step 5: Merge locally**

From `/home/lucas/personal/typescript/sewed`: `git merge --ff-only first-consumer-round-two` on `main`, then the same on `sewed/prototype`. Never push.

---

## Self-review

- **Spec coverage.** Section C's declarations: Task 3 (`Declaration`, the walker, `Protocol`/`CommandLine`/`Paths`/`Gpu`/`App`/`CrashReporter.declare`, thunks, `Startup` on failure, application before readiness). `App.claimInstance` with its type, scope, `SecondaryInstance` after forwarding and `launches`: Task 1. Every option in "Replaces": `singleInstance` (Task 1), `menu` (Task 2), `schemes`, `commandLine`, `appUserModelId`, `hardwareAcceleration`, `startup` and `CrashReporter.startup` (Task 3); `certificateErrors` and `quitOnLastWindowClosed` were already gone. The open menu question: ruling 11, Task 2, recorded in Task 4. The consumer's five needs: 1 (Task 1 and the entry in Task 3), 2 (`Protocol.declare` + `Protocol.handle`, Task 3), 3 (the thunk, Task 3), 4 (`Paths.declare`, `CrashReporter.declare` with `directory` and `uploadToServer: false`, Task 3), 5 (`Gpu.declare`, Task 3).
- **Type consistency.** `Declaration.Entry`, `Declaration.make`, `Declaration.definition`, `Declarations.apply`, `Instance.make`, `Instance.Native`, `App.claimInstance`, `App.Instance`, `App.SecondaryInstance`, `App.menu`, `App.Menu`, `App.declare`, `Launch.SecondInstance`, `LaunchQueue.make` are spelled identically in every task. `Application.Gpu` and `Application.Identity` are declared in Task 3 Step 4 and consumed in Step 6.
- **Ordering.** Task 1 and Task 2 are independent of each other and both precede Task 3, which flips the signature they each left intact; Task 4 depends on all three. A reviewer can reject Task 2 without rejecting Task 1.
- **What the suite cannot see.** `run`'s listener wiring and exit sequence, the native menu, and the scheme registration remain in Electron-importing modules; the playground proves them, and Task 4 says so in the spec.
