# Guest view surface

Design record for a Sewed surface that hosts a web page the application does not own. Approved on 2026-09-13; implementation follows the "Next implementation step" section.

## Problem

Every WebContents Sewed creates today is one of the application's own renderers. `BrowserWindow.make` and `WebContentsView.make` hard-code the Sewed preload, deny `window.open`, and allow main-frame navigation only to the loaded document plus an exact origin or document allowlist. That posture is right for a renderer that carries bindings. It is wrong for a page the application merely hosts: a job posting, a third-party login, a document viewer. Such a page must receive no bridge at all, must browse freely within a pattern the application chose, and must be driven from main with typed, fenced automation. Consumers that need this today, such as the Jobwright managed browser, cannot use Sewed views at all: a raw `WebContentsView` cannot attach to a Sewed window, `Session.intercept` cannot see the request bodies their submission gate verifies, and the library offers no script evaluation or DevTools protocol access.

Constraints the design honors: the root-plus-internal module convention and the eight shapes in `electron-coverage.md`; the five `SewedError` codes; policies as data, deny by default; the private view attachment registry in `internal/View.ts`; the one-native-listener-per-stage registry in `internal/WebRequest.ts`; `Download.Handle` and its state schemas; and the pinned Effect and Electron versions, which do not change.

Two sentences in the current documentation change meaning. The README's "script injection into renderers ... excluded by design" becomes "Sewed renderers never receive script injection; guest views expose fenced automation declared at creation". `session-extras.md` drops "request bodies are still not exposed".

## Usage (caller's view)

Main creates a guest view with its trust posture as data, attaches it like any view, and drives it directly. Nothing about it reaches a renderer unless main hosts a policy-limited owner.

```ts
import { Effect, Stream } from "effect";
import { BrowserWindow, GuestView, Session } from "sewed/main";

const tab = Effect.gen(function* () {
  const session = yield* Session.fromPartition({ kind: "persistent", name: "jaspace" });
  const window = yield* BrowserWindow.make({ title: "Jobwright" });

  const guest = yield* GuestView.make({
    session,
    navigation: ["http://*/*", "https://*/*"],
    webRtc: "disableNonProxiedUdp",
    automation: {
      evaluate: true,
      devtools: ["Runtime.evaluate", "Runtime.callFunctionOn", "Runtime.releaseObject"],
    },
  });
  yield* window.attach(guest, { bounds: { x: 320, y: 0, width: 960, height: 900 } });

  yield* guest.navigate("https://jobs.example.com/apply/123");
  yield* guest.webContents.state.pipe(
    Stream.filter((state) => state.status === "ready"),
    Stream.take(1),
    Stream.runDrain,
  );

  const snapshot = yield* guest.automation.evaluate(readPageScript, PageSnapshot);
  const png = yield* guest.webContents.capture({});
});
```

Body-aware interception is a session concern. It lands on `Session.intercept` as an opt-in filter field, and each request names the Sewed handle whose contents issued it, so a decider can scope to one tab:

```ts
yield *
  Session.intercept(session, {
    filter: {
      urls: ["https://jobs.example.com/apply/*"],
      types: ["mainFrame", "xhr"],
      body: { maxBytes: 4_000_000, blobs: "resolve" },
    },
    request: (request) =>
      request.sourceId === guest.id && request.method === "POST"
        ? Effect.map(grant.matches(request.body), (ok) =>
            ok ? { kind: "allow" } : { kind: "block" },
          )
        : Effect.succeed({ kind: "allow" }),
  });
```

Downloads a guest page starts are denied unless main installs a decider. Accepted items come back as the existing `Download.Handle`:

```ts
yield *
  guest
    .downloads((offer) => Effect.succeed({ kind: "save", path: join(root, offer.filename) }))
    .pipe(
      Stream.runForEach((download) => download.awaitDone),
      Effect.forkScoped,
    );
```

A renderer that shows a tab bar binds a hosted owner, exactly like `window.controls`:

```ts
// shared/bindings.ts
export const Tab = Binding.slot("tab", GuestView.protocol);

// main/app.ts
yield *
  window.webContents.load(Renderer.entry(url, { bindings }), {
    bindings: [Binding.to(Tab, yield * guest.host({ navigate: true, capture: false }))],
  });

// renderer
const tab = useClient(Tab);
const state = useStream(() => tab.state(), [tab]);
const go = useAction((url: string) => tab.navigate({ url }));
```

## Shape

### Modules

| File                               | Owns                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/GuestView.ts`                 | Root schemas and `protocol`. No Electron import. Exported from `sewed` as the `GuestView` namespace.                                                                                                                            |
| `src/internal/GuestView.ts`        | `make`, the handle, the pattern navigation guard, the downloads decider, the automation group, `host`. Registers with the view registry and the contents registry. Exported from `sewed/main` as `GuestView`.                   |
| `src/internal/WebContentsCore.ts`  | Extracted from `internal/WebContents.ts`: state and responsiveness streams, capture, pdf, print, find, style, zoom, history, focus, recover. Takes a navigation guard as a parameter. Shared by renderer views and guest views. |
| `src/internal/WebContents.ts`      | Keeps the renderer-specific half: the main bridge, `load(entry)`, reload, `setNavigationPolicy` over `UrlRule`.                                                                                                                 |
| `src/internal/ContentsRegistry.ts` | A private map from native WebContents id to Sewed handle id. `BrowserWindow`, `WebContentsView`, and `GuestView` constructors register and unregister. Interception reads it to fill `sourceId`.                                |
| `src/WebRequest.ts`                | `Filter.body`, `Body`, `UploadPart`, and `sourceId` on every request stage.                                                                                                                                                     |
| `src/internal/WebRequest.ts`       | Assembles bodies within the cap, resolves blobs when asked, fills `sourceId`.                                                                                                                                                   |
| `src/internal/Download.ts`         | Gains a constructor that wraps an already-started native download item, so a guest's accepted downloads reuse the handle.                                                                                                       |
| `src/main.ts`, `src/index.ts`      | Export `GuestView`.                                                                                                                                                                                                             |

### Data

Root schemas, in `src/GuestView.ts`:

```ts
export const NavigationPolicy = Schema.Array(WebRequest.Pattern); // Chromium match patterns; [] loads nothing
export const WebRtcPolicy = Schema.Literals([
  "default",
  "publicInterfaceOnly",
  "disableNonProxiedUdp",
]);
export const DevToolsMethod = Schema.String.check(Schema.makeFilter(isDomainDotMethod)); // "Runtime.evaluate"
export const Automation = Schema.Struct({
  evaluate: Schema.optionalKey(Schema.Literal(true)),
  devtools: Schema.optionalKey(Schema.NonEmptyArray(DevToolsMethod)),
  input: Schema.optionalKey(Schema.Literal(true)),
});
export const Settings = Schema.Struct({
  navigation: NavigationPolicy,
  webRtc: Schema.optionalKey(WebRtcPolicy),
  backgroundThrottling: Schema.optionalKey(Schema.Boolean),
  automation: Schema.optionalKey(Automation),
});
export interface Options<A extends Automation> extends Omit<typeof Settings.Type, "automation"> {
  readonly session?: Session.Handle;
  readonly automation?: A;
}

export const Blocked = Schema.Struct({
  kind: Schema.Literals(["navigation", "redirect", "popup", "webview", "download"]),
  url: Schema.String,
});
export const DownloadOffer = Schema.Struct({
  url: Schema.String,
  filename: Schema.String,
  mimeType: Schema.String,
  totalBytes: Schema.Number,
  sourceId: Schema.String,
});
export const DownloadDecision = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({ kind: Schema.Literal("save"), path: Schema.String }),
]);
export const EvaluateOptions = Schema.Struct({ userGesture: Schema.optionalKey(Schema.Boolean) });
export const InputEvent = Schema.Union([MouseInput, MouseWheelInput, KeyboardInput]); // data mirrors of Electron's input structures
export const HostPolicy = Schema.Struct({ navigate: Schema.Boolean, capture: Schema.Boolean });

export const protocol = RpcGroup.make(
  Rpc.make("state", { success: WebContents.State, stream: true, error: SewedError }),
  Rpc.make("focus", { error: SewedError }),
  Rpc.make("navigate", { payload: { url: Schema.String }, error: SewedError }),
  Rpc.make("capture", {
    payload: WebContents.CaptureOptions,
    success: Binary.Bytes,
    error: SewedError,
  }),
  // zoom, find, and history entries declared exactly as WindowControls.protocol declares them
);
```

Interception additions, in `src/WebRequest.ts`:

```ts
export const UploadPart = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("bytes"), bytes: Binary.Bytes }),
  Schema.Struct({
    kind: Schema.Literal("file"),
    path: Schema.String,
    offset: Schema.Number,
    length: Schema.Number,
    modificationTime: Schema.optionalKey(Schema.Number),
  }),
  Schema.Struct({ kind: Schema.Literal("blob"), id: Schema.String }),
]);
export const Body = Schema.Struct({
  parts: Schema.Array(UploadPart),
  bytes: Schema.Number,
  truncated: Schema.Boolean,
});
export const BodyFilter = Schema.Struct({
  maxBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  blobs: Schema.Literals(["resolve", "reference"]),
});
// Filter gains `body: Schema.optionalKey(BodyFilter)`.
// Every request stage gains `sourceId: Schema.optionalKey(Schema.String)`.
// The `request` stage gains `body: Schema.optionalKey(Body)`, present when the filter asked for it.
```

Body semantics: bytes are counted across `bytes` parts and, in `resolve` mode, across blob parts read through the session. Once the count exceeds `maxBytes`, the remaining parts are dropped and `truncated` is true. In `reference` mode a blob part carries its id and counts zero bytes. File parts are always metadata; the library never reads a file the user chose. A request that carries no upload data gets an empty body when the filter asked for one.

### Handle

```ts
export interface Handle<A extends Automation = {}> extends Attachable {
  readonly id: string;
  readonly webContents: Core; // state, responsiveness, capture, pdf, print, find, style, zoom, history, recover, focus
  readonly navigate: (url: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly setNavigationPolicy: (
    policy: NavigationPolicy,
  ) => Effect.Effect<void, SewedError, MainContext>;
  readonly blocked: Stream.Stream<Blocked, SewedError, MainContext>; // observation stream
  readonly downloads: <R>(
    decide: (offer: DownloadOffer) => Effect.Effect<DownloadDecision, SewedError, R>,
  ) => Stream.Stream<Download.Handle, SewedError, MainContext | R>; // scoped install; without it every download is denied
  readonly automation: AutomationOf<A>;
  readonly host: (
    policy: HostPolicy,
  ) => Effect.Effect<Binding.Owner<typeof protocol>, SewedError, MainContext | Scope.Scope>;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}

type AutomationOf<A> = (A extends { evaluate: true }
  ? {
      readonly evaluate: <T, I>(
        script: string,
        result: Schema.Codec<T, I>,
        options?: EvaluateOptions,
      ) => Effect.Effect<T, SewedError, MainContext>;
    }
  : {}) &
  (A extends { devtools: readonly string[] }
    ? {
        readonly devtools: <T, I>(
          method: A["devtools"][number],
          params: Schema.Json | undefined,
          result: Schema.Codec<T, I>,
        ) => Effect.Effect<T, SewedError, MainContext>;
      }
    : {}) &
  (A extends { input: true }
    ? { readonly input: (event: InputEvent) => Effect.Effect<void, SewedError, MainContext> }
    : {});

export const make: <const A extends Automation>(
  options: Options<A>,
) => Effect.Effect<Handle<A>, SewedError, MainContext | Scope.Scope>;
```

### Flow

Creation decodes `Settings`, compiles the navigation patterns, and constructs the native `WebContentsView` with `contextIsolation`, `sandbox`, `webSecurity`, no `preload`, no `nodeIntegration`, no `webviewTag`, the selected session, and the WebRTC and throttling options. It forks a lifetime scope from the caller's scope, registers the handle in the view registry and its contents id in the contents registry, and installs the guard.

The guard denies `window.open` and `will-attach-webview` unconditionally. On main-frame `will-navigate` and `will-redirect` it allows the destination when any compiled pattern matches and otherwise prevents the event and offers a `Blocked` value. `navigate(url)` checks the same policy before `loadURL`, so main has one rule set and no implicit exception. `setNavigationPolicy` validates, compiles, and replaces the patterns atomically. History navigation applies the policy before Electron moves, through the shared core.

Downloads use one `will-download` listener per native session, shared through a registry like interception, dispatched by the item's contents id. A guest with no installed decider prevents the event and offers `Blocked`. With a decider, the decision runs with the installing Effect's services; `deny` prevents the event, `save` sets the path and wraps the item in a `Download.Handle` offered to the stream. Installing a decider is scoped; removal returns the view to deny.

Automation checks the declaration before every operation. `evaluate` runs `executeJavaScript` with the caller's gesture flag and decodes the result with the caller's schema. `devtools` owns one private debugger session per view, attached with protocol version 1.3 on the first command and detached when the view's lifetime closes; the method must be in the declared allowlist. Debugger events are not exposed in this wave. `input` decodes the event and calls `sendInputEvent`.

`host(policy)` builds an owner over `protocol` with `host` from `Host.ts`. State, focus, zoom, find, and history are always served. `navigate` and `capture` are served only when the policy grants them. Automation, `downloads`, and `setNavigationPolicy` are not on the protocol.

### Invariants encoded in types and where validation lives

- Trust is a type: a guest handle has no `load`, no bindings, and no bridge; a renderer handle has no `navigate` and no automation. The compiler separates them the way it separates `MainContext` from `RendererContext`.
- Automation is declared at creation and narrows the handle type; an undeclared operation does not exist on the type, and a dynamically built declaration still fails with `Protocol` at runtime.
- Every input is a root schema decoded before Electron sees it; every output is copied into a schema type. Native input events, download items, and debugger results never cross into contracts.
- Policies are data, deny by default: navigation patterns, the CDP method allowlist, the host policy, the body filter.
- Lifetimes are scopes: the debugger session, the downloads decider, and the attachment end with their scopes, and a guest is never recreated.

### What the surface hides

The absence of a preload as a construction invariant; the one-listener-per-session dispatch for downloads and requests; debugger attach, conflict handling, and release; schema decoding at both automation boundaries; pattern compilation; and body assembly with blob resolution and truncation. What stays with the caller is the script text and the CDP method names, which are the application's own automation vocabulary.

### What the surface deliberately does not do

No bridge or preload of any kind in a guest. No `window.open` or `<webview>` ever. No automation or navigation policy change on the hosted protocol. No debugger events. No per-view permission grants beyond the session policy. No file reads for upload parts.

## Synthesis decision

Three whole-shape candidates were compared on 2026-09-13. The chosen shape is a distinct `GuestView` kind. It was adapted from the existing `WebContentsView` for creation, attachment, and cleanup, and from `Session.intercept` for the registry-and-dispatch pattern that downloads reuse. The body-aware interception was moved from the view to the session because Electron's `webRequest` is per session, and `sourceId` gives back the per-view scoping the view-level design wanted.

## Tradeoffs accepted

- We accept a second handle type and a refactor of `internal/WebContents.ts` into a shared core in exchange for trust being a compile-time distinction rather than a runtime flag.
- We accept exposing request bodies to session deciders, capped and opt-in, in exchange for a submission gate that can verify what a page actually sent.
- We accept script evaluation and a CDP allowlist as library operations in exchange for one fenced, typed, scoped place for them, instead of an escape hatch that discards every guarantee.
- We accept that a guest's navigation policy is patterns rather than exact origins in exchange for a page that can browse; the pattern syntax already exists in `WebRequest`.
- We accept the `Limit` code when another client holds the debugger, which reads as "an exclusive native resource is busy", consistent with dialogs and popups.
- We accept that `blocked` reports only the target URL; the initiating frame is not needed by the known consumer.

## Alternatives considered

- **A `guest` flag on `WebContentsView.make`.** One handle type whose `load` accepts a bare URL and rejects bindings at runtime when the flag is set. Fewer files, but half the operations become invalid depending on a flag, and the preload decision would be a runtime branch in a security-critical constructor. Lost on illegal states being representable.
- **A `GuestSession` kind.** The untrusted posture on the session; views stay `WebContentsView`. Interception and downloads fit there, but navigation policy and automation are per WebContents in Electron and per tab in the known consumer, so they would still need a per-view home, and a view's trust would depend on which session was passed rather than on its own type. Lost on placement.
- **Automation in a separate `@sewed/automation` package.** Keeps the core README's exclusion literally true, at the cost of a private seam into the view handle and a second package to version. Rejected because the seam would be the escape hatch the core refuses to add.

## Errors

| Situation                                                                                                                                                                                                                 | Code       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Invalid options, policy, event, or body filter; CDP method outside the allowlist; undeclared automation; `navigate` outside policy; decode failure of an evaluate or CDP result; host operation the policy does not grant | `Protocol` |
| Page threw during evaluate; load failed; `sendCommand` or `sendInputEvent` failed; a download item failed to start                                                                                                        | `Native`   |
| Debugger already held by another client; observer queue overflow on `blocked` or `downloads`                                                                                                                              | `Limit`    |
| Contents destroyed; view, attachment, or debugger session closed                                                                                                                                                          | `Closed`   |

The native cause is retained on every `Native` and `Limit` failure. A blocked navigation, redirect, popup, webview, or download is not an error in main; it is an observation on `blocked`.

## Lifecycle

`make` forks a lifetime scope from the caller's, creates the native view, registers it, and installs the guard. Finalizers run in reverse order: unregister from both registries, deny pending downloads, detach the debugger, close the contents, resolve `awaitClosed`. `close` and attachment semantics are identical to `WebContentsView`: one active attachment, `Protocol` on a second attach, detachment on scope end, closure on window close. A `downloads` decider lives for the installing scope. `setNavigationPolicy` on a closed view fails with `Closed`. Every stream ends when the view closes.

## Verification

Following the definition of done in `electron-coverage.md`:

1. Root contract test: importing `GuestView` from `sewed` creates no native object and imports no Electron module.
2. Compile-time contract file `packages/sewed/test/guest-types.ts`: a handle declared with `evaluate` has no `devtools` member; an undeclared method name on `devtools` is a type error; `load` does not exist on a guest handle; `navigate` does not exist on a renderer handle.
3. In-process tests with `Testing.main`: navigation pattern decisions; body assembly with truncation in both blob modes; automation gating and result decoding over a structural fake contents; host policy gating through `Testing.host`.
4. Playground `verify:guest` under the Xvfb harness against a local fixture site with a cross-origin link, a redirect, `window.open`, a `<webview>`, a multipart form, a download link, and a file input. Scenarios: `typeof window.sewed` is `undefined` in the page; policy blocks and allows navigation and redirects and `blocked` reports each; popup and webview denied; body-aware intercept blocks a mismatched submission and allows the matching one, scoped by `sourceId` across two guests; downloads denied by default, then accepted through a decider and completed through `Download.Handle`; evaluate decodes a value and fails `Protocol` on a schema mismatch; an allowlisted CDP call sets a file input and a non-allowlisted method fails `Protocol`; open DevTools makes attach fail with `Limit`; capture returns PNG bytes; closing the view detaches the debugger and ends every stream; closing the window closes an attached guest.
5. A playground feature record `docs/features/guest.md` and a `/guest` route with a hosted-owner toolbar, so the protocol is proven from React.

`pnpm build`, `timeout 240 pnpm test`, `pnpm website:check`, and the playground's `verify:all` must pass before the wave is reported complete.

## Documentation

New `docs/guest-views.md`, listed in `website/src/sidebar.ts`. A paragraph in `docs/api.md`. A catalog row and a "Wave 7" status entry in `docs/electron-coverage.md`. The README line under "How it fits together" and the rewritten exclusion sentence under "Status and limits". The `session-extras.md` interception section for `body` and `sourceId`. The regenerated `docs/reference.md`.

## Consumer mapping

For the Jobwright managed browser, the known first consumer:

- View creation, attach, bounds, visibility, and capture map one to one onto `GuestView.make`, `window.attach`, and `webContents.capture`.
- The four `executeJavaScript` sites become `automation.evaluate` with their existing result schemas, so decoding moves to the boundary.
- The upload path becomes three allowlisted CDP calls with no attach bookkeeping.
- The six `webRequest` hooks, the permission handlers, and the download veto become `Session.intercept` with a body filter, `Session.requests`, an empty `Session.setPermissions`, and the default download denial.
- The local CONNECT proxy stays a Node server selected through `Session.setProxy`.
- The typed command model, observation shapes, multipart parsing, and protected inspection stay the consumer's.

## Open questions and risks

- Electron's `executeJavaScript` rejects when the page navigates mid-call; the core must map that to `Native` rather than `Closed` unless the contents are destroyed. Does the playground fixture need a scenario for it?
- Blob resolution in `resolve` mode awaits `session.getBlobData` inside `onBeforeRequest`; Electron holds the request until the callback runs. Is a decider timeout wanted, or is the byte cap enough?
- The core split touches the window handle every fixture exercises. The harness must be green before and after the split, as the wave 2 risk note in `electron-coverage.md` already records.
- macOS and Windows behavior of guest views is typed and gated but, like the rest of the library, verified on Linux only.

## Next implementation step

Split `internal/WebContents.ts` into `WebContentsCore.ts` and the renderer half with no behavior change, and run the playground's `verify:webcontents`, `verify:webcontents-extras`, `verify:windows`, and `verify:native-views` green before adding `GuestView`.
