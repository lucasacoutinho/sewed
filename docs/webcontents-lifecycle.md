# Web contents lifecycle

## Problem

A native window, its current document, and its renderer process have different lifetimes. The bridge already disconnects document clients on navigation or process loss, but main-owned Effects cannot observe those changes through the public package. A crashed renderer also cannot run its own reload button.

`BrowserWindow.make` acquires the native window in a child scope. Its web contents owns the bridge and document loading. The window's controls are a capability a composition serves for that window. These ownership rules stay in place.

## Usage

```ts
const window = yield * BrowserWindow.make();
yield *
  window.webContents.state.pipe(
    Stream.runForEach((state) => publishWindowState(window.id, state)),
    Effect.forkScoped,
  );
yield * window.webContents.load(View, { bindings });

// An explicit main-owned recovery action, including from another bound renderer.
yield * window.webContents.reload;

// Native responsiveness is independent of document loading.
yield *
  window.webContents.responsiveness.pipe(
    Stream.runForEach((health) => publishRendererHealth(window.id, health)),
    Effect.forkScoped,
  );

// An explicit main-owned action can restart an unresponsive renderer.
yield * window.webContents.recover;
```

The stream starts with the current snapshot. Its states are `idle`, `loading`, `ready`, `failed`, and `gone`. Loading carries the navigation URL. Ready carries the document URL and the renderer's OS process ID. Failure carries the URL, native error code, and description. Process loss carries Electron's reason and exit code.

`responsiveness` starts at `unknown`. A completed load or native `responsive`
event reports `responsive` with the current process ID; Electron's `unresponsive`
event reports `unresponsive` with that ID. Navigation and process loss reset the
observation to `unknown`. This is a native observation, separate from document
state and application heartbeat streams. Closing the owner completes its
observers; cancelling an observer releases only that subscription.

Electron filters unresponsive events for visibility, renderer initialization,
and its hang-monitor policy. A missing event is not a responsiveness guarantee.
[Electron's event filtering](https://github.com/electron/electron/blob/v44.3.0/lib/browser/api/web-contents.ts#L801-L806)

`recover` requires `MainContext`. It requests `forcefullyCrashRenderer()`, waits
for native process termination, then reloads. If the process is already gone,
it reloads directly. Waiting avoids a reload being cancelled by the old process's
later crash, observed in the native Electron 44 fixture. It returns after
requesting the reload; use the document state stream to observe readiness or
failure. No automatic recovery occurs. Electron can share a renderer process
between WebContents, so restarting that process can also affect those other
documents. The native window/view and separately owned main resources keep their
lifetimes. [Electron's recovery contract](https://github.com/electron/electron/blob/v44.3.0/docs/api/web-contents.md#contentsforcefullycrashrenderer)

Interrupting recovery removes its listeners and cancels the pending reload;
it cannot undo a process termination already requested.

`terminate` requires `MainContext` and performs only the first half of
recovery: it requests `forcefullyCrashRenderer()` and waits for native process
termination, so the state stream ends at `gone` and nothing reloads. Use it when
something else decides whether and when to load again. `recover` is `terminate`
followed by `reload`.

Keeping responsiveness separate avoids multiplying document-state variants: a
renderer can become unresponsive during loading as well as after a successful
load. The external playground's `verify:responsiveness` fixture stalls an actual
renderer, observes its natural recovery, then verifies an explicit process
restart and owner cleanup.

## Shape

`WebContents.State` is a host-neutral Effect Schema exported by `sewed`. The existing `window.webContents` handle gains `state: Stream<WebContents.State, never, MainContext>`. Its `load` and `reload` operations keep their current signatures. A private native adapter owns the state, event listeners, load validation, and bridge configuration.

Native callbacks update one scoped state reference. Subscribers receive the current value and subsequent changes. Full document navigation enters loading; same-document navigation only updates a ready URL. Main-frame load failures and renderer loss are state values, so observers remain available for explicit recovery. Subframe failures cannot fail the top-level document. Completion follows native web contents destruction or closure of its owning scope. There is no promised terminal snapshot after destruction.

Ready means Electron finished loading the document, not that React mounted or Sewed completed its client handshake. Cancellation of an observer releases only its subscription. Closing a renderer document releases that document's RPC clients; its native window and separately scoped workers keep their existing owners.

Cancelling a navigation, for example with `window.stop()`, settles it as a failed load. A superseded navigation's cancellation must not fail the replacement. The adapter observes provisional failures as well as completed load failures, and settles cancellation when native loading stops. New navigations and successful completion clear the pending cancellation. If loading stops without a native success or error event, the snapshot reports `ERR_FAILED` (`-2`), as Electron's `loadURL` does.

## Synthesis decision

Use a state stream on the existing web contents handle. It hides native listener registration, main-frame filtering, current-value replay, and scope cleanup behind one observable capability. Loading and bridge configuration move together into the private adapter because they share the same native object and lifetime.

## Alternatives considered

- A public stream of raw Electron events would require every caller to reconstruct current state, distinguish frames, and handle event ordering. Late subscribers would also need a separate snapshot API.
- An automatic restart policy would hide process loss and choose recovery behavior for the application. The library instead exposes the condition and keeps reload explicit.

## Tradeoffs

This is a snapshot stream rather than an audit log of every Chromium event. A main-owned host can publish selected snapshots and recovery actions to another renderer using existing bindings; the library does not grant those capabilities automatically.

The adapter follows Electron's [web contents events](https://www.electronjs.org/docs/latest/api/web-contents#instance-events). Native process loss may affect multiple web contents if Electron shares their renderer process. The separate consumer verifies the process IDs before exercising one-window crash recovery.

## Presentation, output, and navigation

The handle also covers the document's presentation and output surfaces, all
requiring `MainContext` and failing with `Closed` once the web contents is
gone:

- `print(options)` sends the document to a printer and fails with `Native`
  carrying Electron's failure reason. `pdf(options)` renders it to PDF bytes and
  `capture(options)` to PNG bytes. Page sizes are named or explicit: microns for
  print, inches for PDF, with `Ledger` available to PDF only.
- `zoom` and `audio` are state streams that replay the current value and follow
  native changes; `setZoom(factor)` accepts 0.25 to 5 and `setAudioMuted`
  toggles playback. `userAgent` reads and `setUserAgent` replaces the document's
  user agent.
- `find(text, options)` acquires a search in the caller's scope and returns its
  `results` stream plus `next` and `stop`. One search is active per document: a
  new search ends the previous one's stream, and closing the scope clears the
  selection. `findNext` and `stopFind` on the handle act on the active search.
- `style(css, options)` inserts a style sheet for the lifetime of the caller's
  scope. A full navigation drops it earlier; the scope still releases cleanly.
- `console` is an observation stream of the page's console messages with
  `level`, `message`, `lineNumber`, and `sourceId`. Each observer owns its
  listener and a bounded queue, and the stream ends when the web contents
  closes. It stays main-only and is not part of `WindowControls.protocol`.
- `favicons` is a state stream of the page's favicon URLs. It replays the
  latest list, starts empty, follows `page-favicon-updated`, resets to an empty
  list when a new main-frame document starts loading, and ends when the web
  contents closes. It is main-only.
- `history` is a state stream of the navigation entries, active index, and
  direction flags. `back`, `forward`, and `go(index)` apply the navigation
  policy before Electron moves, because history navigations bypass
  `will-navigate`; an entry outside the bound document and policy fails with
  `Protocol`. `clearHistory` empties the list.

Zoom, audio, history, and find are also reachable through
`WindowControls.protocol`, so a bound renderer can drive its own window's find
bar or history buttons. A window without web contents answers those requests
with `Protocol`.

## Decidables on a web contents

Five of the catalog's events belong to a web contents, and each installs through this handle's own
`decide`: `Decidables.WebContents.Navigation` and `.Popup` decide where the page may go,
`.TitleUpdate` decides whether main accepts a title the page set, `.Unload` decides whether the
page's own unload prompt is honored, and `.Input` decides each keyboard and mouse event.
`.Download` is the sixth and has its own section below. A decidable names the owner that resolves
it, so these install on a web contents and nowhere else, and installing one elsewhere is a compile
error; [the decision model](native-policy.md) is the whole contract.

```ts
yield *
  window.webContents.decide(
    Decidables.WebContents.Navigation,
    Decision.policy(Navigation.Policy, [{ kind: "origin", origin: "https://example.com" }]),
  );
```

The explicitly loaded entry document and its same-document URLs stay allowed ahead of every decider,
so `load` and History moves inside that document need none. Every other main-frame destination and
every redirect is decided, and the fallback denies, so a destination nothing grants is blocked.
`Navigation.Policy` is a grant: it answers `"allow"` for what its rules match and passes on the
rest, which is what lets two features' policies compose as a union.

### Downloads

A renderer's web contents also has `downloads`, a plain stream of the downloads its document
started and `Decidables.WebContents.Download` accepted. Install a decider through this web contents'
own `decide` to answer each one as it is offered as a `Download.Offer`: `deny` cancels it, `save` writes it to an absolute
path, and `prompt` lets Electron show its save dialog, with `Dialog.SaveOptions` when given. Accepted
downloads arrive on the stream as `Download.Handle` values. This document's own registry prompts by
default rather than denying, so subscribing to `downloads` with no decider installed still surfaces
what Electron's own save dialog accepts; any number of deciders may be installed, composing
restrictively so `deny` beats `prompt` beats `save`, regardless of install order. As with guest
views, each decider runs synchronously inside Electron's callback, and one that throws, suspends, or
answers off-schema denies and logs why. That denial is the decidable's declared failure rather than
this document's `prompt` posture, so a broken decider denies here exactly as it does on a guest: the
posture says what nobody objecting means, not what a crash means. A denied download is reported on
`blocked`, the stream of what a [decision](native-policy.md) prevented.

Unlike every other decidable on this document, and unlike a guest view's own download posture,
installing a decider through `decide(Decidables.WebContents.Download, …)` does nothing on its own: the
native listener only engages while something is subscribed to `downloads`, so with no subscriber
Electron's own download behavior applies regardless of what any installed decider would have
answered, and a denial does not reach `blocked` either. Subscribe to `downloads` before relying on a
decider to govern a document's downloads. Any number of subscribers share that one listener: each
download is decided once and reported to `blocked` once, an accepted one reaches every subscriber as
the same handle — so a `pause` or `cancel` by one subscriber is the download's, and every subscriber
sees it on `progress` and `awaitDone` — and the listener leaves only with the last subscription. The
playground's
`verify:webcontents-extras` saves and denies real downloads, streams a page's
console warning, and observes a denied popup and navigation.
