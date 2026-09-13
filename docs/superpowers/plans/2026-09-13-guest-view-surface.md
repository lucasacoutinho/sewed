# Guest View Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GuestView`, a Sewed view kind for pages the application does not own: no preload, pattern navigation policy, denied popups and webviews, decider-gated downloads, fenced automation declared at creation, a policy-gated hosted owner, and body-aware request interception with a `sourceId` per request.

**Architecture:** `internal/WebContents.ts` splits into a shared `WebContentsCore.ts` that takes a navigation guard and a renderer half that keeps the bridge and `load`. `GuestView` composes the core with pattern navigation, a per-session download registry, an automation group over one private debugger session, and a `host` over `GuestView.protocol`. Interception gains a byte-capped body filter and a `sourceId` resolved through a private contents registry that every constructor feeds.

**Tech Stack:** TypeScript 7, Effect 4.0.0-rc.115, Electron 44.3.0, node:test with tsx, the playground's Xvfb harness.

**Spec:** `docs/superpowers/specs/2026-09-13-guest-view-surface-design.md`

## Global Constraints

- No casts and no `any` (AGENTS.md); one documented generic bridge with a stated invariant and type coverage is the only exception (Task 7).
- Every operation requires `MainContext` in its public signature; resources require `Scope`.
- Root modules import nothing from Electron; internal modules that tests load in Node import only Electron types.
- Inputs are root schemas decoded before Electron sees them; outputs are copied into schema types; errors are `SewedError` with codes `Closed`, `Protocol`, `Limit`, `Startup`, `Native` and the native cause retained.
- Policies are data and deny by default. Definitions are inert.
- The pinned Effect (`4.0.0-rc.115`) and Electron (`44.3.0`) versions do not change.
- No cloud deployment, publishing, credential, or account commands.
- Format with `pnpm format` before every commit; commit messages have no `feat:` prefix (repository convention is a plain imperative sentence) and end with the attribution lines from the session.
- Playground rules: no raw `electron` import in application source, type-only imports across compartments, no handwritten comments in application source.
- Every commit: `pnpm build` and `timeout 240 pnpm test` green.

## Deviations from the spec (surfaced, not absorbed)

1. **Node-testable siblings.** `internal/GuestView.ts` must value-import `WebContentsView` from Electron, so it cannot load under Node. The spec's in-process tests over structural fakes require the guard, the automation group, the download dispatch, and the host handlers to live in modules with type-only Electron imports: `internal/GuestNavigation.ts`, `internal/GuestAutomation.ts`, `internal/GuestDownloads.ts`, `internal/GuestHost.ts`, and `internal/DownloadItem.ts` (the adopted-item handle). `internal/GuestView.ts` composes them and stays the `sewed/main` export; `internal/Download.ts` re-exports the adopted-item constructor. The public surface matches the spec.
2. **Binary protocol.** `GuestView.protocol` is `Binary.protocol(RpcGroup.make(...))` because `capture` returns `Binary.Bytes`, which has no JSON codec; `Clipboard.protocol` sets the precedent.
3. **Synchronous download decisions.** Electron only honors `event.preventDefault()` and `item.setSavePath()` inside the `will-download` callback, so the decider runs with the installing Effect's services through `Effect.runSyncExitWith(context)`. A decider that suspends asynchronously denies the download and logs a `Protocol` error. The playground fixture and the guide say so.
4. **File upload parts carry only the path.** Electron 44's `webRequest` upload data exposes `file` without offset, length, or modification time, so `UploadPart.file` keeps those three fields as `optionalKey` and the library never fills them.
5. **Body cap rule.** A part is included only when it fits within the remaining budget; the first part that does not fit and every part after it are dropped and `truncated` is true. Blob parts in `reference` mode count zero bytes.
6. **`focus` on every web contents.** The core gains `focus` (the spec lists it on the guest's core); renderer handles gain it too, additively.
7. **Window registration order.** `internal/Window.ts` generates the window id before creating its contents so the contents registry can map the primary contents to it.

## File Structure

| File                                                                                                                                                                                                                                            | Responsibility                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sewed/src/internal/WebContentsCore.ts`                                                                                                                                                                                                | Shared contents core: state and responsiveness streams, print, pdf, capture, zoom, audio, user agent, find, style, history, devtools toggles, focus, recover; takes a `NavigationGuard`; exposes `Control` (closed deferred, `operation`, `asynchronous`) to composers |
| `packages/sewed/src/internal/WebContents.ts`                                                                                                                                                                                                    | Renderer half: main bridge, `load(entry)`, `reload`, `setNavigationPolicy` over `UrlRule`, bound-document tracking                                                                                                                                                     |
| `packages/sewed/src/GuestView.ts`                                                                                                                                                                                                               | Root schemas, `Options`, `Handle` types, `protocol`                                                                                                                                                                                                                    |
| `packages/sewed/src/internal/ContentsRegistry.ts`                                                                                                                                                                                               | Map from native contents id to Sewed handle id                                                                                                                                                                                                                         |
| `packages/sewed/src/internal/GuestNavigation.ts`                                                                                                                                                                                                | Compiles a pattern policy into a guard with atomic replacement                                                                                                                                                                                                         |
| `packages/sewed/src/internal/GuestAutomation.ts`                                                                                                                                                                                                | `evaluate`, `devtools` over one private debugger session, `input`; declaration gating                                                                                                                                                                                  |
| `packages/sewed/src/internal/GuestDownloads.ts`                                                                                                                                                                                                 | One `will-download` listener per native session dispatched by contents id; synchronous deciders                                                                                                                                                                        |
| `packages/sewed/src/internal/DownloadItem.ts`                                                                                                                                                                                                   | `Download.Handle` over an already-started native item                                                                                                                                                                                                                  |
| `packages/sewed/src/internal/GuestHost.ts`                                                                                                                                                                                                      | Handler layer over `GuestView.protocol` gated by `HostPolicy`                                                                                                                                                                                                          |
| `packages/sewed/src/internal/GuestView.ts`                                                                                                                                                                                                      | `make`: native view, registries, guard, downloads, automation, host, lifetime                                                                                                                                                                                          |
| `packages/sewed/src/WebRequest.ts`, `internal/WebRequest.ts`                                                                                                                                                                                    | Body filter, body assembly, `sourceId`                                                                                                                                                                                                                                 |
| `packages/sewed/src/internal/Download.ts`                                                                                                                                                                                                       | Re-exports `adopt` from `DownloadItem.ts`                                                                                                                                                                                                                              |
| `packages/sewed/src/index.ts`, `main.ts`                                                                                                                                                                                                        | Export `GuestView`                                                                                                                                                                                                                                                     |
| `packages/sewed/test/guest.test.ts`, `guest-types.ts`, `guest-navigation.test.ts`, `guest-automation.test.ts`, `guest-downloads.test.ts`, `guest-host.test.ts`, `contents-registry.test.ts`, `webrequest-body.test.ts`, `download-item.test.ts` | Tests                                                                                                                                                                                                                                                                  |
| `../sewed-playground/scripts/guest-fixture.mjs`, `verify-guest.mjs`                                                                                                                                                                             | Native fixture                                                                                                                                                                                                                                                         |
| `../sewed-playground/src/main/guest.ts`, `src/renderer/features/guest/*`, `src/renderer/routes/guest.tsx`, `docs/features/guest.md`, `scripts/feature-map.json`, `scripts/verify.mjs`, `FEATURES.md`                                            | Feature                                                                                                                                                                                                                                                                |
| `docs/guest-views.md`, `docs/api.md`, `docs/electron-coverage.md`, `docs/session-extras.md`, `README.md`, `website/src/sidebar.ts`, `docs/reference.md`                                                                                         | Documentation                                                                                                                                                                                                                                                          |

---

### Task 1: Split the contents core from the renderer half (no behavior change)

**Files:**

- Create: `packages/sewed/src/internal/WebContentsCore.ts`
- Modify: `packages/sewed/src/internal/WebContents.ts` (whole file)

**Interfaces:**

- Produces: `core(native: WebContents, guard: NavigationGuard): Effect<{ contents: Core; control: Control }, never, MainContext | Scope>`; `type Core`; `interface NavigationGuard { allows(url: URL): boolean; blocked?(kind: "navigation" | "redirect" | "popup" | "webview", url: string): void }`; `interface Control { closed: Deferred<void>; isClosed(): boolean; closedError(): SewedError; operation; asynchronous }`.
- `webContents(native)` keeps its exported name and its returned members (`load`, `reload`, `setNavigationPolicy`, everything else) plus `focus`.

- [x] **Step 1: Record the baseline on the isolated display**

Run, from `../sewed-playground`, after `pnpm build` there:

```sh
cd ../sewed-playground && env -u FORCE_COLOR NO_COLOR=1 SEWED_XVFB=$PWD/.artifacts/ui-tools/xvfb.sh SEWED_WINDOW_MANAGER=$PWD/.artifacts/ui-tools/openbox.sh SEWED_XVFB_TIMEOUT=1200 python3 scripts/with-xvfb.py dbus-run-session -- sh -c 'pnpm verify:webcontents && pnpm verify:webcontents-extras && pnpm verify:windows && pnpm verify:native-views'
```

Expected: every script prints only `PASS` lines and exits 0. Keep the four `.artifacts/*-verification.json` files as the baseline evidence.

- [x] **Step 2: Write `WebContentsCore.ts`**

Move everything from `webContents` except the bridge, `boundDocument`, `destinations`, `load`, `reload`, and `setNavigationPolicy`. The navigation checks call the guard. Add `focus`. Return `{ contents, control }`.

```ts
import type { WebContents } from "electron";
import { Deferred, Effect, Schema, Stream, SubscriptionRef } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import {
  type Audio,
  CaptureOptions,
  DevToolsOptions,
  FindOptions,
  type FindResult,
  FindStop,
  FindText,
  type History,
  PdfOptions,
  PrintOptions,
  type Responsiveness,
  type Search,
  type State,
  StyleOptions,
  type Zoom,
  ZoomFactor,
} from "../WebContents.ts";
import * as Observers from "./Observers.ts";

/** Decides main-frame navigations, redirects, and history moves; prevented events are reported. */
export interface NavigationGuard {
  readonly allows: (url: URL) => boolean;
  readonly blocked?: (kind: "navigation" | "redirect" | "popup" | "webview", url: string) => void;
}

/** The closed state and the error-mapping helpers a composer builds its own operations with. */
export interface Control {
  readonly closed: Deferred.Deferred<void>;
  readonly isClosed: () => boolean;
  readonly closedError: () => SewedError;
  readonly operation: <A>(run: () => A) => Effect.Effect<A, SewedError, MainContext>;
  readonly asynchronous: <A>(
    message: string,
    run: () => Promise<A>,
  ) => Effect.Effect<A, SewedError, MainContext>;
}

const decodePrint = Schema.decodeUnknownSync(PrintOptions);
// ... every decoder the old module declared, unchanged ...

export const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
export const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
export const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });

export const core = (native: WebContents, guard: NavigationGuard) =>
  Effect.gen(function* () {
    yield* MainContext;
    const closed = yield* Deferred.make<void>();
    const snapshot = yield* SubscriptionRef.make<State>({ status: "idle" });
    const health = yield* SubscriptionRef.make<Responsiveness>({ status: "unknown" });
    const checkNavigation =
      (kind: "navigation" | "redirect") =>
      (event: Electron.Event<Electron.WebContentsWillNavigateEventParams>) => {
        if (!event.isMainFrame) return;
        const url = URL.parse(event.url);
        if (url !== null && guard.allows(url)) return;
        event.preventDefault();
        guard.blocked?.(kind, event.url);
      };
    const willNavigate = checkNavigation("navigation");
    const willRedirect = checkNavigation("redirect");
    const willAttachWebview = (event: Electron.Event, _preferences: Electron.WebPreferences, params: Record<string, string>) => {
      event.preventDefault();
      guard.blocked?.("webview", params.src ?? "");
    };
    native.setWindowOpenHandler((details) => {
      guard.blocked?.("popup", details.url);
      return { action: "deny" };
    });
    native.on("will-navigate", willNavigate);
    native.on("will-redirect", willRedirect);
    native.on("will-attach-webview", willAttachWebview);
    // ... state, responsiveness, zoom, audio, history, find listeners exactly as before,
    // with `inPage` only updating the snapshot url (the bound document moves to the renderer half) ...
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        destroyed();
        if (activeSearch !== undefined) finishSearch(activeSearch);
        // ... every native.off as before, plus:
        native.off("will-attach-webview", willAttachWebview);
      }),
    );
    const isClosed = () => Deferred.isDoneUnsafe(closed) || native.isDestroyed();
    const closedError = () => new SewedError({ code: "Closed", message: "Web contents is closed" });
    const operation = <A>(run: () => A) => /* as before */;
    const asynchronous = <A>(message: string, run: () => Promise<A>) => /* as before */;
    // History moves apply the guard before Electron moves.
    const travel = (offset: number | { readonly index: number }) =>
      operation(() => {
        const current = readHistoryUnsafe();
        const index = typeof offset === "number" ? current.index + offset : offset.index;
        const entry = current.entries[index];
        if (entry === undefined) throw protocolError("History entry does not exist");
        const url = URL.parse(entry.url);
        if (url === null || !guard.allows(url))
          throw protocolError("History entry is outside the navigation policy");
        native.navigationHistory.goToIndex(index);
      });
    const contents = {
      print, pdf, capture, zoom, setZoom, audio, setAudioMuted, userAgent, setUserAgent,
      find, findNext, stopFind, style, history, back, forward, go, clearHistory,
      openDevTools, closeDevTools, state, responsiveness, recover,
      focus: operation(() => {
        native.focus();
      }),
    };
    const control: Control = { closed, isClosed, closedError, operation, asynchronous };
    return { contents, control };
  });

export type Core = Effect.Success<ReturnType<typeof core>>["contents"];
```

The listing above elides bodies that move verbatim from `internal/WebContents.ts`; copy them, do not rewrite them.

- [x] **Step 3: Rewrite `internal/WebContents.ts` as the renderer half**

```ts
import type { WebContents } from "electron";
import { Effect, Schema } from "effect";
import type { Bound, Complete } from "../Binding.ts";
import type { Entry } from "../Renderer.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { NavigationPolicy } from "../WebContents.ts";
import * as UrlRule from "../UrlRule.ts";
import { mainBridge } from "./MainBridge.ts";
import * as BindingContract from "./BindingContract.ts";
import { sink } from "./Diagnostics.ts";
import { core, decoded } from "./WebContentsCore.ts";

export const webContents = (native: WebContents) =>
  Effect.gen(function* () {
    yield* MainContext;
    const lifetime = yield* Effect.scope;
    const bridge = mainBridge(native, lifetime, yield* sink);
    let boundDocument: string | undefined;
    let destinations: readonly ((url: URL) => boolean)[] = [];
    const { contents, control } = yield* core(native, {
      allows: (url) =>
        UrlRule.documentKey(url) === boundDocument || destinations.some((allows) => allows(url)),
    });
    // The bound document moves with the History API; a reload of that URL stays allowed.
    const inPage = (_event: Electron.Event, url: string, mainFrame: boolean) => {
      if (!mainFrame) return;
      const document = URL.parse(url);
      if (document) boundDocument = UrlRule.documentKey(document);
    };
    native.on("did-navigate-in-page", inPage);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        native.off("did-navigate-in-page", inPage);
      }),
    );
    return {
      ...contents,
      setNavigationPolicy: (policy: NavigationPolicy) =>
        Effect.andThen(
          decoded("Invalid navigation policy", () =>
            Schema.decodeUnknownSync(NavigationPolicy)(policy).map(UrlRule.compile),
          ),
          (next) =>
            control.operation(() => {
              destinations = next;
            }),
        ),
      load: <Keys extends string, const B extends readonly Bound<Keys>[]>(
        entry: Entry<Keys> & Complete<Keys, B>,
        options: { readonly bindings: B },
      ) =>
        Effect.gen(function* () {
          yield* MainContext;
          yield* BindingContract.validate(
            entry.bindings.map((binding) => binding.key),
            options.bindings.map((binding) => binding.slot.key),
            "Window bindings do not match the renderer entry",
          );
          yield* control.operation(() => {
            boundDocument = UrlRule.documentKey(entry.url);
            bridge.configure(entry.url, options.bindings);
          });
          yield* Effect.tryPromise({
            try: () => native.loadURL(entry.url.href),
            catch: (cause) =>
              new SewedError({ code: "Native", message: "Could not load renderer", cause }),
          });
        }),
      reload: control.operation(() => {
        native.reload();
      }),
    };
  });
```

- [x] **Step 4: Build and run the suite**

Run: `pnpm build && timeout 240 pnpm test`
Expected: build clean; 129 tests pass; `docs/reference.md` check may report the new `focus` member, in which case run `pnpm docs:reference` and include the regenerated file.

- [x] **Step 5: Pack, install into the playground, rebuild it, and rerun the four fixtures**

```sh
node scripts/release.mjs pack && cd ../sewed-playground && env -u FORCE_COLOR NO_COLOR=1 pnpm install && pnpm build && env -u FORCE_COLOR NO_COLOR=1 SEWED_XVFB=$PWD/.artifacts/ui-tools/xvfb.sh SEWED_WINDOW_MANAGER=$PWD/.artifacts/ui-tools/openbox.sh SEWED_XVFB_TIMEOUT=1200 python3 scripts/with-xvfb.py dbus-run-session -- sh -c 'pnpm verify:webcontents && pnpm verify:webcontents-extras && pnpm verify:windows && pnpm verify:native-views'
```

The playground's manifests point at `.artifacts/*-0.0.0-prototype.50.tgz`; packing overwrites those files in place. Expected: the same PASS lines as the baseline.

- [x] **Step 6: Commit**

```sh
pnpm format && git add packages/sewed/src/internal/WebContentsCore.ts packages/sewed/src/internal/WebContents.ts docs/reference.md && git commit -m "Split the web contents core from the renderer half"
```

---

### Task 2: Root `GuestView` schemas, protocol, and contract test

**Files:**

- Create: `packages/sewed/src/GuestView.ts`
- Create: `packages/sewed/test/guest.test.ts`
- Modify: `packages/sewed/src/index.ts` (add `export * as GuestView from "./GuestView.ts";` after `WebContents`)

**Interfaces:**

- Produces: `NavigationPolicy`, `WebRtcPolicy`, `DevToolsMethod`, `Automation`, `Settings`, `Options<A>`, `Blocked`, `DownloadOffer`, `DownloadDecision`, `EvaluateOptions`, `MouseInput`, `MouseWheelInput`, `KeyboardInput`, `InputEvent`, `HostPolicy`, `protocol`, and the types `AutomationOf<A>`, `Handle<A>` (declared here so the root type is the public one; `internal/GuestView.ts` implements it).

- [x] **Step 1: Write the failing root test**

```ts
// packages/sewed/test/guest.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { GuestView } from "sewed";

const tags = (group: { readonly requests: ReadonlyMap<string, unknown> }) =>
  [...group.requests.keys()].sort();

test("the guest protocol serves state, focus, navigate, capture, zoom, history, and find", () => {
  assert.deepEqual(tags(GuestView.protocol), [
    "back",
    "capture",
    "find",
    "findNext",
    "focus",
    "forward",
    "history",
    "navigate",
    "setZoom",
    "state",
    "stopFind",
    "zoom",
  ]);
});

test("guest settings validate patterns, methods, and closed sets", () => {
  const settings = Schema.decodeUnknownExit(GuestView.Settings);
  assert.equal(settings({ navigation: ["https://*/*"] })._tag, "Success");
  assert.equal(settings({ navigation: [] })._tag, "Success");
  assert.equal(settings({ navigation: ["example.com"] })._tag, "Failure");
  assert.equal(settings({ navigation: [], webRtc: "off" })._tag, "Failure");
  assert.equal(
    settings({ navigation: [], automation: { devtools: ["Runtime.evaluate"] } })._tag,
    "Success",
  );
  assert.equal(settings({ navigation: [], automation: { devtools: [] } })._tag, "Failure");
  assert.equal(
    settings({ navigation: [], automation: { devtools: ["evaluate"] } })._tag,
    "Failure",
  );
  assert.equal(settings({ navigation: [], automation: { evaluate: false } })._tag, "Failure");
});

test("guest events and decisions keep their shapes", () => {
  const blocked = Schema.decodeUnknownExit(GuestView.Blocked);
  assert.equal(blocked({ kind: "popup", url: "https://x/" })._tag, "Success");
  assert.equal(blocked({ kind: "iframe", url: "https://x/" })._tag, "Failure");
  const decision = Schema.decodeUnknownExit(GuestView.DownloadDecision);
  assert.equal(decision({ kind: "save", path: "/tmp/x" })._tag, "Success");
  assert.equal(decision({ kind: "save" })._tag, "Failure");
  const input = Schema.decodeUnknownExit(GuestView.InputEvent);
  assert.equal(
    input({ type: "mouseDown", x: 1, y: 2, button: "left", clickCount: 1 })._tag,
    "Success",
  );
  assert.equal(input({ type: "keyDown", keyCode: "Enter" })._tag, "Success");
  assert.equal(input({ type: "mouseWheel", x: 0, y: 0, deltaY: -10 })._tag, "Success");
  assert.equal(input({ type: "keyDown" })._tag, "Failure");
  const policy = Schema.decodeUnknownExit(GuestView.HostPolicy);
  assert.equal(policy({ navigate: true })._tag, "Failure");
});
```

- [x] **Step 2: Run it to see it fail**

Run: `pnpm build; node --import tsx --test packages/sewed/test/guest.test.ts`
Expected: fails because `sewed` has no `GuestView` export.

- [x] **Step 3: Write `src/GuestView.ts`**

```ts
import { Schema } from "effect";
import type { Effect, Scope, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as Binary from "./Binary.ts";
import type { Owner } from "./Binding.ts";
import type * as Download from "./Download.ts";
import type { Handle as SessionHandle } from "./internal/Session.ts";
import type { Attachable } from "./internal/View.ts";
import type { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import * as WebContents from "./WebContents.ts";
import * as WebRequest from "./WebRequest.ts";

/** Chromium match patterns a guest may navigate to; an empty policy loads nothing. */
export const NavigationPolicy = Schema.Array(WebRequest.Pattern);
export type NavigationPolicy = typeof NavigationPolicy.Type;

export const WebRtcPolicy = Schema.Literals([
  "default",
  "publicInterfaceOnly",
  "disableNonProxiedUdp",
]);
export type WebRtcPolicy = typeof WebRtcPolicy.Type;

const methodSyntax = /^[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/;
/** A DevTools protocol method such as `Runtime.evaluate`. */
export const DevToolsMethod = Schema.String.check(
  Schema.makeFilter((value) => methodSyntax.test(value) || "Expected a Domain.method name"),
);
export type DevToolsMethod = typeof DevToolsMethod.Type;

export const Automation = Schema.Struct({
  evaluate: Schema.optionalKey(Schema.Literal(true)),
  devtools: Schema.optionalKey(Schema.NonEmptyArray(DevToolsMethod)),
  input: Schema.optionalKey(Schema.Literal(true)),
});
export type Automation = typeof Automation.Type;

export const Settings = Schema.Struct({
  navigation: NavigationPolicy,
  webRtc: Schema.optionalKey(WebRtcPolicy),
  backgroundThrottling: Schema.optionalKey(Schema.Boolean),
  automation: Schema.optionalKey(Automation),
});
export type Settings = typeof Settings.Type;

export interface Options<A extends Automation> extends Omit<Settings, "automation"> {
  readonly session?: SessionHandle;
  readonly automation?: A;
}

export const Blocked = Schema.Struct({
  kind: Schema.Literals(["navigation", "redirect", "popup", "webview", "download"]),
  url: Schema.String,
});
export type Blocked = typeof Blocked.Type;

export const DownloadOffer = Schema.Struct({
  url: Schema.String,
  filename: Schema.String,
  mimeType: Schema.String,
  totalBytes: Schema.Number,
  sourceId: Schema.String,
});
export type DownloadOffer = typeof DownloadOffer.Type;

export const DownloadDecision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({ kind: Schema.Literal("save"), path: Schema.String }),
]);
export type DownloadDecision = typeof DownloadDecision.Type;

export const EvaluateOptions = Schema.Struct({ userGesture: Schema.optionalKey(Schema.Boolean) });
export type EvaluateOptions = typeof EvaluateOptions.Type;

const Modifier = Schema.Literals([
  "shift",
  "control",
  "ctrl",
  "alt",
  "meta",
  "command",
  "cmd",
  "iskeypad",
  "isautorepeat",
  "leftbuttondown",
  "middlebuttondown",
  "rightbuttondown",
  "capslock",
  "numlock",
  "left",
  "right",
]);
const inputFields = { modifiers: Schema.optionalKey(Schema.Array(Modifier)) } as const;
const mouseFields = {
  ...inputFields,
  x: Schema.Number,
  y: Schema.Number,
  globalX: Schema.optionalKey(Schema.Number),
  globalY: Schema.optionalKey(Schema.Number),
  movementX: Schema.optionalKey(Schema.Number),
  movementY: Schema.optionalKey(Schema.Number),
} as const;
export const MouseInput = Schema.Struct({
  ...mouseFields,
  type: Schema.Literals([
    "mouseDown",
    "mouseUp",
    "mouseEnter",
    "mouseLeave",
    "contextMenu",
    "mouseMove",
  ]),
  button: Schema.optionalKey(Schema.Literals(["left", "middle", "right"])),
  clickCount: Schema.optionalKey(Schema.Int),
});
export const MouseWheelInput = Schema.Struct({
  ...mouseFields,
  type: Schema.Literal("mouseWheel"),
  deltaX: Schema.optionalKey(Schema.Number),
  deltaY: Schema.optionalKey(Schema.Number),
  wheelTicksX: Schema.optionalKey(Schema.Number),
  wheelTicksY: Schema.optionalKey(Schema.Number),
  accelerationRatioX: Schema.optionalKey(Schema.Number),
  accelerationRatioY: Schema.optionalKey(Schema.Number),
  hasPreciseScrollingDeltas: Schema.optionalKey(Schema.Boolean),
  canScroll: Schema.optionalKey(Schema.Boolean),
});
export const KeyboardInput = Schema.Struct({
  ...inputFields,
  type: Schema.Literals(["rawKeyDown", "keyDown", "keyUp", "char"]),
  keyCode: Schema.String.check(Schema.isMinLength(1)),
});
export const InputEvent = Schema.Union([MouseInput, MouseWheelInput, KeyboardInput]);
export type InputEvent = typeof InputEvent.Type;

export const HostPolicy = Schema.Struct({ navigate: Schema.Boolean, capture: Schema.Boolean });
export type HostPolicy = typeof HostPolicy.Type;

export const protocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("state", { success: WebContents.State, stream: true, error: SewedError }),
    Rpc.make("focus", { error: SewedError }),
    Rpc.make("navigate", { payload: { url: Schema.String }, error: SewedError }),
    Rpc.make("capture", {
      payload: WebContents.CaptureOptions,
      success: Binary.Bytes,
      error: SewedError,
    }),
    Rpc.make("zoom", { success: WebContents.Zoom, stream: true, error: SewedError }),
    Rpc.make("setZoom", { payload: { factor: WebContents.ZoomFactor }, error: SewedError }),
    Rpc.make("history", { success: WebContents.History, stream: true, error: SewedError }),
    Rpc.make("back", { error: SewedError }),
    Rpc.make("forward", { error: SewedError }),
    Rpc.make("find", {
      payload: { text: WebContents.FindText, options: Schema.optionalKey(WebContents.FindOptions) },
      success: WebContents.FindResult,
      stream: true,
      error: SewedError,
    }),
    Rpc.make("findNext", { payload: { forward: Schema.Boolean }, error: SewedError }),
    Rpc.make("stopFind", { payload: { action: WebContents.FindStop }, error: SewedError }),
  ),
);

/** The automation members a declaration grants; undeclared members do not exist on the type. */
export type AutomationOf<A extends Automation> = (A extends { readonly evaluate: true }
  ? {
      readonly evaluate: <T, I>(
        script: string,
        result: Schema.Codec<T, I>,
        options?: EvaluateOptions,
      ) => Effect.Effect<T, SewedError, MainContext>;
    }
  : {}) &
  (A extends { readonly devtools: readonly string[] }
    ? {
        readonly devtools: <T, I>(
          method: A["devtools"][number],
          params: Schema.Json | undefined,
          result: Schema.Codec<T, I>,
        ) => Effect.Effect<T, SewedError, MainContext>;
      }
    : {}) &
  (A extends { readonly input: true }
    ? { readonly input: (event: InputEvent) => Effect.Effect<void, SewedError, MainContext> }
    : {});

/** A view that hosts a page the application does not own: no preload, no bridge, no bindings. */
export interface Handle<A extends Automation = {}, Core = unknown> extends Attachable {
  readonly id: string;
  readonly webContents: Core;
  readonly navigate: (url: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly setNavigationPolicy: (
    policy: NavigationPolicy,
  ) => Effect.Effect<void, SewedError, MainContext>;
  readonly blocked: Stream.Stream<Blocked, SewedError, MainContext>;
  readonly downloads: <R>(
    decide: (offer: DownloadOffer) => Effect.Effect<DownloadDecision, SewedError, R>,
  ) => Stream.Stream<Download.Handle, SewedError, MainContext | R>;
  readonly automation: AutomationOf<A>;
  readonly host: (
    policy: HostPolicy,
  ) => Effect.Effect<Owner<RpcGroup.Rpcs<typeof protocol>>, SewedError, MainContext | Scope.Scope>;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}
```

The `Core` type parameter on `Handle` keeps the root free of the internal core type; `internal/GuestView.ts` exports `Handle<A> = Public.Handle<A, Core>` so `sewed/main` callers see the full core. `Attachable` and `SessionHandle` are type-only imports, so the root module still imports no Electron code.

- [x] **Step 4: Export from `index.ts`, build, run the test**

Run: `pnpm build && node --import tsx --test packages/sewed/test/guest.test.ts`
Expected: PASS ×3.

- [x] **Step 5: Commit**

```sh
pnpm format && git add packages/sewed/src/GuestView.ts packages/sewed/src/index.ts packages/sewed/test/guest.test.ts && git commit -m "Add the GuestView root schemas and protocol"
```

---

### Task 3: Contents registry and `sourceId` on request stages

**Files:**

- Create: `packages/sewed/src/internal/ContentsRegistry.ts`
- Create: `packages/sewed/test/contents-registry.test.ts`
- Modify: `packages/sewed/src/WebRequest.ts` (`requestFields` gains `sourceId`)
- Modify: `packages/sewed/src/internal/WebRequest.ts` (`requestOf` fills `sourceId`)
- Modify: `packages/sewed/src/internal/Window.ts` (register the primary contents under the window id)
- Modify: `packages/sewed/src/internal/WebContentsView.ts` (register the view's contents)

**Interfaces:**

- Produces: `ContentsRegistry.register(contentsId: number, handleId: string): () => void`, `ContentsRegistry.handleIdOf(contentsId: number | undefined): string | undefined`.

- [x] **Step 1: Write the failing tests**

```ts
// packages/sewed/test/contents-registry.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import * as ContentsRegistry from "../src/internal/ContentsRegistry.ts";

test("the contents registry maps native ids to handle ids until released", () => {
  const release = ContentsRegistry.register(7, "handle-a");
  assert.equal(ContentsRegistry.handleIdOf(7), "handle-a");
  assert.equal(ContentsRegistry.handleIdOf(8), undefined);
  assert.equal(ContentsRegistry.handleIdOf(undefined), undefined);
  release();
  assert.equal(ContentsRegistry.handleIdOf(7), undefined);
  release();
});

test("a later registration for the same contents id is not removed by an earlier release", () => {
  const first = ContentsRegistry.register(9, "old");
  const second = ContentsRegistry.register(9, "new");
  first();
  assert.equal(ContentsRegistry.handleIdOf(9), "new");
  second();
  assert.equal(ContentsRegistry.handleIdOf(9), undefined);
});
```

Add to `packages/sewed/test/webrequest-body.test.ts` (created fully in Task 4; start it here with the `sourceId` test):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Scope, Exit } from "effect";
import { Testing } from "sewed/testing"; // Testing.main
import * as ContentsRegistry from "../src/internal/ContentsRegistry.ts";
import * as WebRequest from "../src/internal/WebRequest.ts";
import { fakeSession } from "./fake-session.ts";

test("a request carries the Sewed handle id of the contents that issued it", async () => {
  const session = fakeSession();
  const release = ContentsRegistry.register(41, "guest-1");
  const seen: unknown[] = [];
  const scope = Effect.runSync(Scope.make());
  await Effect.runPromise(
    WebRequest.intercept(session.native, {
      filter: { urls: ["<all_urls>"] },
      request: (request) => {
        seen.push(request.sourceId);
        return Effect.succeed({ kind: "allow" as const });
      },
    }).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const decision = await session.fire("onBeforeRequest", { webContentsId: 41 });
  assert.deepEqual(decision, {});
  assert.deepEqual(seen, ["guest-1"]);
  await Effect.runPromise(Scope.close(scope, Exit.void));
  release();
});
```

with the shared fake in `packages/sewed/test/fake-session.ts`:

```ts
import type { Session } from "electron";

type Listener = (details: never, callback: (response: unknown) => void) => void;
const details = (overrides: Record<string, unknown>) => ({
  id: 1,
  url: "https://example.com/submit",
  method: "POST",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
  ...overrides,
});

/** A structural session: records installed listeners and lets a test fire one stage. */
export const fakeSession = (blobs: Record<string, Uint8Array> = {}) => {
  const listeners = new Map<string, Listener | null>();
  const webRequest = Object.fromEntries(
    [
      "onBeforeRequest",
      "onBeforeSendHeaders",
      "onHeadersReceived",
      "onSendHeaders",
      "onResponseStarted",
      "onBeforeRedirect",
      "onCompleted",
      "onErrorOccurred",
    ].map((stage) => [
      stage,
      (filter: unknown, listener?: Listener) => {
        listeners.set(stage, filter === null ? null : (listener ?? null));
      },
    ]),
  );
  const native = {
    webRequest,
    getBlobData: (id: string) =>
      id in blobs
        ? Promise.resolve(Buffer.from(blobs[id]))
        : Promise.reject(new Error(`no blob ${id}`)),
  };
  const fire = (stage: string, overrides: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      const listener = listeners.get(stage);
      if (!listener) return reject(new Error(`${stage} has no listener`));
      listener(details(overrides) as never, resolve);
    });
  return { native: native as unknown as Session, fire, listeners };
};
```

The single `as unknown as Session` in the test fake is test code, not library code; it bridges a structural fake to Electron's class type and is covered by the tests that use it.

- [x] **Step 2: Run the tests to see them fail**

Run: `node --import tsx --test packages/sewed/test/contents-registry.test.ts packages/sewed/test/webrequest-body.test.ts`
Expected: both fail at import (`ContentsRegistry` missing; `sourceId` undefined).

- [x] **Step 3: Write the registry**

```ts
// packages/sewed/src/internal/ContentsRegistry.ts
/** Maps a native WebContents id to the Sewed handle that owns it, for request attribution. */
const owners = new Map<number, string>();

export const register = (contentsId: number, handleId: string): (() => void) => {
  owners.set(contentsId, handleId);
  return () => {
    if (owners.get(contentsId) === handleId) owners.delete(contentsId);
  };
};

export const handleIdOf = (contentsId: number | undefined): string | undefined =>
  contentsId === undefined ? undefined : owners.get(contentsId);
```

- [x] **Step 4: Add `sourceId` to the root request fields and fill it internally**

In `src/WebRequest.ts`, `requestFields` gains `sourceId: Schema.optionalKey(Schema.String)`. In `src/internal/WebRequest.ts`, `requestOf` gains:

```ts
const sourceId = ContentsRegistry.handleIdOf(details.webContentsId);
...
  ...(sourceId === undefined ? {} : { sourceId }),
```

- [x] **Step 5: Register from the constructors**

`internal/WebContentsView.ts`, right after `const id = yield* generateInstanceId();`:

```ts
const unregister = ContentsRegistry.register(nativeContents.id, id);
yield * Scope.addFinalizer(lifetime, Effect.sync(unregister));
```

`internal/Window.ts` `make`: move `id: yield* generateInstanceId()` out of the returned object into `const id = yield* generateInstanceId();` before `const contents = ...`, use `id` in the object, and when `primary !== undefined`:

```ts
const unregister = ContentsRegistry.register(primary.id, id);
yield * Scope.addFinalizer(lifetime, Effect.sync(unregister));
```

- [x] **Step 6: Build, run the tests, commit**

Run: `pnpm build && timeout 240 pnpm test`
Expected: all green including the two new files.

```sh
pnpm format && git add -A packages/sewed && git commit -m "Attribute requests to the Sewed handle that issued them"
```

---

### Task 4: Body-aware interception

**Files:**

- Modify: `packages/sewed/src/WebRequest.ts` (add `UploadPart`, `Body`, `BodyFilter`; `Filter.body`; `Request.body`)
- Modify: `packages/sewed/src/internal/WebRequest.ts` (assemble bodies for intercepts that asked)
- Modify: `packages/sewed/test/webrequest-body.test.ts` (add the body tests)
- Modify: `packages/sewed/test/session-extras.test.ts` (filter accepts `body`)

**Interfaces:**

- Produces: root `WebRequest.UploadPart`, `WebRequest.Body`, `WebRequest.BodyFilter`; internal `assembleBody(parts: readonly UploadData[], filter: BodyFilter, blob: (id: string) => Promise<Uint8Array>): Promise<Body>` exported for tests.

- [x] **Step 1: Write the failing tests**

Append to `webrequest-body.test.ts`:

```ts
import * as Root from "../src/WebRequest.ts";

const bytes = (text: string) => ({ bytes: Buffer.from(text) });

test("bodies count bytes parts and stop at the cap", async () => {
  const body = await WebRequest.assembleBody(
    [bytes("12345"), bytes("6789"), bytes("0")],
    { maxBytes: 9, blobs: "reference" },
    () => Promise.reject(new Error("unused")),
  );
  assert.deepEqual(body, {
    parts: [
      { kind: "bytes", bytes: new Uint8Array(Buffer.from("12345")) },
      { kind: "bytes", bytes: new Uint8Array(Buffer.from("6789")) },
    ],
    bytes: 9,
    truncated: true,
  });
});

test("reference mode keeps blob ids and counts nothing for them", async () => {
  const body = await WebRequest.assembleBody(
    [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }, bytes("ab")],
    { maxBytes: 100, blobs: "reference" },
    () => Promise.reject(new Error("unused")),
  );
  assert.deepEqual(body.parts[0], { kind: "blob", id: "blob-1" });
  assert.equal(body.bytes, 2);
  assert.equal(body.truncated, false);
});

test("resolve mode reads blobs through the session and caps them like bytes", async () => {
  const body = await WebRequest.assembleBody(
    [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }, bytes("xyz")],
    { maxBytes: 4, blobs: "resolve" },
    (id) => Promise.resolve(new Uint8Array(Buffer.from(`data:${id}`))),
  );
  assert.deepEqual(body, { parts: [], bytes: 0, truncated: true });
  const small = await WebRequest.assembleBody(
    [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }],
    { maxBytes: 64, blobs: "resolve" },
    () => Promise.resolve(new Uint8Array([1, 2, 3])),
  );
  assert.deepEqual(small, {
    parts: [{ kind: "bytes", bytes: new Uint8Array([1, 2, 3]) }],
    bytes: 3,
    truncated: false,
  });
});

test("file parts are metadata and never read", async () => {
  const body = await WebRequest.assembleBody(
    [{ bytes: Buffer.alloc(0), file: "/home/u/secret.txt" }],
    { maxBytes: 1, blobs: "resolve" },
    () => Promise.reject(new Error("unused")),
  );
  assert.deepEqual(body, {
    parts: [{ kind: "file", path: "/home/u/secret.txt" }],
    bytes: 0,
    truncated: false,
  });
});

test("a request decider receives a body only when its filter asked for one", async () => {
  const session = fakeSession({ "blob-1": new Uint8Array(Buffer.from("hello")) });
  const bodies: unknown[] = [];
  const scope = Effect.runSync(Scope.make());
  await Effect.runPromise(
    Effect.all([
      WebRequest.intercept(session.native, {
        filter: { urls: ["<all_urls>"], body: { maxBytes: 1024, blobs: "resolve" } },
        request: (request) => {
          bodies.push(request.body);
          return Effect.succeed({ kind: "allow" as const });
        },
      }),
      WebRequest.intercept(session.native, {
        filter: { urls: ["<all_urls>"] },
        request: (request) => {
          bodies.push(request.body);
          return Effect.succeed({ kind: "allow" as const });
        },
      }),
    ]).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  await session.fire("onBeforeRequest", {
    uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }],
  });
  await session.fire("onBeforeRequest", {});
  assert.deepEqual(bodies, [
    {
      parts: [{ kind: "bytes", bytes: new Uint8Array(Buffer.from("hello")) }],
      bytes: 5,
      truncated: false,
    },
    undefined,
    { parts: [], bytes: 0, truncated: false },
    undefined,
  ]);
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("body filters validate at the boundary", () => {
  const filter = Schema.decodeUnknownExit(Root.Filter);
  assert.equal(
    filter({ urls: ["<all_urls>"], body: { maxBytes: 10, blobs: "resolve" } })._tag,
    "Success",
  );
  assert.equal(
    filter({ urls: ["<all_urls>"], body: { maxBytes: 0, blobs: "resolve" } })._tag,
    "Failure",
  );
  assert.equal(
    filter({ urls: ["<all_urls>"], body: { maxBytes: 10, blobs: "inline" } })._tag,
    "Failure",
  );
});
```

- [x] **Step 2: Run to see them fail**

Run: `node --import tsx --test packages/sewed/test/webrequest-body.test.ts`
Expected: failures on `assembleBody` and `body`.

- [x] **Step 3: Root schemas**

In `src/WebRequest.ts`, before `Filter`:

```ts
export const UploadPart = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("bytes"), bytes: Binary.Bytes }),
  Schema.Struct({
    kind: Schema.Literal("file"),
    path: Schema.String,
    offset: Schema.optionalKey(Schema.Number),
    length: Schema.optionalKey(Schema.Number),
    modificationTime: Schema.optionalKey(Schema.Number),
  }),
  Schema.Struct({ kind: Schema.Literal("blob"), id: Schema.String }),
]);
export type UploadPart = typeof UploadPart.Type;
export const Body = Schema.Struct({
  parts: Schema.Array(UploadPart),
  bytes: Schema.Number,
  truncated: Schema.Boolean,
});
export type Body = typeof Body.Type;
/** Asks the request stage for upload data, capped in bytes; blobs are read or referenced. */
export const BodyFilter = Schema.Struct({
  maxBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  blobs: Schema.Literals(["resolve", "reference"]),
});
export type BodyFilter = typeof BodyFilter.Type;
```

`Filter` gains `body: Schema.optionalKey(BodyFilter)`. `Request` becomes `Schema.Struct({ ...requestFields, body: Schema.optionalKey(Body) })`. Import `* as Binary from "./Binary.ts"` (root, no Electron).

- [x] **Step 4: Body assembly in `internal/WebRequest.ts`**

```ts
type UploadData = Pick<Electron.UploadData, "bytes" | "file" | "blobUUID">;

/** A part is kept only when it fits the remaining budget; the first that does not ends the body. */
export const assembleBody = async (
  parts: readonly UploadData[],
  filter: WebRequest.BodyFilter,
  blob: (id: string) => Promise<Uint8Array>,
): Promise<WebRequest.Body> => {
  const kept: WebRequest.UploadPart[] = [];
  let bytes = 0;
  for (const part of parts) {
    if (part.file !== undefined) {
      kept.push({ kind: "file", path: part.file });
      continue;
    }
    if (part.blobUUID !== undefined && filter.blobs === "reference") {
      kept.push({ kind: "blob", id: part.blobUUID });
      continue;
    }
    const data =
      part.blobUUID === undefined ? new Uint8Array(part.bytes) : await blob(part.blobUUID);
    if (bytes + data.byteLength > filter.maxBytes) return { parts: kept, bytes, truncated: true };
    bytes += data.byteLength;
    kept.push({ kind: "bytes", bytes: data });
  }
  return { parts: kept, bytes, truncated: false };
};
```

`Intercept` gains `readonly body: WebRequest.BodyFilter | undefined` (from the decoded filter). In `reinstall`'s `onBeforeRequest` listener, read blobs once per request:

```ts
const blobs = new Map<string, Promise<Uint8Array>>();
const blob = (id: string) => {
  const existing = blobs.get(id);
  if (existing !== undefined) return existing;
  const read = registry.native.getBlobData(id).then((buffer) => new Uint8Array(buffer));
  blobs.set(id, read);
  return read;
};
const request = requestOf(details);
for (const intercept of matching(...)) {
  const body =
    intercept.body === undefined
      ? undefined
      : await assembleBody(details.uploadData ?? [], intercept.body, blob);
  const decision = await intercept.request!(body === undefined ? request : { ...request, body });
  ...
}
```

A rejected blob read is a failing decider input: catch it around `assembleBody`, log, and `callback({ cancel: true })` like a failed decider.

- [x] **Step 5: Run the tests, then the full suite**

Run: `node --import tsx --test packages/sewed/test/webrequest-body.test.ts && pnpm build && timeout 240 pnpm test`
Expected: green.

- [x] **Step 6: Commit**

```sh
pnpm format && git add -A packages/sewed && git commit -m "Expose capped request bodies to interception deciders"
```

---

### Task 5: `Download.Handle` over an existing native item

**Files:**

- Create: `packages/sewed/src/internal/DownloadItem.ts`
- Create: `packages/sewed/test/download-item.test.ts`
- Modify: `packages/sewed/src/internal/Download.ts` (add `export { adopt } from "./DownloadItem.ts";`)

**Interfaces:**

- Produces: `adopt(item: AdoptableItem): Download.Handle` where `AdoptableItem` is the structural subset of `Electron.DownloadItem` the handle uses: `on/off("updated" | "done")`, `getReceivedBytes`, `getTotalBytes`, `getPercentComplete`, `getCurrentBytesPerSecond`, `canResume`, `isPaused`, `getState`, `pause`, `resume`, `cancel`.

- [x] **Step 1: Write the failing test**

```ts
// packages/sewed/test/download-item.test.ts
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Effect, Stream } from "effect";
import { Testing } from "sewed/testing";
import { adopt } from "../src/internal/DownloadItem.ts";

class FakeItem extends EventEmitter {
  received = 0;
  paused = false;
  state: "progressing" | "completed" | "cancelled" | "interrupted" = "progressing";
  getReceivedBytes = () => this.received;
  getTotalBytes = () => 10;
  getPercentComplete = () => this.received * 10;
  getCurrentBytesPerSecond = () => 1;
  canResume = () => true;
  isPaused = () => this.paused;
  getState = () => this.state;
  pause = () => {
    this.paused = true;
  };
  resume = () => {
    this.paused = false;
  };
  cancel = () => {
    this.state = "cancelled";
    this.emit("done", {}, "cancelled");
  };
}

test("an adopted item reports progress and its terminal outcome", async () => {
  const item = new FakeItem();
  const handle = adopt(item);
  const first = await Effect.runPromise(handle.snapshot.pipe(Effect.provide(Testing.main)));
  assert.equal(first.status, "active");
  item.received = 5;
  item.emit("updated", {}, "progressing");
  const collected = Effect.runPromise(
    handle.progress.pipe(Stream.take(2), Stream.runCollect, Effect.provide(Testing.main)),
  );
  item.received = 10;
  item.state = "completed";
  item.emit("done", {}, "completed");
  const states = await collected;
  assert.deepEqual(
    [...states].map((state) => state.status),
    ["active", "terminal"],
  );
  assert.deepEqual(await Effect.runPromise(handle.awaitDone.pipe(Effect.provide(Testing.main))), {
    kind: "completed",
  });
});

test("cancel ends an adopted item and pause after completion fails Closed", async () => {
  const item = new FakeItem();
  const handle = adopt(item);
  await Effect.runPromise(handle.cancel.pipe(Effect.provide(Testing.main)));
  assert.deepEqual(await Effect.runPromise(handle.awaitDone.pipe(Effect.provide(Testing.main))), {
    kind: "cancelled",
  });
  const exit = await Effect.runPromiseExit(handle.pause.pipe(Effect.provide(Testing.main)));
  assert.equal(exit._tag, "Failure");
});
```

- [x] **Step 2: Run to see it fail**

Run: `node --import tsx --test packages/sewed/test/download-item.test.ts`
Expected: fails at import.

- [x] **Step 3: Implement `DownloadItem.ts`**

```ts
import { Deferred, Effect, PubSub, Stream } from "effect";
import * as Download from "../Download.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observers from "./Observers.ts";

/** The subset of Electron's DownloadItem the adopted handle drives. */
export interface AdoptableItem {
  on(
    event: "updated",
    listener: (event: unknown, state: "progressing" | "interrupted") => void,
  ): unknown;
  on(
    event: "done",
    listener: (event: unknown, state: "completed" | "cancelled" | "interrupted") => void,
  ): unknown;
  off(
    event: "updated",
    listener: (event: unknown, state: "progressing" | "interrupted") => void,
  ): unknown;
  off(
    event: "done",
    listener: (event: unknown, state: "completed" | "cancelled" | "interrupted") => void,
  ): unknown;
  getReceivedBytes(): number;
  getTotalBytes(): number;
  getPercentComplete(): number;
  getCurrentBytesPerSecond(): number;
  canResume(): boolean;
  isPaused(): boolean;
  getState(): "progressing" | "completed" | "cancelled" | "interrupted";
  pause(): void;
  resume(): void;
  cancel(): void;
}

const closedError = () => new SewedError({ code: "Closed", message: "Download is closed" });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

const metrics = (item: AdoptableItem) => ({
  receivedBytes: item.getReceivedBytes(),
  totalBytes: item.getTotalBytes(),
  percent: item.getPercentComplete(),
  currentBytesPerSecond: item.getCurrentBytesPerSecond(),
  canResume: item.canResume(),
  paused: item.isPaused(),
});

/** Wraps a native download that Electron already started; the handle ends with the item. */
export const adopt = (item: AdoptableItem): Download.Handle => {
  const observers = Observers.make<Download.State>("Download", { replayLatest: true });
  const done = Deferred.makeUnsafe<Download.Outcome, SewedError>();
  let state: Download.State = { ...metrics(item), status: "active", phase: "progressing" };
  let terminal: Download.Outcome | undefined;
  const publish = (next: Download.State) => {
    state = next;
    observers.publish(next);
  };
  const updated = (_event: unknown, phase: "progressing" | "interrupted") => {
    if (terminal !== undefined) return;
    publish({ ...metrics(item), status: "active", phase });
  };
  const finished = (_event: unknown, outcome: "completed" | "cancelled" | "interrupted") => {
    if (terminal !== undefined) return;
    terminal = { kind: outcome };
    publish({ ...metrics(item), status: "terminal", outcome });
    Deferred.doneUnsafe(done, Effect.succeed(terminal));
    observers.finish();
    item.off("updated", updated);
    item.off("done", finished);
  };
  item.on("updated", updated);
  item.on("done", finished);
  observers.publish(state);
  const operation = <A>(run: () => A) =>
    Effect.andThen(
      MainContext,
      Effect.try({
        try: () => {
          if (terminal !== undefined) throw closedError();
          return run();
        },
        catch: (cause) =>
          cause instanceof SewedError ? cause : nativeError("Download operation failed", cause),
      }),
    );
  return {
    snapshot: Effect.andThen(
      MainContext,
      Effect.sync(() => state),
    ),
    progress: Stream.unwrap(
      Effect.map(MainContext, () =>
        terminal === undefined ? observers.stream : Stream.succeed(state),
      ),
    ),
    awaitDone: Effect.andThen(MainContext, Deferred.await(done)),
    pause: operation(() => {
      item.pause();
      publish({
        ...metrics(item),
        status: "active",
        phase: state.status === "active" ? state.phase : "progressing",
      });
    }),
    resume: operation(() => {
      item.resume();
      publish({ ...metrics(item), status: "active", phase: "progressing" });
    }),
    cancel: Effect.andThen(
      MainContext,
      Effect.try({
        try: () => {
          if (terminal === undefined) item.cancel();
        },
        catch: (cause) => nativeError("Could not cancel download", cause),
      }),
    ),
  };
};
```

`Observers.make` with `replayLatest` gives new subscribers the current state first, which is the state-stream shape `Download.start` uses. A cancel on a fake that emits `done` synchronously settles before `cancel` returns; a real item emits `done` later, and the handle settles then.

- [x] **Step 4: Re-export, run the tests and the suite, commit**

Add `export { adopt } from "./DownloadItem.ts";` to `internal/Download.ts`.

Run: `node --import tsx --test packages/sewed/test/download-item.test.ts && pnpm build && timeout 240 pnpm test`

```sh
pnpm format && git add -A packages/sewed && git commit -m "Wrap an already-started download item in a Download handle"
```

---

### Task 6: Pattern navigation guard

**Files:**

- Create: `packages/sewed/src/internal/GuestNavigation.ts`
- Create: `packages/sewed/test/guest-navigation.test.ts`

**Interfaces:**

- Produces: `compile(policy: NavigationPolicy): readonly ((url: URL) => boolean)[]` (throws `SewedError` Protocol on invalid input), `make(policy, onBlocked: (blocked: Blocked) => void): Policy` where `Policy = { readonly allows: (url: URL) => boolean; readonly replace: (policy: NavigationPolicy) => void; readonly check: (raw: string) => URL }` and `check` throws Protocol when the URL is unparsable or outside the policy. `guard(policy: Policy, onBlocked): NavigationGuard` adapts it to the core.

- [x] **Step 1: Write the failing test**

```ts
// packages/sewed/test/guest-navigation.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import * as GuestNavigation from "../src/internal/GuestNavigation.ts";
import type { Blocked } from "../src/GuestView.ts";

test("a pattern policy allows matching URLs and nothing when empty", () => {
  const blocked: Blocked[] = [];
  const policy = GuestNavigation.make(["https://*.example.com/*"], (value) => blocked.push(value));
  assert.equal(policy.allows(new URL("https://jobs.example.com/apply")), true);
  assert.equal(policy.allows(new URL("http://jobs.example.com/apply")), false);
  policy.replace([]);
  assert.equal(policy.allows(new URL("https://jobs.example.com/apply")), false);
  assert.throws(
    () => policy.replace(["nope"]),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "Protocol",
  );
  assert.equal(
    policy.allows(new URL("https://jobs.example.com/")),
    false,
    "an invalid replacement leaves the old rules",
  );
});

test("check returns the parsed URL or fails Protocol", () => {
  const policy = GuestNavigation.make(["http://localhost:*/*"], () => {});
  assert.equal(policy.check("http://localhost:4000/a").pathname, "/a");
  assert.throws(() => policy.check("https://other/"), /outside/);
  assert.throws(() => policy.check("not a url"), /Invalid/);
});

test("the guard reports what it prevents", () => {
  const blocked: Blocked[] = [];
  const policy = GuestNavigation.make(["https://a/*"], (value) => blocked.push(value));
  const guard = GuestNavigation.guard(policy);
  assert.equal(guard.allows(new URL("https://b/")), false);
  guard.blocked?.("redirect", "https://b/");
  guard.blocked?.("popup", "https://c/");
  assert.deepEqual(blocked, [
    { kind: "redirect", url: "https://b/" },
    { kind: "popup", url: "https://c/" },
  ]);
});
```

- [x] **Step 2: Run to see it fail** — `node --import tsx --test packages/sewed/test/guest-navigation.test.ts`

- [x] **Step 3: Implement**

```ts
import { Schema } from "effect";
import { NavigationPolicy, type Blocked } from "../GuestView.ts";
import { SewedError } from "../SewedError.ts";
import * as WebRequest from "../WebRequest.ts";
import type { NavigationGuard } from "./WebContentsCore.ts";

const decodePolicy = Schema.decodeUnknownSync(NavigationPolicy);
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

export const compile = (policy: NavigationPolicy): readonly ((url: URL) => boolean)[] => {
  try {
    return decodePolicy(policy).map(WebRequest.compilePattern);
  } catch (cause) {
    throw protocolError("Invalid navigation policy", cause);
  }
};

export interface Policy {
  readonly allows: (url: URL) => boolean;
  readonly replace: (policy: NavigationPolicy) => void;
  readonly check: (raw: string) => URL;
}

export const make = (initial: NavigationPolicy, onBlocked: (blocked: Blocked) => void): Policy => {
  let rules = compile(initial);
  const allows = (url: URL) => rules.some((matches) => matches(url));
  return {
    allows,
    replace: (policy) => {
      rules = compile(policy);
    },
    check: (raw) => {
      const url = URL.parse(raw);
      if (url === null) throw protocolError("Invalid navigation URL");
      if (!allows(url)) {
        onBlocked({ kind: "navigation", url: raw });
        throw protocolError("Navigation target is outside the navigation policy");
      }
      return url;
    },
  };
};

export const guard = (policy: Policy, onBlocked: (blocked: Blocked) => void): NavigationGuard => ({
  allows: policy.allows,
  blocked: (kind, url) => onBlocked({ kind, url }),
});
```

Adjust the test's `guard(policy)` call to `guard(policy, (value) => blocked.push(value))`; `make` keeps its own callback for `check`.

- [x] **Step 4: Run, then commit**

```sh
node --import tsx --test packages/sewed/test/guest-navigation.test.ts && pnpm format && git add -A packages/sewed && git commit -m "Add the guest navigation policy guard"
```

---

### Task 7: Automation group

**Files:**

- Create: `packages/sewed/src/internal/GuestAutomation.ts`
- Create: `packages/sewed/test/guest-automation.test.ts`

**Interfaces:**

- Produces: `interface Contents { isDestroyed(): boolean; executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>; sendInputEvent(event: Electron.MouseInputEvent | Electron.MouseWheelInputEvent | Electron.KeyboardInputEvent): void; readonly debugger: DebuggerLike }`, `interface DebuggerLike { attach(version?: string): void; detach(): void; isAttached(): boolean; sendCommand(method: string, params?: unknown): Promise<unknown> }`, `make<A extends Automation>(declaration: A | undefined, contents: Contents, control: Pick<Control, "isClosed" | "closedError">): { automation: AutomationOf<A>; release: () => void }`.

- [x] **Step 1: Write the failing tests**

```ts
// packages/sewed/test/guest-automation.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Schema } from "effect";
import { Testing } from "sewed/testing";
import * as GuestAutomation from "../src/internal/GuestAutomation.ts";

const control = { isClosed: () => false, closedError: () => new Error("closed") as never };
const fakeContents = (overrides: Partial<GuestAutomation.Contents> = {}) => {
  const calls: unknown[] = [];
  let attached = false;
  const contents: GuestAutomation.Contents = {
    isDestroyed: () => false,
    executeJavaScript: (code) =>
      Promise.resolve(code === "throw" ? Promise.reject(new Error("boom")) : { n: 1 }),
    sendInputEvent: (event) => {
      calls.push(event);
    },
    debugger: {
      attach: () => {
        if (attached) throw new Error("Another debugger is already attached");
        attached = true;
      },
      detach: () => {
        attached = false;
      },
      isAttached: () => attached,
      sendCommand: (method, params) => {
        calls.push([method, params]);
        return Promise.resolve({ ok: true });
      },
    },
    ...overrides,
  };
  return { contents, calls, attached: () => attached };
};
const run = <A>(effect: Effect.Effect<A, unknown, unknown>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(Testing.main)));
const code = (exit: { _tag: string; cause?: unknown }) =>
  exit._tag === "Failure" ? JSON.stringify(exit.cause).match(/"code":"(\w+)"/)?.[1] : undefined;

test("evaluate decodes the page result with the caller's schema", async () => {
  const { contents } = fakeContents();
  const { automation } = GuestAutomation.make({ evaluate: true } as const, contents, control);
  const exit = await run(automation.evaluate("1", Schema.Struct({ n: Schema.Number })));
  assert.equal(exit._tag, "Success");
  assert.equal(
    code(await run(automation.evaluate("1", Schema.Struct({ n: Schema.String })))),
    "Protocol",
  );
  assert.equal(code(await run(automation.evaluate("throw", Schema.Unknown))), "Native");
});

test("devtools attaches once, enforces the allowlist, and maps a held debugger to Limit", async () => {
  const { contents, calls, attached } = fakeContents();
  const { automation, release } = GuestAutomation.make(
    { devtools: ["Runtime.evaluate"] } as const,
    contents,
    control,
  );
  const exit = await run(
    automation.devtools(
      "Runtime.evaluate",
      { expression: "1" },
      Schema.Struct({ ok: Schema.Boolean }),
    ),
  );
  assert.equal(exit._tag, "Success");
  assert.equal(attached(), true);
  assert.deepEqual(calls, [["Runtime.evaluate", { expression: "1" }]]);
  const full = GuestAutomation.make(
    { devtools: ["Runtime.evaluate", "DOM.getDocument"] } as const,
    contents,
    control,
  );
  assert.equal(
    code(await run(full.automation.devtools("DOM.getDocument", undefined, Schema.Unknown))),
    "Limit",
  );
  release();
  assert.equal(attached(), false);
});

test("undeclared members fail with Protocol at runtime", async () => {
  const { contents, calls } = fakeContents();
  const { automation } = GuestAutomation.make(undefined, contents, control);
  const untyped: Record<string, unknown> = automation;
  const evaluate = untyped.evaluate;
  assert.equal(typeof evaluate, "function");
  if (typeof evaluate === "function")
    assert.equal(code(await run(evaluate("1", Schema.Unknown))), "Protocol");
  const withInput = GuestAutomation.make({ input: true } as const, contents, control);
  assert.equal(
    (await run(withInput.automation.input({ type: "keyDown", keyCode: "a", modifiers: ["shift"] })))
      ._tag,
    "Success",
  );
  assert.deepEqual(calls, [{ type: "keyDown", keyCode: "a", modifiers: ["shift"] }]);
  assert.equal(
    code(await run(withInput.automation.input({ type: "keyDown" } as never))),
    "Protocol",
  );
});
```

The `as never` in the last line is test code exercising the runtime decoder with an invalid value.

- [x] **Step 2: Run to see it fail** — `node --import tsx --test packages/sewed/test/guest-automation.test.ts`

- [x] **Step 3: Implement**

```ts
import { Effect, Schema } from "effect";
import { Automation, type AutomationOf, EvaluateOptions, InputEvent } from "../GuestView.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { Control } from "./WebContentsCore.ts";

export interface DebuggerLike {
  attach(version?: string): void;
  detach(): void;
  isAttached(): boolean;
  sendCommand(method: string, params?: unknown): Promise<unknown>;
}
export interface Contents {
  isDestroyed(): boolean;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  sendInputEvent(
    event: Electron.MouseInputEvent | Electron.MouseWheelInputEvent | Electron.KeyboardInputEvent,
  ): void;
  readonly debugger: DebuggerLike;
}

interface Full {
  readonly evaluate: <T, I>(
    script: string,
    result: Schema.Codec<T, I>,
    options?: EvaluateOptions,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly devtools: <T, I>(
    method: string,
    params: Schema.Json | undefined,
    result: Schema.Codec<T, I>,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly input: (event: InputEvent) => Effect.Effect<void, SewedError, MainContext>;
}

const decodeAutomation = Schema.decodeUnknownSync(Automation);
const decodeEvaluateOptions = Schema.decodeUnknownSync(EvaluateOptions);
const decodeInput = Schema.decodeUnknownSync(InputEvent);
const decodeJson = Schema.decodeUnknownSync(Schema.Json);
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

/**
 * Every member exists at runtime and fails with `Protocol` when undeclared; the declared type
 * only hides the undeclared ones. This is the one generic bridge in the surface: the invariant is
 * that `Full` implements every branch of `AutomationOf`, and `guest-types.ts` covers the narrowing.
 */
const narrow = <A extends Automation>(full: Full): AutomationOf<A> => full as AutomationOf<A>;

export const make = <A extends Automation>(
  declaration: A | undefined,
  contents: Contents,
  control: Pick<Control, "isClosed" | "closedError">,
): { readonly automation: AutomationOf<A>; readonly release: () => void } => {
  const declared = declaration === undefined ? {} : decodeAutomation(declaration);
  const allowlist = new Set<string>(declared.devtools ?? []);
  const guarded = <T>(granted: boolean, what: string, run: () => Effect.Effect<T, SewedError>) =>
    Effect.andThen(
      MainContext,
      Effect.suspend(() => {
        if (!granted) return Effect.fail(protocolError(`${what} was not declared for this guest`));
        if (control.isClosed() || contents.isDestroyed()) return Effect.fail(control.closedError());
        return run();
      }),
    );
  const decodeResult = <T, I>(result: Schema.Codec<T, I>, value: unknown) =>
    Effect.mapError(Schema.decodeUnknownEffect(result)(value), (cause) =>
      protocolError("Result does not match the declared schema", cause),
    );
  const attach = () =>
    Effect.try({
      try: () => {
        if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
      },
      catch: (cause) =>
        cause instanceof Error && /already attached/i.test(cause.message)
          ? new SewedError({ code: "Limit", message: "Another debugger holds this guest", cause })
          : nativeError("Could not attach the debugger", cause),
    });
  const full: Full = {
    evaluate: (script, result, options = {}) =>
      guarded(declared.evaluate === true, "evaluate", () =>
        Effect.gen(function* () {
          const settings = yield* Effect.try({
            try: () => decodeEvaluateOptions(options),
            catch: (cause) => protocolError("Invalid evaluate options", cause),
          });
          const value = yield* Effect.tryPromise({
            try: () => contents.executeJavaScript(script, settings.userGesture === true),
            catch: (cause) =>
              contents.isDestroyed()
                ? control.closedError()
                : nativeError("Page threw during evaluate", cause),
          });
          return yield* decodeResult(result, value);
        }),
      ),
    devtools: (method, params, result) =>
      guarded(allowlist.size > 0, "devtools", () =>
        Effect.gen(function* () {
          if (!allowlist.has(method))
            return yield* Effect.fail(protocolError(`${method} is outside the DevTools allowlist`));
          const parameters = yield* Effect.try({
            try: () => (params === undefined ? undefined : decodeJson(params)),
            catch: (cause) => protocolError("Invalid DevTools parameters", cause),
          });
          yield* attach();
          const value = yield* Effect.tryPromise({
            try: () => contents.debugger.sendCommand(method, parameters),
            catch: (cause) =>
              contents.isDestroyed()
                ? control.closedError()
                : nativeError(`${method} failed`, cause),
          });
          return yield* decodeResult(result, value);
        }),
      ),
    input: (event) =>
      guarded(declared.input === true, "input", () =>
        Effect.try({
          try: () => {
            const decoded = decodeInput(event);
            contents.sendInputEvent(
              decoded.modifiers === undefined
                ? { ...decoded }
                : { ...decoded, modifiers: [...decoded.modifiers] },
            );
          },
          catch: (cause) =>
            cause instanceof SewedError
              ? cause
              : cause instanceof Schema.SchemaError
                ? protocolError("Invalid input event", cause)
                : nativeError("Could not send input event", cause),
        }),
      ),
  };
  return {
    automation: narrow<A>(full),
    release: () => {
      if (contents.isDestroyed()) return;
      try {
        if (contents.debugger.isAttached()) contents.debugger.detach();
      } catch {
        // The contents are closing; a detach failure has nothing left to release.
      }
    },
  };
};
```

If `Schema.SchemaError` is not the decode failure class name in rc.115, check `Schema.decodeUnknownSync`'s thrown type in `node_modules/.pnpm/effect@4.0.0-rc.115/node_modules/effect/dist/Schema.d.ts` and use it; the branch only has to distinguish a decode failure from a native throw.

- [x] **Step 4: Run, then commit**

```sh
node --import tsx --test packages/sewed/test/guest-automation.test.ts && pnpm format && git add -A packages/sewed && git commit -m "Add the fenced guest automation group"
```

---

### Task 8: Download dispatch per session

**Files:**

- Create: `packages/sewed/src/internal/GuestDownloads.ts`
- Create: `packages/sewed/test/guest-downloads.test.ts`

**Interfaces:**

- Produces: `install(session: SessionLike, contentsId: number, entry: Entry): () => void` where `SessionLike = { on(event: "will-download", ...); off(...) }` structurally, `Entry = { readonly sourceId: string; readonly onBlocked: (url: string) => void; decide: ((offer: DownloadOffer) => DownloadDecision) | undefined; readonly onAccepted: (handle: Download.Handle) => void }`, and `deciderSync<R>(decide, context): (offer) => DownloadDecision` that runs the Effect decider synchronously and denies on failure or suspension.

- [x] **Step 1: Write the failing tests**

```ts
// packages/sewed/test/guest-downloads.test.ts
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Context, Effect } from "effect";
import * as GuestDownloads from "../src/internal/GuestDownloads.ts";

class FakeItem extends EventEmitter {
  savePath = "";
  cancelled = false;
  getURL = () => "https://example.com/report.pdf";
  getFilename = () => "report.pdf";
  getMimeType = () => "application/pdf";
  getTotalBytes = () => 42;
  getReceivedBytes = () => 0;
  getPercentComplete = () => 0;
  getCurrentBytesPerSecond = () => 0;
  canResume = () => false;
  isPaused = () => false;
  getState = () => "progressing" as const;
  setSavePath = (path: string) => {
    this.savePath = path;
  };
  pause = () => {};
  resume = () => {};
  cancel = () => {
    this.cancelled = true;
  };
}
const fire = (session: EventEmitter, contentsId: number, item: FakeItem) => {
  let prevented = false;
  session.emit(
    "will-download",
    {
      preventDefault: () => {
        prevented = true;
      },
    },
    item,
    { id: contentsId },
  );
  return prevented;
};

test("a guest without a decider denies and reports the download", () => {
  const session = new EventEmitter();
  const blocked: string[] = [];
  const release = GuestDownloads.install(session, 5, {
    sourceId: "g1",
    onBlocked: (url) => blocked.push(url),
    decide: undefined,
    onAccepted: () => assert.fail("accepted"),
  });
  assert.equal(fire(session, 5, new FakeItem()), true);
  assert.equal(fire(session, 6, new FakeItem()), false, "another contents is not this guest's");
  assert.deepEqual(blocked, ["https://example.com/report.pdf"]);
  release();
  assert.equal(session.listenerCount("will-download"), 0);
});

test("a save decision sets the path and offers an adopted handle", () => {
  const session = new EventEmitter();
  const accepted: unknown[] = [];
  const entry: GuestDownloads.Entry = {
    sourceId: "g1",
    onBlocked: () => assert.fail("blocked"),
    decide: undefined,
    onAccepted: (handle) => accepted.push(handle),
  };
  GuestDownloads.install(session, 5, entry);
  entry.decide = (offer) => ({ kind: "save", path: `/tmp/${offer.filename}` });
  const item = new FakeItem();
  assert.equal(fire(session, 5, item), false);
  assert.equal(item.savePath, "/tmp/report.pdf");
  assert.equal(accepted.length, 1);
  entry.decide = () => ({ kind: "deny" });
  assert.equal(fire(session, 5, new FakeItem()), true);
});

test("deciders run synchronously with the captured services; suspension denies", () => {
  class Root extends Context.Service<Root, { readonly dir: string }>()("test/Root") {}
  const context = Context.make(Root, { dir: "/data" });
  const decide = GuestDownloads.deciderSync(
    (offer) =>
      Effect.map(Root, ({ dir }) => ({ kind: "save" as const, path: `${dir}/${offer.filename}` })),
    context,
  );
  const offer = { url: "u", filename: "f", mimeType: "m", totalBytes: 1, sourceId: "s" };
  assert.deepEqual(decide(offer), { kind: "save", path: "/data/f" });
  const async = GuestDownloads.deciderSync(
    () => Effect.delay(Effect.succeed({ kind: "save" as const, path: "/x" }), 10),
    context,
  );
  assert.deepEqual(async(offer), { kind: "deny" });
  const invalid = GuestDownloads.deciderSync(
    () => Effect.succeed({ kind: "save" } as never),
    context,
  );
  assert.deepEqual(invalid(offer), { kind: "deny" });
});
```

- [x] **Step 2: Run to see them fail** — `node --import tsx --test packages/sewed/test/guest-downloads.test.ts`

- [x] **Step 3: Implement**

```ts
import type { Context } from "effect";
import { Effect, Exit, Schema } from "effect";
import type * as Download from "../Download.ts";
import { DownloadDecision, type DownloadOffer } from "../GuestView.ts";
import { SewedError } from "../SewedError.ts";
import { adopt, type AdoptableItem } from "./DownloadItem.ts";

interface Item extends AdoptableItem {
  getURL(): string;
  getFilename(): string;
  getMimeType(): string;
  setSavePath(path: string): void;
}
type Listener = (
  event: { preventDefault(): void },
  item: Item,
  contents: { readonly id: number },
) => void;
export interface SessionLike {
  on(event: "will-download", listener: Listener): unknown;
  off(event: "will-download", listener: Listener): unknown;
}
export interface Entry {
  readonly sourceId: string;
  readonly onBlocked: (url: string) => void;
  decide: ((offer: DownloadOffer) => DownloadDecision) | undefined;
  readonly onAccepted: (handle: Download.Handle) => void;
}
interface Registry {
  readonly entries: Map<number, Entry>;
  readonly listener: Listener;
}

const registries = new WeakMap<SessionLike, Registry>();
const decodeDecision = Schema.decodeUnknownSync(DownloadDecision);

/** Runs an Effect decider to completion synchronously; failure or suspension denies. */
export const deciderSync =
  <R>(
    decide: (offer: DownloadOffer) => Effect.Effect<DownloadDecision, SewedError, R>,
    context: Context.Context<R>,
  ) =>
  (offer: DownloadOffer): DownloadDecision => {
    const exit = Effect.runSyncExitWith(context)(
      Effect.suspend(() => decide(offer)).pipe(Effect.map((decision) => decodeDecision(decision))),
    );
    if (Exit.isSuccess(exit)) return exit.value;
    Effect.runFork(
      Effect.logError(
        "Download decider failed or did not complete synchronously; download denied",
        exit.cause,
      ),
    );
    return { kind: "deny" };
  };

const offerOf = (item: Item, sourceId: string): DownloadOffer => ({
  url: item.getURL(),
  filename: item.getFilename(),
  mimeType: item.getMimeType(),
  totalBytes: item.getTotalBytes(),
  sourceId,
});

const registryOf = (session: SessionLike): Registry => {
  const existing = registries.get(session);
  if (existing !== undefined) return existing;
  const entries = new Map<number, Entry>();
  const listener: Listener = (event, item, contents) => {
    const entry = entries.get(contents.id);
    if (entry === undefined) return;
    if (entry.decide === undefined) {
      event.preventDefault();
      entry.onBlocked(item.getURL());
      return;
    }
    const decision = entry.decide(offerOf(item, entry.sourceId));
    if (decision.kind === "deny") {
      event.preventDefault();
      entry.onBlocked(item.getURL());
      return;
    }
    try {
      item.setSavePath(decision.path);
    } catch {
      event.preventDefault();
      entry.onBlocked(item.getURL());
      return;
    }
    entry.onAccepted(adopt(item));
  };
  const registry: Registry = { entries, listener };
  registries.set(session, registry);
  session.on("will-download", listener);
  return registry;
};

/** Registers a guest's contents; the listener is removed when the last guest leaves the session. */
export const install = (session: SessionLike, contentsId: number, entry: Entry): (() => void) => {
  const registry = registryOf(session);
  registry.entries.set(contentsId, entry);
  return () => {
    if (registry.entries.get(contentsId) !== entry) return;
    registry.entries.delete(contentsId);
    if (registry.entries.size === 0) {
      session.off("will-download", registry.listener);
      registries.delete(session);
    }
  };
};
```

`Effect.runSyncExitWith(context)` takes the services context and returns an `Exit`; if rc.115 spells the curried form differently (`runSyncExitWith(context)(effect)` vs `runSyncExitWith(effect, context)`), read its signature in `dist/Effect.d.ts` and match it.

- [x] **Step 4: Run, then commit**

```sh
node --import tsx --test packages/sewed/test/guest-downloads.test.ts && pnpm format && git add -A packages/sewed && git commit -m "Dispatch guest downloads through one listener per session"
```

---

### Task 9: Hosted owner handlers gated by the host policy

**Files:**

- Create: `packages/sewed/src/internal/GuestHost.ts`
- Create: `packages/sewed/test/guest-host.test.ts`

**Interfaces:**

- Produces: `handlers(policy: HostPolicy, core: HostCore, navigate: (url: string) => Effect<void, SewedError, MainContext>): Layer<HandlerServices<...>>` built with `protocol.toLayer`, where `HostCore` is the structural subset of `Core` the protocol serves: `state`, `focus`, `capture`, `zoom`, `setZoom`, `history`, `back`, `forward`, `find`, `findNext`, `stopFind`.

- [x] **Step 1: Write the failing test**

```ts
// packages/sewed/test/guest-host.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Stream } from "effect";
import { Binding, GuestView, SewedError } from "sewed";
import { Testing } from "sewed/testing";
import * as GuestHost from "../src/internal/GuestHost.ts";

const Tab = Binding.slot("tab", GuestView.protocol);
const calls: string[] = [];
const fakeCore: GuestHost.HostCore = {
  state: Stream.make({ status: "ready" as const, url: "http://localhost/", processId: 1 }),
  focus: Effect.sync(() => {
    calls.push("focus");
  }),
  capture: () => Effect.succeed(new Uint8Array([137, 80, 78, 71])),
  zoom: Stream.make({ factor: 1 }),
  setZoom: (factor) =>
    Effect.sync(() => {
      calls.push(`zoom:${factor}`);
    }),
  history: Stream.make({ index: 0, entries: [], canGoBack: false, canGoForward: false }),
  back: Effect.sync(() => {
    calls.push("back");
  }),
  forward: Effect.sync(() => {
    calls.push("forward");
  }),
  find: () =>
    Effect.succeed({ results: Stream.empty, next: () => Effect.void, stop: () => Effect.void }),
  findNext: () => Effect.void,
  stopFind: () => Effect.void,
};
const navigate = (url: string) =>
  Effect.sync(() => {
    calls.push(`navigate:${url}`);
  });
const withClient = <A>(
  policy: GuestView.HostPolicy,
  use: (client: Binding.Client<typeof GuestView.protocol>) => Effect.Effect<A, unknown, unknown>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Binding.client(Tab);
        return yield* use(client);
      }).pipe(Effect.provide(Testing.layer(Tab, GuestHost.handlers(policy, fakeCore, navigate)))),
    ),
  );

test("state, focus, zoom, and history are always served", async () => {
  const exit = await withClient({ navigate: false, capture: false }, (tab) =>
    Effect.gen(function* () {
      const state = yield* tab.state().pipe(Stream.take(1), Stream.runCollect);
      yield* tab.focus();
      yield* tab.setZoom({ factor: 1.5 });
      yield* tab.back();
      return [...state][0]?.status;
    }),
  );
  assert.equal(exit._tag, "Success");
  assert.deepEqual(calls.splice(0), ["focus", "zoom:1.5", "back"]);
});

test("navigate and capture follow the policy", async () => {
  const denied = await withClient({ navigate: false, capture: false }, (tab) =>
    tab.navigate({ url: "http://localhost/a" }),
  );
  assert.equal(denied._tag, "Failure");
  assert.match(JSON.stringify(denied), /"code":"Protocol"/);
  const granted = await withClient({ navigate: true, capture: true }, (tab) =>
    Effect.gen(function* () {
      yield* tab.navigate({ url: "http://localhost/a" });
      return yield* tab.capture({});
    }),
  );
  assert.equal(granted._tag, "Success");
  if (granted._tag === "Success") assert.equal(granted.value.byteLength, 4);
  assert.deepEqual(calls.splice(0), ["navigate:http://localhost/a"]);
  void SewedError;
});
```

Check the exact name of the client helper in `packages/sewed/src/PublicBinding.ts` (`Binding.client(slot)` and the `Binding.Client` type) and the `Testing.layer` signature in `src/Testing.ts` before running; adjust the import names to what exists.

- [x] **Step 2: Run to see it fail** — `node --import tsx --test packages/sewed/test/guest-host.test.ts`

- [x] **Step 3: Implement**

```ts
import { Effect, Stream } from "effect";
import { HostPolicy, protocol } from "../GuestView.ts";
import type { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type * as WebContents from "../WebContents.ts";
import { Schema } from "effect";

export interface HostCore {
  readonly state: Stream.Stream<WebContents.State, SewedError, MainContext>;
  readonly focus: Effect.Effect<void, SewedError, MainContext>;
  readonly capture: (
    options: WebContents.CaptureOptions,
  ) => Effect.Effect<Uint8Array, SewedError, MainContext>;
  readonly zoom: Stream.Stream<WebContents.Zoom, SewedError, MainContext>;
  readonly setZoom: (factor: number) => Effect.Effect<void, SewedError, MainContext>;
  readonly history: Stream.Stream<WebContents.History, SewedError, MainContext>;
  readonly back: Effect.Effect<void, SewedError, MainContext>;
  readonly forward: Effect.Effect<void, SewedError, MainContext>;
  readonly find: (
    text: string,
    options?: WebContents.FindOptions,
  ) => Effect.Effect<WebContents.Search, SewedError, MainContext>;
  readonly findNext: (forward?: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly stopFind: (
    action?: WebContents.FindStop,
  ) => Effect.Effect<void, SewedError, MainContext>;
}

const decodePolicy = Schema.decodeUnknownSync(HostPolicy);
const denied = (what: string) =>
  Effect.fail(
    new SewedError({ code: "Protocol", message: `The host policy does not grant ${what}` }),
  );

export const handlers = (
  policy: HostPolicy,
  core: HostCore,
  navigate: (url: string) => Effect.Effect<void, SewedError, MainContext>,
) => {
  const granted = decodePolicy(policy);
  return protocol.toLayer({
    state: () => core.state,
    focus: () => core.focus,
    navigate: ({ url }) => (granted.navigate ? navigate(url) : denied("navigate")),
    capture: (options) => (granted.capture ? core.capture(options) : denied("capture")),
    zoom: () => core.zoom,
    setZoom: ({ factor }) => core.setZoom(factor),
    history: () => core.history,
    back: () => core.back,
    forward: () => core.forward,
    find: ({ text, options }) =>
      Stream.scoped(
        Stream.unwrap(Effect.map(core.find(text, options ?? {}), (search) => search.results)),
      ),
    findNext: ({ forward }) => core.findNext(forward),
    stopFind: ({ action }) => core.stopFind(action),
  });
};
```

`decodePolicy` throws synchronously on an invalid policy; `GuestView.host` (Task 10) wraps the call in `Effect.try` so the failure is a `Protocol` error before an owner exists.

- [x] **Step 4: Run, then commit**

```sh
node --import tsx --test packages/sewed/test/guest-host.test.ts && pnpm format && git add -A packages/sewed && git commit -m "Serve guest views to bound renderers behind a host policy"
```

---

### Task 10: `GuestView.make`, exports, and the compile-time contract

**Files:**

- Create: `packages/sewed/src/internal/GuestView.ts`
- Create: `packages/sewed/test/guest-types.ts`
- Modify: `packages/sewed/src/main.ts` (`export * as GuestView from "./internal/GuestView.ts";` after `ImageView`)
- Modify: `scripts/api-reference.mjs` only if the generated reference misses the new namespaces (it enumerates the entry declaration files, so no change is expected)

**Interfaces:**

- Produces: `GuestView.make<const A extends Automation>(options: Options<A>): Effect<Handle<A>, SewedError, MainContext | Scope>`; `type Handle<A> = Public.Handle<A, Core>`; re-exports of every root schema and `protocol`.

- [x] **Step 1: Write the compile-time contract**

```ts
// packages/sewed/test/guest-types.ts
import { Effect, Schema, Scope, Stream } from "effect";
import { MainContext, SewedError } from "sewed";
import { BrowserWindow, GuestView, WebContentsView } from "sewed/main";

const usage: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.gen(function* () {
  const window = yield* BrowserWindow.make({ show: false });
  const guest = yield* GuestView.make({
    navigation: ["https://*/*"],
    automation: { evaluate: true, devtools: ["Runtime.evaluate", "DOM.getDocument"] },
  });
  yield* window.attach(guest, { bounds: { x: 0, y: 0, width: 10, height: 10 } });
  yield* guest.navigate("https://example.com/");
  yield* guest.setNavigationPolicy([]);
  const title: string = yield* guest.automation.evaluate("document.title", Schema.String);
  void title;
  yield* guest.automation.devtools("DOM.getDocument", { depth: 1 }, Schema.Unknown);
  const owner = yield* guest.host({ navigate: true, capture: false });
  void owner;
  yield* guest.blocked.pipe(Stream.take(1), Stream.runDrain);
  yield* guest.webContents.capture({});
  yield* guest.webContents.focus;
  yield* guest.close;
});
void usage;

const declared = Effect.gen(function* () {
  const guest = yield* GuestView.make({ navigation: [], automation: { evaluate: true } });
  // @ts-expect-error devtools was not declared, so the member does not exist.
  yield* guest.automation.devtools("Runtime.evaluate", undefined, Schema.Unknown);
  // @ts-expect-error input was not declared, so the member does not exist.
  yield* guest.automation.input({ type: "keyDown", keyCode: "a" });
  const narrow = yield* GuestView.make({
    navigation: [],
    automation: { devtools: ["Runtime.evaluate"] },
  });
  // @ts-expect-error A method outside the declared allowlist is a type error.
  yield* narrow.automation.devtools("Runtime.callFunctionOn", undefined, Schema.Unknown);
  const plain = yield* GuestView.make({ navigation: [] });
  // @ts-expect-error No automation was declared.
  yield* plain.automation.evaluate("1", Schema.Unknown);
});
void declared;

const separation = Effect.gen(function* () {
  const guest = yield* GuestView.make({ navigation: [] });
  // @ts-expect-error A guest has no load and carries no bindings.
  yield* guest.webContents.load;
  const view = yield* WebContentsView.make();
  // @ts-expect-error A renderer view has no navigate.
  yield* view.navigate("https://example.com/");
  // @ts-expect-error A renderer view has no automation.
  view.automation;
});
void separation;

// @ts-expect-error Guest acquisition requires MainContext and Scope.
const missing: Effect.Effect<GuestView.Handle, SewedError, Scope.Scope> = GuestView.make({
  navigation: [],
});
void missing;
```

- [x] **Step 2: Run it to see it fail** — `pnpm build; tsc -p packages/sewed/test/tsconfig.json` fails because `sewed/main` has no `GuestView`.

- [x] **Step 3: Implement `internal/GuestView.ts`**

```ts
import { WebContentsView as NativeWebContentsView, session as nativeSession } from "electron";
import { Deferred, Effect, Exit, Schema, Scope, Stream } from "effect";
import type { Owner } from "../Binding.ts";
import type * as Download from "../Download.ts";
import * as Public from "../GuestView.ts";
import { host as hostOwner } from "../Host.ts";
import { generateInstanceId } from "../InstanceId.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as GuestAutomation from "./GuestAutomation.ts";
import * as GuestDownloads from "./GuestDownloads.ts";
import * as GuestHost from "./GuestHost.ts";
import * as GuestNavigation from "./GuestNavigation.ts";
import * as Observers from "./Observers.ts";
import * as Session from "./Session.ts";
import { type Attachable, register, type State, viewIdentity } from "./View.ts";
import { core, type Core, decoded, nativeError, protocolError } from "./WebContentsCore.ts";

export {
  Automation, Blocked, DevToolsMethod, DownloadDecision, DownloadOffer, EvaluateOptions,
  HostPolicy, InputEvent, KeyboardInput, MouseInput, MouseWheelInput, NavigationPolicy,
  Settings, WebRtcPolicy, protocol,
} from "../GuestView.ts";
export type { AutomationOf, Options } from "../GuestView.ts";
export type Handle<A extends Public.Automation = {}> = Public.Handle<A, Core>;

const decodeSettings = Schema.decodeUnknownSync(Public.Settings);
const webRtcOf = (policy: Public.WebRtcPolicy) =>
  policy === "publicInterfaceOnly" ? "default_public_interface_only"
  : policy === "disableNonProxiedUdp" ? "disable_non_proxied_udp"
  : "default";

export const make = <const A extends Public.Automation>(
  options: Public.Options<A>,
): Effect.Effect<Handle<A>, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const { session, ...rest } = options;
    const settings = yield* decoded("Invalid guest view options", () => decodeSettings(rest));
    const parent = yield* Effect.scope;
    const lifetime = yield* Scope.fork(parent);
    const closed = yield* Deferred.make<void>();
    const blocked = Observers.make<Public.Blocked>("Blocked");
    const policy = GuestNavigation.make(settings.navigation, blocked.publish);
    const native = yield* Effect.try({
      try: () => {
        const selected = session === undefined ? Session.fromNative(nativeSession.defaultSession) : session;
        const view = new NativeWebContentsView({
          webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            webviewTag: false,
            session: Session.resolve(selected),
            ...(settings.backgroundThrottling === undefined ? {} : { backgroundThrottling: settings.backgroundThrottling }),
          },
        });
        if (settings.webRtc !== undefined) view.webContents.setWebRTCIPHandlingPolicy(webRtcOf(settings.webRtc));
        return view;
      },
      catch: (cause) => nativeError("Could not create guest view", cause),
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
    const contents = native.webContents;
    // closeNativeContents and the destroyed-driven lifetime are copied from internal/WebContentsView.ts.
    ...
    return yield* Effect.gen(function* () {
      const { contents: web, control } = yield* core(contents, GuestNavigation.guard(policy, blocked.publish)).pipe(Scope.provide(lifetime));
      const id = yield* generateInstanceId();
      const state: State = { native, lifetime, isDestroyed: () => contents.isDestroyed(), closedFlag: false, scopeClosing: false, attachment: undefined };
      // onDestroyed, the scope finalizer for the attachment, register(handle, state): as in WebContentsView.
      const unregister = ContentsRegistry.register(contents.id, id);
      const automation = GuestAutomation.make(options.automation, contents, control);
      const downloads: GuestDownloads.Entry = {
        sourceId: id,
        onBlocked: (url) => blocked.publish({ kind: "download", url }),
        decide: undefined,
        onAccepted: () => {},
      };
      const uninstallDownloads = GuestDownloads.install(contents.session, contents.id, downloads);
      // Finalizers run in reverse: unregister both registries, deny pending downloads, detach the debugger, then the contents close (registered earlier).
      yield* Scope.addFinalizer(lifetime, Effect.sync(() => {
        automation.release();
        downloads.decide = undefined;
        uninstallDownloads();
        unregister();
        blocked.finish();
      }));
      const navigate = (url: string) =>
        Effect.andThen(
          decoded("Invalid navigation URL", () => policy.check(url)),
          (target) => control.asynchronous("Could not load page", () => contents.loadURL(target.href)),
        );
      const handle: Handle<A> = {
        [viewIdentity]: true,
        id,
        webContents: web,
        navigate,
        setNavigationPolicy: (next) => control.operation(() => { policy.replace(next); }),
        blocked: blocked.stream,
        downloads: <R>(decide: (offer: Public.DownloadOffer) => Effect.Effect<Public.DownloadDecision, SewedError, R>) =>
          Stream.unwrap(
            Effect.gen(function* () {
              yield* MainContext;
              const context = yield* Effect.context<R>();
              if (control.isClosed()) return Stream.fail(control.closedError());
              const accepted = Observers.make<Download.Handle>("Downloads");
              return Stream.callback ... // install: downloads.decide = deciderSync(decide, context); downloads.onAccepted = accepted.publish; release: reset both to deny.
            }),
          ),
        automation: automation.automation,
        host: (hostPolicy) =>
          Effect.gen(function* () {
            yield* MainContext;
            const layer = yield* decoded("Invalid host policy", () => GuestHost.handlers(hostPolicy, web, navigate));
            return yield* hostOwner(Public.protocol, layer);
          }),
        close: /* as WebContentsView.close */,
        awaitClosed: Effect.andThen(MainContext, Deferred.await(closed)),
      };
      register(handle, state);
      return handle;
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
  });
```

For `downloads`, implement the stream with `Observation.listen("Downloads", (offer) => Effect.sync(() => { downloads.decide = deciderSync(decide, context); downloads.onAccepted = offer; return () => { downloads.decide = undefined; downloads.onAccepted = () => {}; }; }))` so each observer owns the installation for its scope; `Entry.onAccepted` must therefore be mutable (`onAccepted: (handle) => void` without `readonly`). Update `GuestDownloads.Entry` accordingly (both fields mutable) and the Task 8 tests if the field names change. `Stream.interruptWhen(Deferred.await(closed))` ends the stream when the view closes.

`navigate` calls `policy.check` (which reports `Blocked{navigation}` and fails Protocol outside the policy) before `loadURL`, so main has one rule set and no implicit exception. `loadURL` rejection for a failed page maps to `Native` through `control.asynchronous`; the state stream reports the failure like any other load.

`host` requires the caller's `Scope`: `hostOwner` yields the owner into the current scope, so the signature's `Scope.Scope` requirement comes from `hostOwner` itself.

- [x] **Step 4: Export from `main.ts`, build, and run everything**

Run: `pnpm build && timeout 240 pnpm test`
Expected: the compile-time file passes with every `@ts-expect-error` consumed, and the reference check reports `docs/reference.md` out of date; run `pnpm docs:reference` and rerun.

- [x] **Step 5: Commit**

```sh
pnpm format && git add -A packages/sewed docs/reference.md && git commit -m "Add GuestView, a view for pages the application does not own"
```

---

### Task 11: Playground fixture `verify:guest`

**Files:**

- Create: `../sewed-playground/scripts/guest-fixture.mjs`
- Create: `../sewed-playground/scripts/verify-guest.mjs`
- Modify: `../sewed-playground/package.json` (add `"verify:guest": "node scripts/verify-guest.mjs"` after `verify:native-views`)
- Modify: `../sewed-playground/docs/verification.md` (mention `verify:guest` in the fixture list sentence on line 40)

**Interfaces:**

- Consumes: `GuestView.make`, `window.attach`, `guest.navigate`, `guest.blocked`, `guest.downloads`, `guest.automation`, `guest.host`, `Session.intercept` with `body`, `Download.Handle`.

- [x] **Step 1: Pack and install the library into the playground**

```sh
node scripts/release.mjs pack && cd ../sewed-playground && env -u FORCE_COLOR NO_COLOR=1 pnpm install && pnpm build
```

- [x] **Step 2: Write `verify-guest.mjs`**

```js
import { verifyNative } from "./verify-native.mjs";

await verifyNative({
  fixture: "scripts/guest-fixture.mjs",
  artifact: "guest",
  marker: "GUEST_VERIFICATION",
  electronArgs: ["--ozone-platform=x11"],
  timeout: 120_000,
});
```

- [x] **Step 3: Write `guest-fixture.mjs`**

The fixture follows `session-extras-fixture.mjs`: a `record(name, evidence)` helper, a local HTTP site, `App.run` with `quitOnLastWindowClosed: false`, and the `GUEST_VERIFICATION` marker. Two servers give two origins: `site` (allowed) and `other` (outside the policy).

```js
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { Cause, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import { Binding, GuestView as GuestContract, SewedError } from "sewed";
import { App, BrowserWindow, GuestView, Session, host } from "sewed/main";

app.setPath("userData", mkdtempSync(join(tmpdir(), "sewed-guest-")));
const checks = [];
const record = (name, evidence = {}) => {
  checks.push({ name, evidence });
  console.log(`PASS ${name}`);
};
const codeOf = (exit) => (exit._tag === "Failure" ? Cause.squash(exit.cause) : undefined)?.code;

const page = (title, body) => `<!doctype html><title>${title}</title><body>${body}</body>`;
const site = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const html = (body) =>
    response
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(page("guest", body));
  if (url.pathname === "/")
    return html(
      `<a id="cross" href="${other.origin}/">cross</a><a id="same" href="/second">same</a><a id="redirect" href="/redirect">redirect</a><button id="popup" onclick="window.open('${other.origin}/')">popup</button>`,
    );
  if (url.pathname === "/second") return html("<p id='second'>second</p>");
  if (url.pathname === "/redirect")
    return response.writeHead(302, { location: `${other.origin}/` }).end();
  if (url.pathname === "/webview") return html("<webview id='wv' src='about:blank'></webview>");
  if (url.pathname === "/form")
    return html(
      `<form id="f" method="post" enctype="multipart/form-data" action="/submit"><input name="token" value="${url.searchParams.get("token") ?? ""}"><input id="file" type="file" name="upload"><button id="send" type="submit">send</button></form>`,
    );
  if (url.pathname === "/submit") {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    return request.on("end", () => html(`<p id="submitted">${body.length}</p>`));
  }
  if (url.pathname === "/download")
    return response
      .writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="report.bin"',
      })
      .end(Buffer.alloc(2048, 7));
  response.writeHead(404).end();
});
const other = createServer((_request, response) =>
  response
    .writeHead(200, { "content-type": "text/html" })
    .end(page("other", "<p id='other'>other</p>")),
);
const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "localhost", () => resolve(`http://localhost:${server.address().port}`)),
  );
```

Scenarios inside `runChecks(origins)` (each ends with `record(...)`), in order:

1. `no bridge`: `GuestView.make({ session, navigation: [\`${site}/*\`], automation: { evaluate: true } })`, attach to a hidden `BrowserWindow`at`{ x: 0, y: 0, width: 800, height: 600 }`, `navigate(site + "/")`, wait for `state.status === "ready"`, then `automation.evaluate("typeof window.sewed", Schema.String)`equals`"undefined"`.
2. `policy blocks and allows`: observe `guest.blocked` into an array; `evaluate("document.getElementById('cross').click()")` → wait for a `{ kind: "navigation" }` entry whose url starts with `other`; `evaluate` click `#same` → state ready at `/second`; `navigate(site + "/redirect")` → `{ kind: "redirect" }` entry; `navigate(other + "/")` fails with `Protocol` and adds a `navigation` entry.
3. `popup and webview denied`: click `#popup` → `{ kind: "popup" }`; navigate to `/webview` → `{ kind: "webview" }` (if Electron never emits `will-attach-webview` because `webviewTag` is false, assert instead that `evaluate("document.querySelector('webview').shadowRoot === null")` and record the fact as evidence; the spec's guarantee is that no webview attaches).
4. `body-aware intercept scoped by sourceId`: create a second guest `twin` on the same session; `Session.intercept(session, { filter: { urls: [\`${site}/submit*\`], types: ["mainFrame"], body: { maxBytes: 4096, blobs: "resolve" } }, request: (request) => Effect.succeed(request.sourceId === guest.id && !bodyText(request.body).includes("token=ok") ? { kind: "block" } : { kind: "allow" }) })`where`bodyText`joins bytes parts; navigate`guest`to`/form?token=bad`, click `#send`→ state failed with`ERR_BLOCKED_BY_CLIENT`; navigate `/form?token=ok`, click `#send`→ ready at`/submit`with`#submitted`; navigate `twin`to`/form?token=bad` and submit → allowed (not this guest's id).
5. `downloads denied then accepted`: `evaluate("location.href = '/download'")` on guest → `{ kind: "download" }` blocked entry; then `guest.downloads((offer) => Effect.succeed({ kind: "save", path: join(downloads, offer.filename) }))` consumed with `Stream.take(1)` in a forked fiber; trigger again → the fiber yields a `Download.Handle`; `awaitDone` is `{ kind: "completed" }`; the file has 2048 bytes.
6. `evaluate decodes and rejects`: `evaluate("({ n: 1 })", Schema.Struct({ n: Schema.Number }))` succeeds; with `Schema.String` fails `Protocol`.
7. `allowlisted CDP sets a file input`: guest declared with `devtools: ["DOM.getDocument", "DOM.querySelector", "DOM.setFileInputFiles"]`; navigate `/form`; `DOM.getDocument` → root nodeId; `DOM.querySelector` with selector `#file`; `DOM.setFileInputFiles` with a temp file; `evaluate("document.getElementById('file').files[0].name")` equals the file name; `devtools("Runtime.evaluate", ...)` fails `Protocol`.
8. `open DevTools makes attach fail with Limit`: on a fresh guest with a devtools allowlist, `webContents.openDevTools({ mode: "detach" })`, wait 300 ms, `devtools("DOM.getDocument")` fails `Limit`, `closeDevTools`.
9. `capture returns PNG bytes`: `webContents.capture({})` with up to 5 retries on `Native`; bytes start with `137 80 78 71`.
10. `closing the view detaches the debugger and ends every stream`: fork `blocked` and `webContents.state` consumers, `guest.close`, both fibers complete; `automation.devtools` afterwards fails `Closed`.
11. `closing the window closes an attached guest`: attach a new guest to a second window, `window.close`, `guest.awaitClosed` completes.

Use `waitUntil`/`observe` helpers from `native-views-fixture.mjs` (copy them; fixtures do not import each other). Evidence includes the blocked kinds in order, the download byte count, and the capture length.

- [x] **Step 4: Run under the harness until green**

```sh
cd ../sewed-playground && env -u FORCE_COLOR NO_COLOR=1 SEWED_XVFB=$PWD/.artifacts/ui-tools/xvfb.sh SEWED_WINDOW_MANAGER=$PWD/.artifacts/ui-tools/openbox.sh SEWED_XVFB_TIMEOUT=600 python3 scripts/with-xvfb.py dbus-run-session -- pnpm verify:guest
```

Expected: eleven `PASS` lines and `.artifacts/guest-verification.json`. Library defects found here are fixed in the library with a test in Task 10's suite where a Node test can express them, then repacked (`node scripts/release.mjs pack && pnpm install` in the playground).

- [x] **Step 5: Commit the library side if it changed; the playground has no repository**

```sh
pnpm format && git add -A packages/sewed && git commit -m "Harden GuestView against the playground fixture"
```

(Skip if nothing changed.)

---

### Task 12: Playground feature `/guest`

**Files:**

- Create: `../sewed-playground/src/main/guest.ts`
- Create: `../sewed-playground/src/renderer/features/guest/Guest.tsx`, `use-guest.ts`
- Create: `../sewed-playground/src/renderer/routes/guest.tsx`
- Create: `../sewed-playground/docs/features/guest.md`
- Modify: `../sewed-playground/src/shared/bindings.ts` (add `Tab`), `src/main/app.ts` (attach a guest to window `first` and bind `Tab`), `src/renderer/app/AppShell.tsx` (nav link `#nav-guest`), `scripts/feature-map.json` (feature `guest`), `scripts/verify.mjs` (scenario `guest-tab`), `scripts/feature-docs.test.mjs` (records 9 → 10), `FEATURES.md` (row)

**Interfaces:**

- Consumes: `GuestView.protocol`, `guest.host({ navigate: true, capture: true })`.

- [x] **Step 1: Main side**

`src/main/guest.ts` starts a `node:http` server on `localhost` serving `/` (a heading `Guest one` and a link to `/two`) and `/two` (`Guest two`), returns `{ origin }`. In `app.ts`, before the window loop:

```ts
const guestSite = yield * createGuestSite();
const guest = yield * GuestView.make({ navigation: [`${guestSite.origin}/*`] });
const tab = yield * guest.host({ navigate: true, capture: true });
yield * guest.navigate(`${guestSite.origin}/`);
```

Bind `Binding.to(Tab, tab)` on both windows (the slot list is shared) and, for `name === "first"`, `yield* window.attach(guest, { bounds: { x: 760, y: 720, width: 380, height: 180 } })`. The guest URL uses `localhost`, not `127.0.0.1`, so the development harness's target filter still sees exactly two renderer pages.

- [x] **Step 2: Renderer side**

`use-guest.ts`:

```ts
import { Cause } from "effect";
import { useAction, useClient, useStream } from "@sewed/react";
import { Tab } from "../../../shared/bindings.js";

const failure = (state: { readonly status: string; readonly cause?: Cause.Cause<unknown> }) =>
  state.status === "failure" && state.cause !== undefined ? Cause.pretty(state.cause) : null;

export function useGuest() {
  const tab = useClient(Tab);
  const state = useStream(() => tab.state(), [tab]);
  const history = useStream(() => tab.history(), [tab]);
  const navigate = useAction((url: string) => tab.navigate({ url }));
  const back = useAction(() => tab.back());
  const forward = useAction(() => tab.forward());
  const capture = useAction(() => tab.capture({}));
  return {
    state: state.status === "value" ? state.value : undefined,
    history: history.status === "value" ? history.value : undefined,
    navigate: navigate.run,
    back: back.run,
    forward: forward.run,
    capture: capture.run,
    captured: capture.status === "success" ? capture.value.byteLength : undefined,
    error:
      failure(state) ?? failure(navigate) ?? failure(back) ?? failure(forward) ?? failure(capture),
  };
}
```

`Guest.tsx` renders a `surface-card` with: `<output data-guest-state={state?.status} data-guest-url={state && "url" in state ? state.url : undefined}>`, an `<input data-guest-url-input>` bound to local state, buttons `[data-guest-go]`, `[data-guest-back]`, `[data-guest-forward]`, `[data-guest-capture]`, `<output data-guest-capture-bytes={captured}>`, and `<output data-guest-error>{error}</output>`. `routes/guest.tsx` mirrors `routes/surfaces.tsx` with `id="panel-guest"`. `AppShell.tsx` adds `<Link id="nav-guest" to="/guest" activeProps={{ "aria-current": "page" }}>Guest tab</Link>`.

- [x] **Step 3: Registry, record, and scenario**

`feature-map.json` gains:

```json
"guest": {
  "title": "A guest tab driven through a hosted owner",
  "runtime": "main",
  "route": "/guest",
  "navigation": "#nav-guest",
  "surface": "#panel-guest",
  "sources": ["src/main/app.ts", "src/main/guest.ts", "src/shared/bindings.ts", "src/renderer/features/guest/Guest.tsx", "src/renderer/features/guest/use-guest.ts", "src/renderer/routes/guest.tsx"],
  "controls": { "urlInput": "[data-guest-url-input]", "go": "[data-guest-go]", "back": "[data-guest-back]", "forward": "[data-guest-forward]", "capture": "[data-guest-capture]" },
  "observations": { "state": "[data-guest-state]", "captured": "[data-guest-capture-bytes]", "error": "[data-guest-error]" },
  "scenarios": [{ "id": "guest-tab", "description": "A renderer drives a main-owned guest view through GuestView.protocol within the host policy.", "checks": ["guest-ready", "guest-navigate", "guest-policy", "guest-capture"], "when": "always" }],
  "nativeChecks": ["verify:guest"],
  "featureDirectories": ["guest"]
}
```

`verify.mjs` scenario after the surfaces block: click `#nav-guest`; `until` state attribute is `ready` (`guest-ready`); set the URL input to the current url with `/two` appended (read `data-guest-url`), click go, `until` the url attribute ends with `/two` (`guest-navigate`); click back, `until` the url attribute ends with `/`; set the input to `https://example.com/`, click go, `until` the error output contains `Protocol` (`guest-policy`); click capture repeatedly until `data-guest-capture-bytes` is a number above 0, at most 5 tries with 300 ms between (`guest-capture`). `docs/features/guest.md` has the seven required sections and points `pnpm verify:features guest` and `pnpm verify:guest`. `FEATURES.md` gains `| Guest tab | \`/guest\` | [guest](docs/features/guest.md) |`. `feature-docs.test.mjs` expects 10 records.

- [x] **Step 4: Check and verify**

```sh
cd ../sewed-playground && pnpm build && pnpm check && env -u FORCE_COLOR NO_COLOR=1 SEWED_XVFB=$PWD/.artifacts/ui-tools/xvfb.sh SEWED_WINDOW_MANAGER=$PWD/.artifacts/ui-tools/openbox.sh SEWED_XVFB_TIMEOUT=600 python3 scripts/with-xvfb.py dbus-run-session -- pnpm verify
```

Expected: `pnpm check` passes (architecture, types, 44 architecture tests), and `verify` prints the four new PASS lines among the existing ones.

---

### Task 13: Documentation and acceptance

**Files:**

- Create: `docs/guest-views.md`
- Modify: `website/src/sidebar.ts` (Windows and documents: `{ label: "Guest views", slug: "guest-views" }` after Native views)
- Modify: `docs/api.md` (rows and a paragraph), `docs/electron-coverage.md` (catalog row, Wave 7 status, next step), `docs/session-extras.md` (interception section), `README.md` (two sentences), `docs/reference.md` (regenerated)

- [x] **Step 1: Write `docs/guest-views.md`**

Sections: intro (what a guest is and is not), "Create and attach" (the spec's usage), "Navigation policy" (patterns, `navigate`, `setNavigationPolicy`, `blocked`), "Downloads" (deny by default, the scoped decider, `Download.Handle`, and that the decider runs synchronously), "Automation" (declaration at creation, `evaluate`, `devtools` with the allowlist and the private debugger session, `input`, the `Limit` case when DevTools are open), "Hosting a tab" (`host(policy)` and the React example), "Interception with bodies" (pointer to session-extras), "Errors" (the spec's table), "Lifecycle".

- [x] **Step 2: Amend the other documents**

- `docs/api.md`: add `GuestView` to the `sewed` row (`GuestView` schemas and `protocol`) and `GuestView.make` to the `sewed/main` row; add a paragraph after the native views one: "`GuestView.make(options)` acquires a view for a page the application does not own: no preload, no bridge, a pattern navigation policy, denied popups and webviews, decider-gated downloads, and automation declared at creation. `guest.host(policy)` serves `GuestView.protocol` to bound renderers. See [guest views](guest-views.md)."
- `docs/electron-coverage.md`: catalog row `| WebContents hosting a page the application does not own: pattern navigation, downloads veto, executeJavaScript, debugger, sendInputEvent | GuestView | scoped resource, policy, observation stream, hosted owner | yes, navigate and capture gated | 7 |`; a "Wave 7 shipped on <date>" status paragraph naming the modules, the deviations, and `verify:guest`; the "Next implementation step" gains the guest view.
- `docs/session-extras.md`: replace "Request bodies are still not exposed." with a paragraph on `filter.body` (`maxBytes`, `blobs: "resolve" | "reference"`, the cap rule, file parts as metadata) and `sourceId` on every stage.
- `README.md`: "Owners and bindings" gains "a guest view's tab owner"; the "Status and limits" sentence becomes: "Sewed renderers never receive script injection; guest views expose fenced automation declared at creation. Request bodies reach interception only through an opt-in, byte-capped filter. A display media picker of the library's own, the `webview` tag, and raw IPC are excluded by design."
- `pnpm docs:reference` regenerates `docs/reference.md`.

- [x] **Step 3: Acceptance**

```sh
pnpm build && timeout 240 pnpm test && pnpm website:check && pnpm format:check
cd ../sewed-playground && env -u FORCE_COLOR NO_COLOR=1 SEWED_XVFB=$PWD/.artifacts/ui-tools/xvfb.sh SEWED_WINDOW_MANAGER=$PWD/.artifacts/ui-tools/openbox.sh SEWED_XVFB_TIMEOUT=3600 python3 scripts/with-xvfb.py dbus-run-session -- pnpm verify:all
```

Expected: every command exits 0; `verify:all` reports 32/32 (the previous 31 plus `verify:guest`).

- [x] **Step 4: Commit**

```sh
pnpm format && git add -A && git commit -m "Document guest views and record wave seven"
```

---

## Self-review

- Spec coverage: modules (Tasks 1, 2, 3, 4, 5, 10 plus the sibling deviations), data (2, 4), handle (10), flow (6, 8, 7, 9, 10), invariants (guest-types in 10), errors table (7, 8, 9, 10), lifecycle (10), verification items 1 through 5 (2, 10, 3 to 9, 11, 12), documentation (13), and the `focus` addition (1) are each covered.
- Placeholders: Task 1 and Task 10 elide code that is copied verbatim from named existing files; each elision names its source.
- Type consistency: `Control`, `Core`, `NavigationGuard` (Task 1) are used unchanged in Tasks 6, 7, 9, 10; `Entry` (Task 8) is made mutable in Task 10 and the Task 8 tests are written against the mutable shape; `HostCore` (Task 9) is satisfied by `Core` structurally.

## Outcome (recorded after execution)

- Every task above was executed and its checks passed; the commits are listed in the wave-seven status entry of `docs/electron-coverage.md`.
- The generic bridge anticipated in Task 7 was not needed: `AutomationOf<A>` picks the declared members from one typed `AutomationMembers<A>`, so the implementation object is assignable without a cast.
- Two core defects surfaced in the playground fixture and were fixed with tests: a state update published from a Chromium callback resumed the waiting fiber inside that callback, where `loadURL` deadlocks Electron, so `navigate` and `load` now start on a fresh task; and a blocked navigation's error page finished loading after the next navigation started, so `did-finish-load` now settles the ready state only after the current navigation commits.
- On Electron 44 an open DevTools front-end coexists with the guest's debugger session; the fixture proves coexistence, and the `Limit` mapping remains for Electron's "already attached" error.
- The playground's tab bar now wraps at narrow widths; the extra navigation link had introduced horizontal overflow in the responsiveness check.
