# Web contents lifecycle

A window can stay open while its document reloads or its renderer process restarts. Use the web contents state stream to follow loading, failure, and process loss.

Main can reload or recover the renderer when your application chooses to. The separate responsiveness stream reports native health observations, while the window and independently owned workers keep their own lifetimes.

## Observe loading and renderer health

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

The stream starts with the current snapshot. Its states are `idle`, `loading`, `ready`, `failed`, and `gone`. Loading carries the navigation URL. Ready carries the document URL, the renderer's OS process ID, and the main frame's HTTP status (`httpStatus`). Failure carries the URL, native error code, and description. Process loss carries Electron's reason and exit code.

`httpStatus` is the status Electron's `did-navigate` reported for the committed main-frame navigation: 200 for an ordinary document, 500 for one that answered with a server error, and so on. A `data:` or `file:` document has no HTTP transaction, but Electron still reports a synthetic 200 for it, so `httpStatus` is always a number, never absent or null. Sewed does not turn a 5xx document into `failed` — the document did load, Electron just fired `did-finish-load` for it same as any other — so a 5xx `ready` state is exactly as `ready` as a 200 one. Deciding what a status means, such as treating 5xx as a failed load and reloading through an application's own breaker, is the consumer's call; the state stream just reports the number.

`responsiveness` starts at `unknown`. A completed load or native `responsive`
event reports `responsive` with the current process ID; Electron's `unresponsive`
event reports `unresponsive` with that ID. Navigation and process loss reset the
observation to `unknown`. This is a native observation, separate from document
state and application heartbeat streams. Closing the owner completes its
observers; cancelling an observer releases only that subscription.

Electron filters unresponsive events for visibility, renderer initialization,
and its hang-monitor policy. A missing event is not a responsiveness guarantee.
[Electron's event filtering](https://github.com/electron/electron/blob/main/lib/browser/api/web-contents.ts)

`recover` requires `MainContext`. It requests `forcefullyCrashRenderer()`, waits
for native process termination, then reloads. If the process is already gone,
it reloads directly. Waiting avoids a reload being cancelled by the old process's
later crash, observed in the native Electron 44 fixture. It returns after
requesting the reload; use the document state stream to observe readiness or
failure. No automatic recovery occurs. Electron can share a renderer process
between WebContents, so restarting that process can also affect those other
documents. The native window/view and separately owned main resources keep their
lifetimes. [Electron's recovery contract](https://github.com/electron/electron/blob/main/docs/api/web-contents.md#contentsforcefullycrashrenderer)

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

## API details

`WebContents.State` is a host-neutral Effect Schema exported by `sewed`. `window.webContents` exposes `state: Stream<WebContents.State, never, MainContext>`. A private native adapter owns the state, event listeners, load validation, and bridge configuration.

Native callbacks update one scoped state reference. Subscribers receive the current value and subsequent changes. Full document navigation enters loading; same-document navigation only updates a ready URL. Main-frame load failures and renderer loss are state values, so observers remain available for explicit recovery. Subframe failures cannot fail the top-level document. Completion follows native web contents destruction or closure of its owning scope. There is no promised terminal snapshot after destruction.

Ready means Electron finished loading the document, not that React mounted or Sewed completed its client handshake. Cancellation of an observer releases only its subscription. Closing a renderer document releases that document's RPC clients; its native window and separately scoped workers keep their existing owners.

Cancelling a navigation, for example with `window.stop()`, settles it as a failed load. A superseded navigation's cancellation must not fail the replacement. The adapter observes provisional failures as well as completed load failures, and settles cancellation when native loading stops. New navigations and successful completion clear the pending cancellation. If loading stops without a native success or error event, the snapshot reports `ERR_FAILED` (`-2`), as Electron's `loadURL` does.

## Tradeoffs

This is a snapshot stream rather than an audit log of every Chromium event. A main-owned host can publish selected snapshots and recovery actions to another renderer using existing bindings; the library does not grant those capabilities automatically.

The adapter follows Electron's [web contents events](https://www.electronjs.org/docs/latest/api/web-contents#instance-events). Native process loss may affect multiple web contents if Electron shares their renderer process. The separate consumer verifies the process IDs before exercising one-window crash recovery.

## Presentation, output, and navigation

The handle also covers the document's presentation and output surfaces, all
requiring `MainContext` and failing with `Closed` once the web contents is
gone:

- `print(options)` sends the document to a printer and fails with `Native`
  carrying Electron's failure reason. `pdf(options)` renders it to PDF bytes and
  `capture(options)` answers `{ bytes, width, height, scaleFactor }`: PNG bytes
  plus the image's own pixel size and the display's scale factor for the area
  captured, so a consumer never has to decode the PNG to place it. `width` and
  `height` are pixels, read from the native image itself; `scaleFactor` is that
  pixel width over the DIP width of the captured area — the given `rect`'s
  width when there is one, else the owner window's display scale, since
  nothing else reaches a bare web contents. Page sizes are named or explicit:
  microns for print, inches for PDF, with `Ledger` available to PDF only.
- `zoom` and `audio` are state streams that replay the current value and follow
  native changes; `setZoom(factor)` accepts 0.25 to 5 and `setAudioMuted`
  toggles playback. `userAgent` reads and `setUserAgent` replaces the document's
  user agent.
- `insertText(text)` types at the focused element. `savePage(path, type)`
  writes the current document to an absolute path as `HTMLOnly`,
  `HTMLComplete`, or one `MHTML` archive. `setBackgroundThrottling(flag)`
  decides whether timers and animations slow down while the page is hidden,
  and `setIgnoreMenuShortcuts(flag)` lets key presses reach the page without
  triggering menu accelerators.
- On a document the application owns, `reloadIgnoringCache` reloads and
  fetches every resource again, and `stopLoading` stops a load in progress.
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
- `title` is a state stream of the page's title, mirrored the same way:
  it replays the latest value, starts `""`, resets to `""` when a new
  main-frame document starts loading, and ends when the web contents closes.
  It follows `page-title-updated` whatever `.TitleUpdate` answers; the
  decision governs only the native effect, and only for a window's own
  contents. Electron holds a native title bar through the BROWSER WINDOW's
  own `page-title-updated`, not the contents' event of the same name, so
  that is the one a window's own listener acts on: `"keep"` (the
  decidable's own fallback) holds the title Electron already has, `"accept"`
  lets the page's own change through. A guest has no native title bar to
  hold, so the decision has no native effect there. The stream itself
  always moves to the page's own title regardless, with no decider needed
  to read it.
- `history` is a state stream of the navigation entries, active index, and
  direction flags. `back`, `forward`, and `go(index)` apply the navigation
  policy before Electron moves, because history navigations bypass
  `will-navigate`; a missing entry fails `Protocol` with `reason:
  "history/no-entry"`, and an entry outside the policy fails `Protocol` with
  `reason: "policy/denied"`. Past that check, the call waits for the move it
  started to settle — the same-document update or the `ready`/`failed` state
  the navigation reaches — and answers that `WebContents.Settled` value
  (`ready` or `failed`; never `idle`, `loading`, or `gone`), so a caller never
  reads stale history or a mid-flight state after the Effect completes.
  `go(index)` naming the entry already active answers that entry's own
  already-settled state at once, without calling into Electron: Electron
  itself emits nothing for a history move to its own current index, so
  waiting on one the way every other index does would never settle.
  `clearHistory` empties the list.

Zoom, audio, history, and find are also reachable through
`WindowControls.protocol`, so a bound renderer can drive its own window's find
bar or history buttons. A window without web contents answers those requests
with `Protocol`.

## Page events, DevTools, emulation, and editing

`webContents.events` is a stream of what the page does that main may want to react to, as
`WebContents.PageEvent` values distinguished by `kind`:

| `kind`             | Carries                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| `context-menu`     | the point, the link, image or selection under it, spelling suggestions, and `editFlags` |
| `cursor`           | the cursor `type` the page asks for                                                     |
| `target-url`       | the link under the pointer or focus; empty once it leaves one                           |
| `theme-color`      | the page's `theme-color`, or `null`                                                     |
| `html-full-screen` | whether an element entered or left fullscreen through the page's own API                |
| `dom-ready`        | nothing: the top-level document's DOM is ready                                          |
| `preload-error`    | the preload `path` and the error `message`                                              |
| `frame`            | a frame `created`, `navigated` or `loaded`, with its process and routing ids            |
| `devtools`         | DevTools `opened`, `closed` or `focused`                                                |

Each observer owns its native listeners, so a web contents nobody observes pays nothing. A context
menu is the application's to build: Electron shows none, and the usual answer is to pop up a
[menu](menus.md) from the event.

```ts
yield *
  window.webContents.events.pipe(
    Stream.filter((event) => event.kind === "context-menu"),
    Stream.runForEach((menu) => Effect.log("context menu", menu.linkUrl, menu.selectionText)),
    Effect.forkScoped,
  );
```

`webContents.activity` reads once whether the page is loading, waiting for a response, crashed,
being captured, and throttled in the background. `webContents.devTools` reads whether DevTools is
open and focused, and its title; `toggleDevTools`, `setDevToolsTitle`, `inspectElement(point)` and
`inspectWorker("service" | "shared")` drive it beside `openDevTools` and `closeDevTools`.

`enableDeviceEmulation(parameters)` emulates a device's screen as DevTools' device toolbar does,
over `WebContents.DeviceEmulation`, and `disableDeviceEmulation` ends it.
`setVisualZoomLimits({ minimum, maximum })` bounds pinch zoom, and
`setImageAnimationPolicy` sets whether images animate.

`edit(command)` runs an editing command in the focused frame, as a menu item would: `undo`, `redo`,
`cut`, `copy`, `paste`, `pasteAndMatchStyle`, `delete`, `selectAll`, `unselect`, `centerSelection`,
`scrollToTop` and `scrollToBottom`. `replace(text)` replaces the selection,
`replaceMisspelling(text)` applies a spelling suggestion, `adjustSelection({ start, end })` moves
the selection's ends, and `copyImageAt(point)` copies an image to the clipboard.
`takeHeapSnapshot(path)` writes a V8 heap snapshot of the page to an absolute path.

Zoom is controlled by factor alone (`zoom`, `setZoom`); Electron's zoom level and zoom mode are a
second unit and a per-origin toggle for the same setting and are not exposed.

## Decidables on a web contents

Five of the catalog's events belong to a web contents, and each installs through this handle's own
`decide`: `Decidables.WebContents.Navigation` and `.Popup` decide where the page may go,
`.TitleUpdate` decides whether main accepts a title the page set, `.Unload` decides whether the
page's own unload prompt is honored, and `.Input` decides each keyboard and mouse event.
`.BluetoothDevice` and `.Download` each have their own section below. A decidable names the owner that resolves
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

### Bluetooth devices

`Decidables.WebContents.BluetoothDevice` chooses the device a page's
`navigator.bluetooth.requestDevice` receives. A Bluetooth scan takes time, so the decider is asked
each time the scan reports the devices found so far, with `origin`, `document` and `devices`. It
answers `{ kind: "select", id }` with one of the reported `deviceId`s, `{ kind: "cancel" }` to end
the request, or `{ kind: "wait" }` to keep scanning. A newer report interrupts a decider that is
still deciding on the older list and asks again, so a decider only answers for the list it was
shown; one that waits on a person should treat interruption as "the list changed". An id the report
did not offer cancels, and so does a failing decider. With no decider installed there is no native
listener and Electron cancels the request.

```ts
yield *
  window.webContents.decide(
    Decidables.WebContents.BluetoothDevice,
    Decision.async((request) => {
      const sensor = request.devices.find((device) => device.deviceName.startsWith("Sensor"));
      return Effect.succeed(
        sensor === undefined
          ? { kind: "wait" as const }
          : { kind: "select" as const, id: sensor.deviceId },
      );
    }),
  );
```

### Downloads

A renderer's web contents also has `downloads`, a plain stream of the downloads its document
started and `Decidables.WebContents.Download` accepted. Install a decider through this web contents'
own `decide` to answer each one as it is offered as a `Download.Offer`, which carries the URL, filename, MIME type, size, the `urlChain` of redirects that led there, whether a `userGesture` started it, and the response's `contentDisposition`: `deny` cancels it, `save` writes it to an absolute
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

Unlike the other decisions on this document, the download listener is active while either a decider
or a `downloads` subscriber exists. A decider therefore continues to govern when nobody subscribes:
denials are still published on `blocked`, while accepted downloads proceed with their `save` or
`prompt` answer. Sewed adopts an accepted item as a `Download.Handle` only when a subscriber can
receive it. With no decider and no subscriber, Electron's own download behavior applies. Any number
of subscribers share the same listener and decision: an accepted download reaches every live
subscriber as the same handle — so a `pause` or `cancel` by one subscriber is the download's, and
every subscriber sees it on `progress` and `awaitDone`. The listener leaves only after the last
decider and last subscriber are gone. The playground's
`verify:webcontents-extras` saves and denies real downloads, streams a page's
console warning, and observes a denied popup and navigation.
