# First consumer, round two: runtime calls, scheme rules, window automation, and guest browsing controls

Date: 2026-09-14. Status: design, awaiting review.

## Context

Jobwright is migrating its Electron desktop onto Sewed. Round one (Sewed `3fafd4c9` and `c3cc212f`)
added window chrome, background throttling, a console stream, renderer download deciders, menu
replacement, `connect` with `RuntimeProvider`, and the renderer `blocked` stream.

A review of Jobwright's shell, bridge, Jaspace browser, and acceptance harnesses found that the
shell and Jaspace must move in one change: Jaspace guest views attach only to a Sewed window, and
Sewed keeps native windows private. That change needs the surfaces below. Every item was checked
against both codebases; evidence paths are in Jobwright's
`docs/jobwright/sewed-migration-design.md` and the review notes.

## Decisions already made

- Plain async renderer code calls protocols through the connect store (`run`), because Sewed replaces
  a document's connection at each handshake.
- Origin and document rules accept schemes registered as standard; the shell policy accepts exact
  `mailto` addresses.
- Tools-dev QA drives the main window through automation declared on `BrowserWindow.make`, the same
  fenced shape guest views use. No native window escape hatch.
- The Jaspace browser profile resets once. No legacy partition adoption.
- Recorder media grants stay in Jobwright as a timed permission rule. No media-type rules.

## Additions

### 1. `RuntimeStore.run` (`@sewed/react`)

```ts
export interface RuntimeStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => RuntimeState;
  readonly close: () => void;
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, ClientContext | RendererContext | Scope.Scope>,
  ) => Promise<A>;
}
```

- Ready: runs the effect in its own scope with the connected runtime and resolves or rejects with the
  effect's result.
- Connecting: waits for the store to settle, then behaves as ready or unavailable.
- Unavailable (no preload, rejected handshake, closed): rejects with `SewedError` code `Closed`
  carrying the unavailable cause. It never retries.
- Only stores from `connect` are reachable by application code, so they are where `run` matters;
  `mount` keeps its runtime inside the React tree.
- Tests: node tests in `packages/react/test/connection.test.ts` for ready, waiting, missing
  preload, and closed; contracts in `packages/react/test/types.ts` reject a `MainContext` effect.

### 2. Registered standard schemes in URL rules

- A new electron-free `internal/StandardSchemes.ts` holds the names that `App.run({ schemes })`
  registered with `standard: true`. `internal/Protocol.ts registerSchemes` records them after
  `registerSchemesAsPrivileged` succeeds.
- `UrlRule.originOf(url)` returns `${protocol}//${host}` for a registered standard scheme and
  `url.origin` otherwise. Node reports `"null"` for `new URL("jobwright://app/").origin`.
- Origin rules validate and match with `originOf`; an opaque origin still fails.
- Document rules accept `http:`, `https:`, `file:`, and registered standard schemes.
- `internal/Session.ts` permission checks compare origins with `originOf`.
- A rule for an unregistered custom scheme fails as today (`Protocol` at the policy boundary).
- Tests: `test/url-rule.test.ts` covers before and after registration; permission, navigation, and
  shell policies accept the rule. Playground: a standard custom scheme fixture grants a permission to
  its document and allows a navigation.

### 3. Shell `mailto` rule

```ts
export const Mailto = Schema.Struct({ kind: Schema.Literal("mailto"), address: Schema.String });
export const Policy = Schema.Array(Schema.Union([UrlRule.Origin, UrlRule.Document, Mailto]));
```

- Kept out of the shared `UrlRule.Rule`, so permission, cookie, and navigation policies do not gain it.
- The address must contain exactly one `@` and no comma; otherwise the policy fails with `Protocol`.
- A `mailto:` URL matches when it has exactly one recipient equal to the address, compared without
  case. Query parameters such as `subject` and `body` are allowed; `to`, `cc`, and `bcc` parameters
  add recipients, so a URL that carries one never matches.
- Tests: pure matcher tests; playground shell fixture denies a second recipient.

### 4. Declared automation on `BrowserWindow.make`

- Move `Automation` (renamed `Automation.Declaration`), `AutomationOf` (renamed `Automation.Of`),
  `AutomationMembers`, `EvaluateOptions`, `InputEvent`, `KeyboardInput`, `MouseInput`,
  `MouseWheelInput`, and `DevToolsMethod` from `GuestView.ts` to a new root `Automation.ts`, exported
  from `sewed` and `sewed/main`. Callers migrate; no aliases stay on `GuestView`.
- Rename `internal/GuestAutomation.ts` to `internal/ContentsAutomation.ts`.
- `BrowserWindow.make<const A extends Automation.Declaration = {}>(options?: Options<A>)`; the handle
  gains `automation: Automation.Of<A>` over the window's own web contents and releases the debugger
  when the window closes.
- The declaration sits in the composition root, so a release composition that omits it has no
  automation members at all. Docs replace "a renderer view has no automation" with that rule.
- Tests: contracts in `test/window-extras-types.ts` (undeclared members absent, declared present);
  playground `verify:windows` evaluates, sends input, and runs an allowlisted DevTools method on a
  window, and a window without a declaration has no `automation.evaluate`.

### 5. `contentBounds` in window state

- `WindowControls.State` gains `contentBounds: Bounds`, read with `getContentBounds()` and published
  on the existing move and resize events. It reaches `WindowControls.protocol` clients too.
- Playground `verify:windows` resizes a window and observes `contentBounds` change.

### 6. `mediaSourceId` on window handles

- `window.mediaSourceId: Effect.Effect<string, SewedError, MainContext>`, main-only, `Closed` after
  close. It matches `DesktopCapturer.sources` ids.
- Playground `verify:platform` or `verify:windows` finds the window among desktop capturer sources.

### 7. `webContents.terminate`

- `terminate: Effect.Effect<void, SewedError, MainContext>` crashes the renderer and waits for
  `render-process-gone`; the state stream ends in `gone`. It does not reload.
- `recover` becomes `terminate` followed by `reload`, with unchanged behavior.
- Main-only; not on `WindowControls.protocol`.
- Playground `verify:webcontents` terminates a guest and a renderer and observes `gone` with no reload.

### 8. `favicons` on the contents core

- `favicons: Stream.Stream<readonly string[], SewedError, MainContext>` replays the latest list,
  starts empty, resets to empty when a new main-frame document starts loading, and follows
  `page-favicon-updated`. It ends when the contents close.
- Available on renderer and guest contents.
- Playground: a page with a `<link rel="icon">` publishes its favicon URL.

### 9. Guest input policy

- `GuestView.Settings.input?: "allow" | "block"` (default `"allow"`) and
  `guest.setInputPolicy(policy): Effect.Effect<void, SewedError, MainContext>`; `Closed` after close,
  `Protocol` for an invalid value.
- While `"block"`, Sewed prevents `before-input-event` and `before-mouse-event` inside Electron's
  callback, so keyboard and mouse input do not reach the page.
- The playground records whether `automation.input` events pass through those events on Electron 44;
  the guest docs state the observed behavior.
- Playground `verify:guest` blocks a typed key and a click, then allows them after
  `setInputPolicy("allow")`.

### 10. Session network controls

```ts
Session.setPreconnect(handle, enabled: boolean): Effect<void, SewedError, MainContext>;
Session.closeAllConnections(handle): Effect<void, SewedError, MainContext>;
Session.resolveHost(
  handle,
  host: string,
  options?: {
    readonly queryType?: "A" | "AAAA";
    readonly source?: "any" | "system" | "dns" | "mdns" | "localOnly";
    readonly cacheUsage?: "allowed" | "staleAllowed" | "disallowed";
    readonly secureDnsPolicy?: "allow" | "disable";
  },
): Effect<{ readonly endpoints: ReadonlyArray<{ readonly address: string; readonly family: "ipv4" | "ipv6" }> }, SewedError, MainContext>;
```

- `setPreconnect` uses one `preconnect` listener installed when Sewed acquires the session;
  preconnects are allowed until a policy disables them.
- `resolveHost` decodes its options (`Protocol` on invalid input), maps a resolver rejection to
  `Native` with the cause, and returns `Net.ResolvedHost`, the shape `Net.resolveHost` already uses.
- `Net.resolveHost` stays as the session-free resolver.
- Playground `verify:session-extras` disables preconnect, resolves `localhost` with the cache
  disallowed, and closes connections while a keep-alive request is open.

### 11. `Session.blobData`

- `Session.blobData(handle, uuid: string): Effect<Uint8Array, SewedError, MainContext>` reads an upload
  blob, for deciders that use `body.blobs: "reference"` and must control read order.
- `Protocol` for an empty uuid; `Native` when Electron cannot read the blob.
- Playground `verify:session-extras` submits a `FormData` with a `File`, receives a blob reference in
  the request stage, reads it with `blobData`, and compares bytes.

### 12. `ImageView` images from bytes

- `ImageView.Options.image` and `handle.setImage` accept `string | Uint8Array`. Bytes decode through
  `nativeImage.createFromBuffer`; an empty image fails with `Protocol`.
- Playground `verify:native-views` shows a PNG from bytes.

## Out of scope

- Adopting a raw partition name (the Jaspace profile resets).
- OS-version update gating (nothing has been released).
- `data:` documents in guest navigation policies (fixtures serve loopback pages).
- An `App.Options` user-data path (a `startup` step sets it before readiness).
- Exit codes beyond `App.run`'s existing 1 on setup failure and quit otherwise.
- Bitmap or resized capture (consumers decode PNG bytes).

## Order

1. Scheme rules and the mailto rule (pure, node-testable).
2. `RuntimeStore.run`.
3. Automation move and window automation.
4. `contentBounds` and `mediaSourceId`.
5. `terminate` and `favicons`.
6. Guest input policy.
7. Session network controls and `blobData`.
8. `ImageView` bytes.
9. Docs (`api.md`, `guest-views.md`, `window-controls.md`, `native-views.md`, `session-extras.md`,
   `native-policy.md`, `desktop-surfaces.md`, `webcontents-lifecycle.md`, the React README),
   `electron-coverage.md` Wave 10, reference regeneration, and the playground fixtures.

Each step is test-first, keeps `pnpm build`, `timeout 240 pnpm test`, and the website check green,
and ends in a local commit. Pushing to `main` waits for explicit approval.
