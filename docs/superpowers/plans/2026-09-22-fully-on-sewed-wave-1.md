# Fully on Sewed, Wave 1: The Last Raw Electron

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After this wave the first consumer imports nothing from `electron`: the packaged entry reads the application path and a default path before readiness, shows a fatal error with no window, a launcher resolves the Electron binary through Sewed, and a test harness ends a hung program without waiting for its finalizers.

**Architecture:** Two more plain pre-readiness readers beside `App.preferredSystemLanguages`, one plain window-less error box, one plain forced exit with a distinct name, and one exported resolver in `@sewed/vite`. No new Effect, no new service, no change to `App.run`'s shape beyond its failure print naming the code.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), Electron 44.3.0, `node:test`.

**Spec:** `request-fully-on-sewed.md` § NEW (N1–N4) in `/home/lucas/personal/projects/jobwright/experiments/jw-sewed-phase-4-20260920/.superpowers/sewed-01/`, and the rulings below. Evidence: `.artifacts/probe-preready-paths/PROBE_REPORT.txt`, `.artifacts/probe-error-box/PROBE_REPORT.txt` (git-ignored, in this worktree).

## Global Constraints

- Commands run from the repository root: `pnpm build`, `pnpm typecheck`, `timeout 300 pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm docs:reference`, and one file with `node --import tsx --test --test-timeout=20000 packages/<pkg>/test/<file>.test.ts`. Node has no default test timeout.
- Effect stays at `4.0.0-rc.115`. Add no dependency to any package in the repository. A probe may install what it needs in its own directory under `.artifacts/`.
- The root package (`sewed`) imports no Electron module, no `node:` module, and reads no environment at the top level. `App.ts` is `sewed/main` and already imports `electron`. `@sewed/vite` is a Node package; `vite` stays a type-only import of its entry.
- No `any`; no `as` beyond `as const` and `import * as` in `packages/*/src` (pre-existing documented bridges excepted); no non-null assertions. A `*-types.ts` may use `undefined as unknown as Handle`; a `*.test.ts` may use `as never` to hand a runtime assertion an invalid value.
- `*.test.ts` files are never type-checked; type claims live in `*-types.ts`, and every `@ts-expect-error` is proven to bite (strip it, run the `tsc -p`, read the error, restore). After `pnpm format`, re-run `tsc -p`: oxfmt can reflow a line and detach a directive.
- A test that forks work waits on a positive condition and bounds the wait; never a fixed sleep as a barrier.
- A JSDoc block must not contain `*/` before its end; every JSDoc body line starts with `*`. Doc comments on public exports regenerate into `docs/reference.md`.
- Breaking changes are allowed; no aliases; each removal pinned by a negative contract assertion.
- One writer in the worktree. Stage only your own paths; never `git add -A`. Checkpoint with a commit as soon as the focused suite is green. Never push. Commit messages end with:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

## Rulings

1. **The pre-readiness readers are plain functions, like `App.preferredSystemLanguages`: `App.appPath(): string` and `App.defaultPath(name: Application.PathName): string`.** Probed on 44.3.0/Linux: before `ready`, `app.getAppPath()` and `app.getPath(name)` answer for every declared name except `recent` (Windows-only; it throws "Failed to get 'recent' path"); with nothing declared every answer equals the after-ready answer; and a pre-ready `setPath("userData", X)` is reflected at once and moves `sessionData`, `logs` and `crashDumps` under X. So `defaultPath` is what Electron uses with nothing declared, which is exactly the entry's question before `App.run`; the same reader after a declaration has applied reflects it, and inside the program `App.path` (the Effect) is the reader. An invalid name throws `SewedError` `Protocol`; a name Electron cannot answer throws `Native` — a throw inside a declaration thunk already fails `Startup` with the thunk's position, so the entry's convention holds. Cost if wrong: two functions that are not Effects in a namespace of Effects, beside one that already is.
2. **A fatal error with no window is `App.showErrorBox({ title, content }): void`, a plain synchronous function; `App.run` never shows one itself.** Probed on 44.3.0/Linux: before readiness the call prints the title and the content to stderr and returns at once, with or without a display (GTK is not up yet); after readiness with a display it shows a native modal and blocks until it is dismissed. Electron documents a native box before readiness on Windows and macOS (not probed). It is not automatic because a headless harness or a CI run would block on a modal nothing can dismiss, and because the consumer who builds a user-facing message already holds it where it is built. With it, the queued item: `App.run`'s failure print names the code — `Startup: <message>` on a line before the pretty cause when the failure is a `SewedError` — so stderr says what failed even where no box can show. Cost if wrong: a consumer wanting an automatic box writes one `catch`.
3. **The Electron binary for a launcher is `resolveElectron({ cwd? })` from `@sewed/vite`: the resolution the plugin already performs, exported.** `vite` is a type-only import of that entry, so a Node tool that imports it for the resolver pays no Vite dependency; it resolves `electron` from `cwd`'s `package.json` (default: the current working directory) and throws the plugin's own message when it cannot. Cost if wrong: one exported function that was private.
4. **A forced exit is `App.terminate(code: number): never` — a plain function with a distinct name, not an option of `App.exit`.** It decodes the code against `Application.ExitCode` (throws `Protocol`) and calls Electron's `app.exit(code)`: no finalizer runs, no listener or decider is consulted, and nothing after it runs — the fact ruling 6 of the hardening wave established. It is not `App.exit(code, { force })` because that would make the one guarantee `App.exit` carries — the scope closed first — a flag's default. It is for a harness whose program may hang; everything else uses `App.exit`. Cost if wrong: one function.

## What the consumer writes

```ts
// entry — the first synchronous pass, before App.run
import { App } from "sewed/main";
let config;
try {
  config = readPackagedConfig({ appPath: App.appPath(), userData: App.defaultPath("userData") });
} catch (error) {
  if (error instanceof PackagedPathAccessError)
    App.showErrorBox({ title: error.title, content: error.message });
  throw error;
}
App.run(packagedDesktopDeclarations(config), program);

// harness — a timeout that must end a hung program
const timeout = setTimeout(() => {
  console.error(`${name} timed out during ${phase}.`);
  App.terminate(1);
}, timeoutMs);

// launcher — a Node tool that spawns the desktop
import { resolveElectron } from "@sewed/vite";
const electron = resolveElectron({ cwd: workspaceRoot });
```

## File Structure

- Modify: `packages/sewed/src/App.ts` — `appPath`, `defaultPath`, `showErrorBox`, `terminate`, the failure print in `run`'s `onExit`.
- Modify: `packages/sewed/src/Application.ts` — `ErrorBox` schema (`title`, `content`: non-empty strings).
- Modify: `packages/sewed/test/lifecycle-types.ts` — contracts for the four functions.
- Modify: `packages/vite/src/index.ts` — export `resolveElectron`; create `packages/vite/test/resolve-electron.test.ts`.
- Docs: `docs/app-lifecycle.md` (§ Declarations beside `preferredSystemLanguages`; a short "A failure with no window" paragraph; `App.terminate` beside `App.exit`), `docs/development.md` (the resolver), `docs/api.md` (`sewed/main` row), `docs/reference.md` (generated), the spec (Task 4), `docs/electron-coverage.md` (Task 4).
- Playground (separate checkout, not git): `scripts/app-extras-fixture.mjs` (pre-ready readers), `scripts/app-error-box-fixture.mjs` (new), `scripts/app-terminate-fixture.mjs` (new), `scripts/verify-app-extras.mjs` (three new checks; the too-late check's `stderrPatterns` gains the code line).

---

### Task 1: The pre-readiness readers, the error box, and the failure print

**Files:** modify `packages/sewed/src/App.ts`, `packages/sewed/src/Application.ts`, `packages/sewed/test/lifecycle-types.ts`; docs `docs/app-lifecycle.md`, `docs/api.md`; playground `scripts/app-extras-fixture.mjs`, `scripts/app-error-box-fixture.mjs`, `scripts/verify-app-extras.mjs`.

- [ ] **Step 1: Read** `.artifacts/probe-preready-paths/PROBE_REPORT.txt` and `.artifacts/probe-error-box/PROBE_REPORT.txt`; `App.ts` 79–100 (`preferredSystemLanguages`, `path`) and 590–607 (`onExit`); `docs/app-lifecycle.md` 5–30; the playground's `app-extras-fixture.mjs` and `verify-app-extras.mjs`, and `verify-native.mjs`'s options.
- [ ] **Step 2: Implement.** In `App.ts`, beside `preferredSystemLanguages`:

```ts
/** The application's own path, as Electron reports it before readiness, for an entry's first pass. */
export const appPath = (): string => app.getAppPath();

/**
 * The path Electron uses for `name` with nothing declared — read before readiness, as an input to a
 * declaration. A pre-readiness `Paths.declare` of `userData` moves `sessionData`, `logs` and
 * `crashDumps` with it, so once a declaration has applied this reader reflects it; inside the
 * program, {@link path} is the reader. An invalid name throws `Protocol`; a name Electron cannot
 * answer on this platform (`recent` outside Windows) throws `Native`.
 */
export const defaultPath = (name: Application.PathName): string => …
```

`showErrorBox(options: Application.ErrorBox): void` decodes `{ title, content }` (both non-empty strings; `Protocol` throw otherwise) and calls `dialog.showErrorBox(title, content)`; its doc comment states the probed facts (stderr before readiness on Linux; a blocking native box after readiness; Windows/macOS per Electron's documentation) and that it is for a failure with no window — a window's `dialog.message` otherwise. In `onExit`, before `console.error(Cause.pretty(exit.cause))`: `Cause.findErrorOption(exit.cause)` — when it holds a `SewedError`, print `${code}: ${message}` first.

- [ ] **Step 3: Contracts** in `lifecycle-types.ts`: `App.appPath()` and `App.defaultPath("userData")` are `string` and not Effects (`@ts-expect-error` on `yield*` of each, in the placement Task 4 of the hardening wave found necessary — read its comment there); `App.defaultPath("nope")` is `@ts-expect-error`; `App.showErrorBox({ title: "t", content: "c" })` is `void`; `@ts-expect-error` for a missing `content`. Prove each bites.
- [ ] **Step 4: Playground.** `app-extras-fixture.mjs`: in the module's first synchronous pass (before `App.run`, like its existing declaration inputs) record `App.appPath()` and `App.defaultPath` for `userData`, `appData`, `temp`, `logs` and `crashDumps`, and that `App.defaultPath("recent")` throws a `SewedError` `Native`; in the program compare each recorded value with `App.path(name)` — equal for every name except `logs`, which the fixture declares (its existing `Paths.declare({ logs })`), where `App.path("logs")` is the declared directory and the recorded default is not; report both in the marker. New `app-error-box-fixture.mjs`: an ES-module entry that calls `App.showErrorBox({ title: "Sewed error box", content: "before readiness" })` in its first pass, then `App.run([], Effect.andThen(Effect.sync(() => console.log("APP_ERROR_BOX_VERIFICATION …")), App.exit(0)))`; `verify-app-extras.mjs` runs it under `--ozone-platform=x11` with `stderrPatterns` for the title and the content and `expectedExitCode: 0` — the pre-readiness print is the process-observed fact. The too-late check's `stderrPatterns` gains `/^Startup: App\.run was called after Electron was ready/m`. Pack, reinstall (delete the stale `node_modules/sewed` and its `.pnpm` entry first), `env -u FORCE_COLOR pnpm verify:app-extras`; the `Startup:` line must be RED against the installed b4049c1b build first (run the verifier before reinstalling and record the failure), then GREEN.
- [ ] **Step 5: Docs and commit.** `docs/app-lifecycle.md`: the two readers in the paragraph that describes `preferredSystemLanguages` (line 22), with the derived-paths fact; a new paragraph after the `App.exit` one, "A failure with no window", with `App.showErrorBox` and the print rule (`Startup: …`, then the cause). `docs/api.md`'s `sewed/main` row gains `App.appPath`, `App.defaultPath`, `App.showErrorBox`. `pnpm build && pnpm docs:reference && pnpm format && timeout 300 pnpm test && pnpm format:check`. Commit: `feat(app): read the application paths before readiness, show a fatal error with no window, and name the code on a failure print`.

---

### Task 2: A forced exit for a harness

**Files:** modify `packages/sewed/src/App.ts`, `packages/sewed/test/lifecycle-types.ts`; docs `docs/app-lifecycle.md`, `docs/api.md`; playground `scripts/app-terminate-fixture.mjs` (new), `scripts/verify-app-extras.mjs`.

- [ ] **Step 1: Implement** beside `exit`:

```ts
/**
 * Ends the process now with exactly this code, running nothing: no finalizer, no listener, no quit
 * decider, and nothing after the call. It is for a harness whose program may hang — a timeout that
 * must answer the shell even when the program's finalizers would never finish. Everything else
 * uses {@link exit}, which closes the application scope first. `code` is an integer from 0 to 255;
 * an invalid one throws `Protocol` before anything ends.
 */
export const terminate = (code: number): never => …
```

Decode with the existing `decodeExitCode`, wrap a decode failure as `Protocol` (the `decoded` helper's shape, thrown), then `app.exit(validated)`; the function's tail is unreachable — write it so the compiler agrees (`throw` after the call, or a helper returning `never`), without `as`.

- [ ] **Step 2: Contract.** `lifecycle-types.ts`: `const ended: never = App.terminate(0)` compiles; `@ts-expect-error` for a string code; `@ts-expect-error` on `yield*`.
- [ ] **Step 3: Playground.** `app-terminate-fixture.mjs`: an ES-module entry whose program registers a finalizer that writes a "started" marker and then `Effect.never`s, then `yield* Effect.never`; a `setTimeout` of 500 ms in the entry calls `App.terminate(3)`. `verify-app-extras.mjs`: `expectedExitCode: 3`, `requireReport: false`, and the verifier's own bound proves the process ended; assert the "started" marker is absent (no finalizer ran) — pass the marker path as an argument as `app-exit-fixture.mjs` does. Regression proof: route `terminate` through `App.exit` in a scratch copy of the fixture and record that the verifier times out; restore.
- [ ] **Step 4: Docs and commit.** `docs/app-lifecycle.md`: one paragraph after `App.exit`'s, saying what `App.terminate` runs (nothing) and who it is for. `docs/api.md`'s row gains `App.terminate`. Regenerate the reference. Commit: `feat(app): terminate the process from a harness, running nothing`.

---

### Task 3: The Electron binary for a launcher

**Files:** modify `packages/vite/src/index.ts`; create `packages/vite/test/resolve-electron.test.ts`; docs `docs/development.md`, `docs/api.md`.

- [ ] **Step 1: Read** `packages/vite/src/index.ts` (`resolveElectron` at ≈264, `SewedViteOptions`), `packages/vite/test/tsc.test.ts` for the test idiom and `packages/vite/test/tsconfig.json`.
- [ ] **Step 2: Implement.** Export `resolveElectron(options?: { readonly cwd?: string; readonly electronPath?: string }): string` — the existing private resolution with `cwd` defaulting to `process.cwd()` and `electronPath` the same override the plugin option is; the plugin's own call sites use the exported function. Doc comment: what it resolves, from where, and that it throws the plugin's message when Electron is not installed there.
- [ ] **Step 3: Test.** `resolve-electron.test.ts`: from `cwd: packages/vite` it answers an absolute path that exists on disk (this repository installs Electron); from a temporary empty directory with its own `package.json` it throws a message naming that directory; an explicit relative `electronPath` resolves against `cwd`.
- [ ] **Step 4: Docs and commit.** `docs/development.md`: one paragraph — a launcher or a tool that spawns Electron itself takes the binary from `resolveElectron`, so it never `require`s `electron`. `docs/api.md`: the `@sewed/vite` row (add one if none). `pnpm build && pnpm format && timeout 300 pnpm test && pnpm format:check`. Commit: `feat(vite): resolve the Electron binary for a launcher`.

---

### Task 4: Record, sweep, hand-back

- [ ] **Step 1:** Spec `docs/superpowers/specs/2026-09-15-platform-redesign-design.md`: entries 38–41 for rulings 1–4 in the voice of entries 30–37, and a closing record "Recorded when the first fully-on-Sewed wave closed" with what each probe established and the test count. `docs/electron-coverage.md`: rows for `app.getAppPath` and `app.getPath` (before ready), `dialog.showErrorBox`, `app.exit` (forced), and the Electron resolution; a wave paragraph. Never cite plan task numbers in the spec. Commit the plan file with it.
- [ ] **Step 2:** `pnpm build && pnpm docs:reference && pnpm format:check && timeout 300 pnpm test && pnpm website:build`; pack; reinstall the playground; `verify:app-extras`, `verify:app`, `verify:lifecycle`, `verify:binary`, `verify:development`.
- [ ] **Step 3:** The hand-back is the controller's: `fully-on-sewed-handback.md`, first installment, naming the commit.

---

## Self-review

- **Requests covered.** N1 (Task 1: `appPath`, `defaultPath`), N2 (Task 1: `showErrorBox` + the code-named print), N3 (Task 3), N4 (Task 2). The queued "failure print names the code" rides with N2.
- **Type consistency.** `App.appPath`, `App.defaultPath`, `App.showErrorBox`, `Application.ErrorBox`, `App.terminate`, `resolveElectron` are spelled identically throughout.
- **Ordering.** Tasks 1 and 2 share `App.ts` and run in that order under one writer; Task 3 is disjoint and follows. Task 4 depends on all.
