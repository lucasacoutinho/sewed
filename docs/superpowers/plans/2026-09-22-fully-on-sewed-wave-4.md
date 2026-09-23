# Fully on Sewed, Wave 4: Every Role, the Dock Icon, and Four Shell Gaps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An application menu can name every role Electron has, as a leaf or as a submenu, so the macOS application and window menus are expressible; the dock takes an icon; a media permission request says which media it asks for; a save or open dialog takes Electron's own property flags; a window enters simple fullscreen; a tray icon comes from bytes and can be a template image.

**Architecture:** Wider literal unions where a value already passes straight through to Electron; one submenu variant that carries a role; one dock function over the icon helper wave 3 introduced; one event field read from the handler Sewed already installs, with a matching optional rule field; one optional dialog field forwarded verbatim at two sites; one window operation and state field mirrored on the window-controls protocol; one tray option. Nothing here is the contribution model the redesign's step 4 describes — the interim `App.menu` remains the composition mechanism, and this wave says so.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), Electron 44.3.0, `node:test`.

**Spec:** `request-fully-on-sewed.md` (Step 4's two items, B1–B4), `request-desktop-shell-gaps.md` § B and § C, the spec's lines 278–298 (shared native state, the complete role set, the dock), as ruled below. Evidence: `.artifacts/probe-wave-4/PROBE_REPORT.txt` and the wave-4 ledger's scout notes.

## Global Constraints

- Commands run from the repository root: `pnpm build`, `pnpm typecheck`, `timeout 300 pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm docs:reference`, and one file with `node --import tsx --test --test-timeout=20000 packages/sewed/test/<file>.test.ts`.
- Effect stays at `4.0.0-rc.115`. Add no dependency to any package.
- The root package (`sewed`) imports no Electron module, no `node:` module, and reads no environment at the top level: `Menu.ts`, `Dialog.ts`, `Permission.ts`, `Decidables.ts`, `Tray.ts`, `WindowControls.ts`, `Image.ts` are inert schemas.
- No `any`; no `as` beyond `as const` and `import * as` in `packages/*/src` (pre-existing documented bridges excepted); no non-null assertions.
- `*.test.ts` files are never type-checked; type claims live in `*-types.ts` / `types.ts`, and every `@ts-expect-error` is proven to bite after `pnpm format`.
- A test that forks work waits on a positive condition and bounds the wait; never a fixed sleep as a barrier.
- A JSDoc block must not contain `*/` before its end; every JSDoc body line starts with `*`.
- Breaking changes are allowed; no aliases; each removal pinned by a negative contract assertion.
- One writer in the worktree. Stage only your own paths; never `git add -A`. Checkpoint with a commit as soon as the focused suite is green. Never push. Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Rulings

0. **A document has one runtime store, and `@sewed/react` knows which: `connect` establishes it, `document()` reads it, and a testing `store` stands in for it until closed.** The first consumer's renderer module runs its plain actions (route loaders, `async` functions no component calls) through the one store the document built with `connect`, so a test that renders a tree with `store(bindings)` still leaves those actions on the document's store and the product keeps a seam that swaps it (W1). The seam moves into the adapter, named: `connect(entry)` registers the store it returns as the document's; `document(): RuntimeStore` answers it — or the static `unavailable` store when nothing connected, which is what a plain web page is; `RuntimeProvider` with no `store` prop uses it; `@sewed/react/testing`'s `store(bindings)` registers itself as the document's store while it is open and `close()` restores what was there (a stack, so nested stores in one test file unwind). A second `connect` in one document replaces the first and closes it, because a document has one connection. Cost if wrong: one module-level slot in the adapter, documented as the document's runtime rather than a definition.

1. **Every Electron role but `shareMenu` is a leaf role, and a submenu may carry a role.** Probed on Linux: `Menu.buildFromTemplate` builds each role Sewed lacked without throwing and with Electron's own label (`services` → "Services", `hide` → "Hide <app>", `front` → "Bring All to Front", …; the five tab roles with an empty label, since they are macOS-only and inert elsewhere), and a submenu with a role (`help`, `window`, `services`, `recentDocuments`) builds with its custom items retained. So `Menu.Role.role` becomes the whole union minus `shareMenu`, which needs a `sharingItem` and is a different kind of item, left for the wave that needs it; `Menu.ApplicationSubmenu` gains `role?: "help" | "window" | "services" | "recentDocuments"`, with `services` and `recentDocuments` requiring an empty `items` list (macOS fills them; a rule Sewed enforces at decode as `Protocol`, because on Linux Electron silently keeps custom items the OS would drop), and the top-level `items` accept such a submenu as they accept any submenu. The role passes to Electron as it already does (`internal/Menu.ts`'s template maps `{ role }` straight through). The contribution model — features contributing items to a library-owned skeleton with named anchors — is the redesign's own step 4 and not this wave: the interim `App.menu` stays the composition mechanism. Cost if wrong: a role a platform ignores is an inert item with Electron's label.
2. **`App.dock.setIcon(image)` takes `Image.Source` — a path or bytes.** On a platform with no dock (`app.dock` undefined) it fails `Native`, as every dock function does today. It uses the one main-side image helper wave 3 introduced. Cost if wrong: one function.
3. **`Session.Permission`'s event carries `mediaTypes`, and a policy rule for `media` may narrow to them.** Probed on Linux: the check handler is consulted once per requested type with a singular `details.mediaType`; Electron types the request handler's details as carrying `mediaTypes: Array<"video" | "audio">` (not reachable on the probe machine, which has no media devices). The event field is `mediaTypes: readonly ("audio" | "video")[]` — the request handler's list, or the check handler's single type as a one-element list (`unknown` and every other permission give an empty list). `Permission.Rule` gains `mediaTypes?: NonEmptyArray<"audio" | "video">`, meaningful only beside `media` in its `permissions` (refused `Protocol` otherwise); a request is granted by such a rule only when every requested type is named; a rule without it grants both, as today. `internal/Session.ts`'s `allowed` reads the request handler's details at their real type instead of the check handler's. Cost if wrong: an empty list on every event that is not a media request.
4. **`Dialog.SaveOptions.properties` and `Dialog.OpenOptions.properties` are Electron's own flags, forwarded verbatim.** Save: `showHiddenFiles | createDirectory | treatPackageAsDirectory | showOverwriteConfirmation | dontAddToRecent`; open: `showHiddenFiles | createDirectory | promptToCreate | noResolveAliases | treatPackageAsDirectory | dontAddToRecent` (the mode and multiplicity flags stay modelled by `mode` and `multiple`). Absent, the dialog capability keeps today's default for save (`showOverwriteConfirmation`) and none for open; given, the list is forwarded as written at both sites — the dialog capability and the save-as decider's options. Cost if wrong: a flag a platform ignores.
5. **`window.setSimpleFullScreen(flag)` and `state.simpleFullScreen`, mirrored on `WindowControls`.** Probed on Linux: the setter is honoured and both `isSimpleFullScreen` and `isFullScreen` answer true afterwards; on macOS it is the pre-Lion fullscreen that does not create a Space, which is why a window minimizing to the tray leaves it first. The state stream reports it on the same native events fullscreen already uses, plus `enter-full-screen`/`leave-full-screen`'s simple counterparts if Electron emits them (read the typings; else derive at every state read). Cost if wrong: one boolean.
6. **A tray icon is `Image.Source`, with `template?: boolean`.** `Tray.Options.icon` and `setImage(icon, { template? })` take a path or bytes; `template: true` calls `setTemplateImage(true)` on the native image, which is macOS semantics and a probed no-op elsewhere (`isTemplateImage` stays false on Linux). Cost if wrong: one option.

## What the consumer writes

```ts
// the macOS application and window menus, as roles
App.menu({
  items: [
    {
      kind: "submenu",
      label: app.name,
      items: [
        { kind: "role", role: "about" },
        { kind: "separator" },
        { kind: "submenu", role: "services", items: [] },
        { kind: "separator" },
        { kind: "role", role: "hide" },
        { kind: "role", role: "hideOthers" },
        { kind: "role", role: "unhide" },
        { kind: "separator" },
        { kind: "role", role: "quit" },
      ],
    },
    { kind: "role", role: "editMenu" },
    {
      kind: "submenu",
      role: "window",
      label: "Window",
      items: [
        { kind: "role", role: "minimize" },
        { kind: "role", role: "zoom" },
        { kind: "separator" },
        { kind: "role", role: "front" },
      ],
    },
    { kind: "submenu", role: "help", label: "Help", items: [helpItem] },
  ],
});
yield * App.dock.setIcon(devIconBytes);

// a media grant that rides only on what was asked
yield *
  session.decide(
    Decidables.Session.Permission,
    Decision.sync((request) =>
      request.name === "media" && request.mediaTypes.every((type) => granted.has(type))
        ? "allow"
        : Decision.Pass,
    ),
  );

// a save dialog that keeps the OS recent list clean; simple fullscreen before hiding to the tray
yield * window.dialog.save({ defaultPath, properties: ["dontAddToRecent"] });
if ((yield * window.state.pipe(Stream.runHead)).pipe(Option.exists((s) => s.simpleFullScreen)))
  yield * window.setSimpleFullScreen(false);

// a tray icon from bytes, as a template on macOS
const tray = yield * Tray.make({ icon: trayPng, template: true, tooltip: "Jobwright" });
```

## File Structure

- Modify: `packages/sewed/src/Menu.ts`, `packages/sewed/src/internal/Menu.ts` (the submenu role), `packages/sewed/test/types.ts` (role contracts), `docs/application-menus.md`.
- Modify: `packages/sewed/src/App.ts` (`dock.setIcon`), `docs/app-lifecycle.md` or wherever the dock is taught.
- Modify: `packages/sewed/src/Decidables.ts` (`Session.Permission`'s event), `packages/sewed/src/Permission.ts` (`Rule.mediaTypes`, the compile), `packages/sewed/src/internal/Session.ts` (`allowed` at the real details type), tests (`permission*.test.ts`, the session fake), `docs/native-policy.md`.
- Modify: `packages/sewed/src/Dialog.ts`, `packages/sewed/src/internal/Dialog.ts`, `packages/sewed/src/internal/ContentsDownloads.ts`, tests, `docs/file-dialogs.md`.
- Modify: `packages/sewed/src/internal/Window.ts`, `packages/sewed/src/WindowControls.ts` (+ its native side), tests, `docs/window-controls.md`, `docs/window-geometry.md`.
- Modify: `packages/sewed/src/Tray.ts`, `packages/sewed/src/internal/Tray.ts`, tests, `docs/desktop-surfaces.md` (or where the tray is taught).
- Docs: `docs/reference.md` (generated), the spec and `docs/electron-coverage.md` (Task 7).
- Playground: `application-menus` fixture (the seven roles and a role submenu build and replace without throwing; labels recorded), `app-extras` (dock `setIcon` fails `Native` on Linux, typed; a window `setIcon` from bytes works), `sessions` (a media request's event carries `mediaTypes` — pin what Linux delivers: the check handler's single type), `file-dialogs` (the properties reach the native call — over the fixture's existing means of observing dialog options, else a unit test over the fake is the pin and the fixture asserts no regression), `windows` (simple fullscreen state true on Linux), a tray check if a tray can be created under the playground's X11 session (probe first; if not, say so in the record).

---

### Task 0: The document's store (W1)

- [ ] Read packages/react/src/internal/Connection.ts (`connect`, `staticStore`), index.ts (`RuntimeProvider`, `detachedStore`), testing.ts (`store`), the consumer's shape in `apps/web/src/desktop/runtime.ts` (read-only: `desktopStore()`, `attachDesktopStore`, the module-level `connected`).
- [ ] Failing tests: `document()` before any connect is the static unavailable store; after `connect(entry)` it is that store; a second `connect` replaces and closes the first (the first's `run` rejects Closed); `store(bindings)` from the testing entry registers itself and `close()` restores the previous; two nested test stores unwind in order; `RuntimeProvider` without a `store` prop renders over `document()` (renderToString).
- [ ] Implement in the adapter (one module-level slot with a stack; no `useEffect`); contracts (`document()` is `RuntimeStore`; the provider's `store` prop optional); README ("The document's store"), api.md. Commit: `feat(react): the document has one runtime store, and a test store stands in for it`.

### Task 1: Every role

- [ ] Read `Menu.ts` 35–115, `internal/Menu.ts` 14–56, `test/types.ts` 588–658, `docs/application-menus.md` 45–55, the probe report.
- [ ] Contracts first (`test/types.ts`): each of the seven roles Jobwright names is an `ApplicationItem`; `shareMenu` stays `@ts-expect-error`; a submenu with `role: "services"` and items is refused at decode (a runtime test over `Menu` decoding — find the file that decodes application options); a submenu with `role: "help"` and items is accepted; a leaf role at the top level stays refused.
- [ ] Implement: the union; `ApplicationSubmenu.role?`; the decode rule for `services`/`recentDocuments`; `internal/Menu.ts` passes `role` on a submenu.
- [ ] Playground: the application-menus fixture builds a menu with the seven roles and a `help` submenu role, replaces it, and records each item's label as Electron built it.
- [ ] Docs: `docs/application-menus.md`'s two role lists and the submenu-role paragraph; the sentence that contributions remain the redesign's step. Commit: `feat(menu): every Electron role, and a submenu that carries one`.

### Task 2: The dock icon

- [ ] `App.dock.setIcon(image: Image.Source)` over wave 3's helper; contract; unit test over the dock fake if one exists (`dockOf` throws `Native` when undefined — a Node test cannot reach `app.dock`; the playground pins the Linux `Native` failure and the type). Docs. Commit: `feat(app): the dock takes an icon, from a path or bytes`.

### Task 3: The media types a permission asks for

- [ ] Read `Decidables.ts` 225–250, `internal/Session.ts` 130–230, `Permission.ts`, the permission tests and the session fake (how handlers are invoked in tests).
- [ ] Failing tests: the request handler's details with `mediaTypes: ["audio", "video"]` yield an event with that list; the check handler's `mediaType: "audio"` yields `["audio"]`; `"unknown"` and a non-media permission yield `[]`; a policy rule `{ …, permissions: ["media"], mediaTypes: ["audio"] }` grants an audio request and refuses an audio+video one; `mediaTypes` beside a rule without `media` is refused `Protocol` at compile.
- [ ] Implement; contracts; docs (`native-policy.md`'s permission section). Playground `sessions`: a page calling `getUserMedia({ audio: true })` reaches a decider whose event carries `["audio"]` (the check handler's path on Linux). Commit: `feat(permission): a media request says which media it asks for`.

### Task 4: Dialog properties

- [ ] Read `Dialog.ts`, `internal/Dialog.ts` 90–120, `internal/ContentsDownloads.ts` 55–80, the dialog tests' fake and `docs/file-dialogs.md`.
- [ ] Failing tests over the fake: `save({ properties: ["dontAddToRecent"] })` forwards exactly that list; absent → `["showOverwriteConfirmation"]`; `open({ mode: "file", properties: ["showHiddenFiles"] })` forwards `["openFile", "showHiddenFiles"]`; the save-as decider's `dialog.properties` reach `saveDialogOptions`; an unknown flag is refused `Protocol`.
- [ ] Implement; contracts; docs. Commit: `feat(dialog): a file dialog takes Electron's property flags`.

### Task 5: Simple fullscreen

- [ ] Read `internal/Window.ts` 180–230 and 340–355, `WindowControls.ts` 30–70 and its native implementation, the window tests' fake, `docs/window-controls.md`.
- [ ] Failing tests over the fake window: `setSimpleFullScreen(true)` calls the native method; `state.simpleFullScreen` reflects `isSimpleFullScreen`; the controls protocol's `setSimpleFullScreen` reaches the handle; a non-boolean is refused.
- [ ] Implement; contracts; docs; playground `windows`: on Linux `simpleFullScreen` true after the call and false after leaving. Commit: `feat(window): simple fullscreen, on the handle and the controls`.

### Task 6: A tray icon from bytes

- [ ] Read `Tray.ts`, `internal/Tray.ts`, the tray tests' fake; probe whether the playground's X11 session can create a `Tray` (a 10-line raw Electron script under `.artifacts/probe-wave-4/tray.mjs`).
- [ ] Failing tests over the fake: `make({ icon: bytes })` builds the native image from a buffer; `template: true` calls `setTemplateImage(true)`; `setImage(bytes, { template: true })` likewise; an empty byte array is refused `Protocol`.
- [ ] Implement over wave 3's helper; contracts; docs; a playground check if the probe allowed it. Commit: `feat(tray): an icon from bytes, as a template image`.

### Task 7: Record, sweep, hand-back

- [ ] Spec entries 50–55 for rulings 1–6 (after wave 3's), the closing record, coverage rows and a wave paragraph; commit the plan file.
- [ ] `pnpm build && pnpm docs:reference && pnpm format:check && timeout 300 pnpm test && pnpm website:build`; pack; reinstall; `verify:application-menus`, `verify:app-extras`, `verify:sessions`, `verify:file-dialogs`, `verify:windows`, `verify:surfaces`.
- [ ] The hand-back is the controller's: `fully-on-sewed-handback.md`, installment 4.

---

## Self-review

- **Requests covered.** W1 (Task 0); Step 4's roles (Task 1) and dock (Task 2); B1 (Task 3), B2 (Task 4, both dialog sites), B3 (Task 5), B4 (Task 6). Contributions are explicitly not in this wave.
- **Type consistency.** `Menu.Role.role`, `Menu.ApplicationSubmenu.role`, `App.dock.setIcon`, `Image.Source`, `Session.Permission`'s `mediaTypes`, `Permission.Rule.mediaTypes`, `Dialog.SaveOptions.properties`, `Dialog.OpenOptions.properties`, `setSimpleFullScreen`, `state.simpleFullScreen`, `Tray.Options.template` are spelled identically throughout.
- **Ordering.** Task 0 first (the consumer's twenty test files carry the seam); Tasks 1–6 are independent of each other and share no file; one writer takes them in order. Task 7 depends on all. This wave follows wave 3 (it uses `Image.Source`).
