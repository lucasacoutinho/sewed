# Fully on Sewed, Wave 3: Documents Main Can Show, and a Capture That Knows Its Size

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Main sees the HTTP status a document answered with, so a 5xx error page is not mistaken for a mounted application. Main can show a document it ships with the application, or one it writes itself, through the same load door as any entry. A capture answers its pixel size and the display's scale beside its bytes, on a window and on a guest alike, and an image module decodes, resizes, composes and encodes so a QA screenshot can carry the guest view that covers part of the window.

**Architecture:** One field read from an event Sewed already listens to. Two entry constructors over the existing `Renderer.entry`, plus one existence check at the main-side load door. One struct where bytes were, taken from the native image before it is encoded. One small image namespace: inert bitmap schemas and a pure compose in the root package, decode/resize/encode over Electron's `nativeImage` in `sewed/main`.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), Electron 44.3.0, `node:test`.

**Spec:** `request-fully-on-sewed.md` (Step 5's two items, D1, G1), `request-desktop-shell-gaps.md` § "Main-frame HTTP status on `webContents.state`" and § D, `request-guest-view-gaps.md` §1, and the spec's "Local documents" section (line 327), as ruled below. Evidence: `.artifacts/probe-wave-3/PROBE_REPORT.txt` and the wave-3 ledger's scout notes (git-ignored, in this worktree).

## Global Constraints

- Commands run from the repository root: `pnpm build`, `pnpm typecheck`, `timeout 300 pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm docs:reference`, and one file with `node --import tsx --test --test-timeout=20000 packages/sewed/test/<file>.test.ts`.
- Effect stays at `4.0.0-rc.115`. Add no dependency to any package. No image library: Electron's `nativeImage` decodes, resizes and encodes; the compose is arithmetic over BGRA bytes.
- The root package (`sewed`) imports no Electron module, no `node:` module, and reads no environment at the top level: `Renderer.ts`, `WebContents.ts`, `Image.ts` are inert schemas and pure functions. `node:fs` may be imported by a `sewed/main` module that already imports `electron` (`internal/WebContents.ts` does).
- No `any`; no `as` beyond `as const` and `import * as` in `packages/*/src` (pre-existing documented bridges excepted); no non-null assertions.
- `*.test.ts` files are never type-checked; type claims live in `*-types.ts`, and every `@ts-expect-error` is proven to bite after `pnpm format`.
- A test that forks work waits on a positive condition and bounds the wait; never a fixed sleep as a barrier.
- A JSDoc block must not contain `*/` before its end; every JSDoc body line starts with `*`.
- Breaking changes are allowed; no aliases; each removal pinned by a negative contract assertion.
- One writer in the worktree. Stage only your own paths; never `git add -A`. Checkpoint with a commit as soon as the focused suite is green. Never push. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Rulings

1. **`ready` carries `httpStatus: number`, the main frame's HTTP status as Electron reports it.** Probed on 44.3.0: `did-navigate` carries `httpResponseCode` and `httpStatusText` — 200 for a 200 document, 500 for a 500 document — and `did-finish-load` still fires for the 500 document, so today it is `ready` with nothing to tell it from a good one. A `file:` document and a `data:` document both report a synthetic 200, so the field is always a number and never null. Sewed already handles `did-navigate` (it bumps the committed generation and discards the event); it now keeps the status for that generation and `ready` reports it. What a status means is the application's: a loader that treats 5xx as a failed load reloads through its own breaker; Sewed does not turn it into `failed`, because the document did load. Cost if wrong: one number a consumer ignores.
2. **A local document is an entry: `Renderer.local(path, importMetaUrl, { bindings })` for a document shipped with the application, and `Renderer.inline(html)` for one main writes itself.** `local` resolves `path` against `importMetaUrl` to a `file:` URL, exactly as `Renderer.entry(new URL(path, importMetaUrl), { bindings })` would, and at load time `webContents.load` checks that a `file:` document exists and fails `Protocol` naming the path when it does not — the root constructor stays inert and node-free, the main-side door has `node:fs`. `inline` builds a `data:text/html;base64,…` entry with no bindings: a `data:` page has an opaque origin and cannot load the renderer runtime, so it is for a message main shows with nothing behind it — a crash-loop breaker's parked page, a fatal notice — and its type carries no binding keys. A crash page that offers actions (open an issue, export logs) is a `local` document bound to a capability, built by the consumer's own Vite build as a second HTML entry; the guide says how (`build.rollupOptions.input`). The spec's `sewed check` for a missing built document is not part of this wave: the load-time check is what exists. Cost if wrong: two constructors over one that already worked, and one `existsSync`.
3. **A capture answers `{ bytes, width, height, scaleFactor }`.** Probed at `--force-device-scale-factor=2`: `capturePage`'s image reports `getSize()` as the PIXEL size (600×346 for a 300×173 DIP content area), its PNG has those pixel dimensions, and the image's own scale factor reads 1 — so the size is read from the image before encoding, and the display's scale is the ratio of pixels to DIPs of the captured area (the `rect` option's width when given, else the contents' own DIP width), which the core derives rather than asks the screen for. `WebContents.Capture` is the struct's schema; `webContents.capture` and `GuestView.tab`'s `capture` both answer it (the tab's success schema is the struct with `Binary.Bytes` inside). Cost if wrong: a consumer that wanted bytes alone reads one field.
4. **An image module: inert bitmaps and a pure compose in `sewed`, decode/resize/encode in `sewed/main`.** `Image.Bitmap = { width, height, bytes }` (BGRA, 4 bytes per pixel, row-major, as `nativeImage.toBitmap` lays them out); `Image.compose(base, layers: readonly { bitmap, x, y }[])` copies each layer's pixels onto a copy of the base at pixel offsets, clipping at the edges — pure, Electron-free, testable in Node. `Image.decode(bytes)`, `Image.resize(bitmap, { width?, height? })` and `Image.encode(bitmap, { format: "png" | "jpeg", quality? })` are `sewed/main` Effects over `nativeImage` (`createFromBuffer` → `toBitmap`/`getSize`; `createFromBitmap` → `resize` → `toBitmap`; `createFromBitmap` → `toPNG`/`toJPEG`), failing `Protocol` for bytes no decoder accepts and `Native` for an Electron failure. No blend modes, no rotation, no crop: the consumer's need is a composite screenshot. `Image.Source = string | Binary.Bytes` — a path or encoded bytes — is the one schema every icon door takes from now on (a window's `setIcon`/`setOverlayIcon` in this wave; the tray and the dock in the next), read through one main-side helper over `nativeImage.createFromPath`/`createFromBuffer` that fails `Protocol` for an image no decoder accepts. Cost if wrong: one namespace with four functions and a source type.

## What the consumer writes

```ts
// a loader that sees the error document
yield *
  window.webContents.state.pipe(
    Stream.runForEach((state) =>
      state.status === "ready" && state.httpStatus >= 500 ? reloadThroughBreaker : Effect.void,
    ),
  );

// the crash page, shipped with the app; the parked page, written by main
yield *
  window.webContents.load(
    Renderer.local("crash/index.html", import.meta.url, { bindings: [crashScreen] }),
  );
yield *
  window.webContents.load(Renderer.inline(`<!doctype html><title>Jobwright stopped</title>…`));

// a capture that knows its size, and the composite QA screenshot
const shot = yield * window.webContents.capture(); // { bytes, width, height, scaleFactor }
const tab = yield * guest.webContents.capture();
const base = yield * Image.decode(shot.bytes);
const overlay =
  yield *
  Image.resize(yield * Image.decode(tab.bytes), {
    width: bounds.width * shot.scaleFactor,
    height: bounds.height * shot.scaleFactor,
  });
const png =
  yield *
  Image.encode(
    Image.compose(base, [
      { bitmap: overlay, x: bounds.x * shot.scaleFactor, y: bounds.y * shot.scaleFactor },
    ]),
    { format: "png" },
  );
```

## File Structure

- Modify: `packages/sewed/src/WebContents.ts` (`State.ready.httpStatus`; `Capture`), `packages/sewed/src/internal/WebContentsCore.ts` (keep the status; the capture struct), `packages/sewed/src/GuestView.ts` (the tab's `capture` success schema), `packages/sewed/src/Renderer.ts` (`local`, `inline`), `packages/sewed/src/internal/WebContents.ts` (the `file:` existence check at `load`).
- Create: `packages/sewed/src/Image.ts` (schemas + `compose`), `packages/sewed/src/internal/Image.ts` (`decode`, `resize`, `encode`), exported as `Image` from `sewed` and from `sewed/main` (the main namespace re-exports the root schemas and adds the Effects, as `Shell` does).
- Tests: `webcontents-core.test.ts` (or the file that drives the core with a fake native: the status kept per generation; a stale `did-navigate` cannot settle a newer `ready`), `renderer.test.ts` (`local` URL resolution; `inline` encoding and its empty binding list), `image.test.ts` (`compose` over hand-built bitmaps: offsets, clipping, an empty layer list), `webcontents-types.ts` / `renderer-types.ts` / `image-types.ts` (contracts: `ready` has `httpStatus: number`; `Capture` shape; `inline`'s entry type declares no keys — `@ts-expect-error` on binding it to a slot; `Image.compose` is not an Effect; `Image.decode` is main-required).
- Docs: `docs/webcontents-lifecycle.md` (the status), `docs/getting-started.md` or `docs/api.md` (local and inline documents; the Vite second entry), `docs/guest-views.md` and `docs/api.md` (the capture struct; the image module), `docs/reference.md` (generated), the spec and `docs/electron-coverage.md` (Task 5).
- Playground: `scripts/webcontents-extras-fixture.mjs` (a 500 document is `ready` with `httpStatus` 500; a `data:` and a `file:` document report 200; the capture struct; one run under `--force-device-scale-factor=2` proving `scaleFactor` 2 and pixel dimensions doubled), `scripts/guest-fixture.mjs` (the tab's capture struct), a new `image` check (decode → resize → compose → encode, dimensions and one sampled pixel asserted), a local-document check (a fixture HTML loaded through `Renderer.local` reaches `ready`; a missing path fails `Protocol` at load naming it) and an inline one.

---

### Task 1: The status a document answered with

**Files:** modify `packages/sewed/src/WebContents.ts`, `packages/sewed/src/internal/WebContentsCore.ts`; tests; docs `docs/webcontents-lifecycle.md`, `docs/api.md`; playground `scripts/webcontents-extras-fixture.mjs`.

- [ ] **Step 1: Read** `WebContentsCore.ts` 160–260 (`navigation`, `navigated`, `finished`, the generation/committed gate and the listeners), `WebContents.ts` 13–33, the core's existing tests and their fake native (find them: grep `did-navigate` under `packages/sewed/test`), `.artifacts/probe-wave-3/PROBE_REPORT.txt`.
- [ ] **Step 2: Failing tests.** Over the fake native: `did-navigate` with `httpResponseCode` 500 then `did-finish-load` yields `ready` with `httpStatus: 500`; a 200 yields 200; a stale `did-navigate` (older generation) cannot change the status the newer `ready` reports; `did-finish-load` with no committed navigation still cannot settle (today's rule, unchanged).
- [ ] **Step 3: Implement.** `State.ready` gains `httpStatus: Schema.Number`; `navigated` keeps `httpResponseCode` beside the committed generation; `finished` reports it. Contract: `ready.httpStatus` is `number`.
- [ ] **Step 4: Playground.** In `webcontents-extras-fixture.mjs`'s server add a `/five` route answering 500 and load it: `ready` with `httpStatus` 500 (record it); load a `data:` document and a `file:` document: 200. Pack, reinstall, `env -u FORCE_COLOR pnpm verify:webcontents-extras`; RED first against the previous build (no field).
- [ ] **Step 5: Docs and commit.** `docs/webcontents-lifecycle.md`: the field, the synthetic 200 for non-HTTP documents, and that a 5xx document is `ready` — what to do with it is the application's. `docs/api.md`'s state sentence. Regenerate the reference. Commit: `feat(webcontents): ready reports the main frame's HTTP status`.

---

### Task 2: Documents main can show

**Files:** modify `packages/sewed/src/Renderer.ts`, `packages/sewed/src/internal/WebContents.ts`; tests; docs `docs/getting-started.md` (or where `Renderer.entry` is taught) and `docs/api.md`; playground a local-document check in `webcontents-extras-fixture.mjs` (or a new small fixture if it needs its own HTML file: put the HTML under `scripts/documents/`).

- [ ] **Step 1: Read** `Renderer.ts` (the `Entry` type, `entry`, how `Keys` are carried), `internal/WebContents.ts` 95–130 (`load`), `UrlRule.ts` 9–40 (`webDocumentProtocols`, `documentKey`), `MainBridge.ts` 255–265 (`configure`), and every `Renderer.entry(` call in `docs/*.md` for the teaching site.
- [ ] **Step 2: Failing tests.** `renderer.test.ts`: `Renderer.local("crash/index.html", "file:///app/lib/main.js")` is an entry whose `url` is `file:///app/lib/crash/index.html` with the given bindings; `Renderer.inline("<!doctype html>…")` is an entry whose `url` is `data:text/html;base64,` + the base64 of the html, with an empty binding list; `inline` refuses an empty string (`Protocol`). Over the main-side `load` with a fake native (the file that drives `internal/WebContents.ts`'s load, if one exists; otherwise the playground carries this): a `file:` entry whose path does not exist fails `Protocol` naming the path and calls no `loadURL`.
- [ ] **Step 3: Implement.** `local` and `inline` in `Renderer.ts` (inert; `inline` encodes with `btoa`/`TextEncoder` — no `node:` import — read how the root package encodes elsewhere). In `internal/WebContents.ts`'s `load`: when `entry.url.protocol === "file:"`, `existsSync(fileURLToPath(url))` before `bridge.configure`, else fail `Protocol` `Local document not found: <path>`.
- [ ] **Step 4: Contracts.** `renderer-types.ts`: `Renderer.inline(html)` is `Entry<never>`; `@ts-expect-error` binding a slot on it; `Renderer.local(path, url, { bindings })` carries the bindings' keys exactly as `entry` does.
- [ ] **Step 5: Playground.** A fixture HTML under `scripts/documents/local.html` loaded via `Renderer.local("documents/local.html", import.meta.url)` reaches `ready` (title asserted through `executeJavaScript`); `Renderer.local("documents/missing.html", …)` fails `Protocol` at load naming the path and the window's state stays as it was; `Renderer.inline("<!doctype html><title>inline</title>parked")` reaches `ready` with `httpStatus` 200 and the title `inline`. Pack, reinstall, verify.
- [ ] **Step 6: Docs and commit.** Where `Renderer.entry` is taught: the two constructors, when each applies, that an inline document has no bindings and why, and how a consumer's Vite build emits a second HTML entry for a local document (`build.rollupOptions.input` with two HTML files). Regenerate the reference. Commit: `feat(renderer): a local document and an inline document are entries`.

---

### Task 3: A capture that knows its size

**Files:** modify `packages/sewed/src/WebContents.ts`, `packages/sewed/src/internal/WebContentsCore.ts`, `packages/sewed/src/GuestView.ts`; tests; docs `docs/guest-views.md`, `docs/api.md`, `docs/webcontents-lifecycle.md` if capture is taught there; playground `webcontents-extras-fixture.mjs`, `guest-fixture.mjs`, `verify-webcontents-extras.mjs` (a second run at DSF 2).

- [ ] **Step 1: Read** `WebContentsCore.ts` 560–585 (`capture`), `WebContents.ts` 135–150 (`CaptureOptions`), `GuestView.ts` 45–60 (the tab's `capture` rpc), the two fixtures' capture checks, and the probe report's capture section.
- [ ] **Step 2: Failing tests.** Over the fake native (if `capturePage` is faked there; otherwise a contract + the playground): `capture` answers `{ bytes, width, height, scaleFactor }` with `width`/`height` from the image's `getSize()` and `scaleFactor` = pixel width / DIP width of the captured area; `rect` given → its width is the DIP width.
- [ ] **Step 3: Implement.** `WebContents.Capture = Schema.Struct({ bytes: Binary.Bytes, width: Schema.Number, height: Schema.Number, scaleFactor: Schema.Number })`; the core reads `image.getSize()` before `toPNG()`, derives the scale from the captured DIP width (the `rect` when given; else the contents' DIP size — find how the core can know it: the owner window's content bounds for a window's contents, the view's bounds for a guest; if neither is reachable from the core, take the display's scale factor through `screen.getDisplayMatching` of the owner window and say so in the doc comment). The tab rpc's success becomes `WebContents.Capture`.
- [ ] **Step 4: Contracts.** `webcontents-types.ts`: the struct; the old `Uint8Array` answer is `@ts-expect-error`.
- [ ] **Step 5: Playground.** Both fixtures assert the struct (PNG magic in `bytes`, `width`/`height` equal to the PNG's IHDR dimensions, `scaleFactor` 1). `verify-webcontents-extras.mjs` runs the fixture a second time with `electronArgs: ["--force-device-scale-factor=2"]` and the fixture records `scaleFactor` 2 and doubled pixel dimensions for the same DIP rect. Pack, reinstall, verify both.
- [ ] **Step 6: Docs and commit.** The capture struct in the guest-views guide and `docs/api.md`; the scale rule. Regenerate the reference. Commit: `feat(webcontents): a capture answers its pixel size and the display's scale`.

---

### Task 4: The image module

**Files:** create `packages/sewed/src/Image.ts`, `packages/sewed/src/internal/Image.ts`, `packages/sewed/test/image.test.ts`, `packages/sewed/test/image-types.ts`; modify `packages/sewed/src/index.ts`, `packages/sewed/src/main.ts`; docs `docs/api.md` (+ a short section in `docs/guest-views.md` "A composite screenshot"); playground a new `image` check in `webcontents-extras-fixture.mjs` or `guest-fixture.mjs`.

- [ ] **Step 1: Read** how `Shell` splits root schemas and main Effects (`Shell.ts`, `internal/Shell.ts`, `main.ts`'s re-export), `internal/ImageView.ts` (the existing `nativeImage` decode), Electron's `NativeImage` typings for `toBitmap`, `createFromBitmap`, `resize`, `toPNG`, `toJPEG`, `getSize`.
- [ ] **Step 2: Failing tests.** `image.test.ts` (Node, no Electron): `compose` over hand-built 2×2 and 1×1 BGRA bitmaps — a layer at (1,1) overwrites one pixel; a layer beyond the edge is clipped; an empty layer list returns an equal copy, not the same object; a layer with a wrong byte length fails `Protocol` (decode the struct). Contracts: `Image.compose` is a plain function; `Image.decode` requires `MainContext`.
- [ ] **Step 3: Implement.** Root `Image.ts`: `Source` (`Schema.Union([path, Binary.Bytes])`), `Bitmap` schema (`width`, `height` positive ints; `bytes: Binary.Bytes` with a check that `byteLength === width * height * 4`), `Layer`, `compose`. `internal/Image.ts`: `decode`, `resize`, `encode` as ruled, each decoding its input against the schemas first, plus the internal `nativeImageOf(source: Image.Source, label)` helper that `internal/Window.ts`'s `setIcon`/`setOverlayIcon` switch to (their `icon: string` becomes `Image.Source`; a negative contract pins that a number is refused).
- [ ] **Step 4: Playground.** Capture the window and a guest tab (guest-fixture already has both), decode both, resize the tab's bitmap to its attachment bounds × `scaleFactor`, compose at its offset, encode to PNG, decode again and sample one pixel inside the tab's area against the tab's own bitmap. Record dimensions. Pack, reinstall, verify.
- [ ] **Step 5: Docs and commit.** `docs/api.md`: the `Image` namespace in both entry points; the guest-views guide's composite example. Regenerate the reference. Commit: `feat(image): decode, resize, compose and encode a bitmap, for a composite screenshot`.

---

### Task 4b: Two follow-ups from adopting wave 2 (W2, W3)

- [ ] W2 — a refused payload whose schema is a class or a declaration read `Expected <Declaration>` and the `SewedError` carried no `cause`. The refusal now keeps the typed `SchemaIssue.Issue` as `cause` in both branches and names the schema in the message through the formatter option (or the AST annotation at the failing path) that includes a `title`/`identifier`. Test with a titled `Schema.Class` field; pin `cause`. Commit: `fix(binding): a refusal names the schema it violated and keeps the issue as its cause`.
- [ ] W3 — pnpm warns on an out-of-range optional peer that is installed, so `typescript` leaves `@sewed/vite`'s peers entirely; `internal/tsc.ts` checks the resolved TypeScript's version at run time and refuses `<7` or `>=8` with a message naming the version and path. `vite` stays an optional peer. Reproduce with a scratch tool that has TypeScript 6 (warning before, none after). Commit: `fix(vite): TypeScript is checked at run time, not declared as a peer`.

### Task 5: Record, sweep, hand-back

- [ ] **Step 1:** Spec entries 46–49 for rulings 1–4 (after wave 2's 42–45), the closing record, `docs/electron-coverage.md` rows (`did-navigate`'s status, `nativeImage` decode/resize/encode, `capturePage` size) and a wave paragraph. Commit the plan file with it.
- [ ] **Step 2:** `pnpm build && pnpm docs:reference && pnpm format:check && timeout 300 pnpm test && pnpm website:build`; pack; reinstall the playground; `verify:webcontents-extras`, `verify:webcontents`, `verify` (guest), `verify:binary`.
- [ ] **Step 3:** The hand-back is the controller's: `fully-on-sewed-handback.md`, installment 3.

---

## Self-review

- **Requests covered.** Step 5's HTTP status (Task 1) and local documents (Task 2, with the inline form for the parked page and the Vite second-entry guidance in place of `sewed check`); D1 (Task 3); G1 (Tasks 3 and 4); W2 and W3 (Task 4b). W1 is wave 4's first task.
- **Type consistency.** `State.ready.httpStatus`, `WebContents.Capture`, `Renderer.local`, `Renderer.inline`, `Image.Bitmap`, `Image.compose`, `Image.decode`, `Image.resize`, `Image.encode` are spelled identically throughout.
- **Ordering.** Tasks 1 and 2 are independent; Task 3 precedes Task 4 (the composite fixture uses the capture struct). One writer, in order 1 → 2 → 3 → 4.
