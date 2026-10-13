# Window visibility and focus

Show a window, hide it for later, or request focus through the window handle. Hiding preserves its document and bindings; closing the native window ends its scope.

To offer these controls to a renderer, serve `WindowControls.capability` for the window main selects. Its state stream keeps the renderer informed about native visibility and focus.

## Show and focus a window

```ts
const window = yield * BrowserWindow.make({ show: false });
const controls =
  yield *
  Capability.serve(WindowControls.capability).pipe(Effect.provide(WindowControls.native(window)));
yield * window.webContents.load(View, { bindings: [Binding.to(Controls, controls)] });
yield * window.show;

// Main can reveal a background window without requesting activation.
yield * window.showInactive;

// A document operates on the exact window selected by Binding.to.
const client = yield * Controls();
yield * client.hide();
yield * client.show();
```

An activation handler can call an existing owner's `show` or `focus` Effect. If that owner has closed, the application must explicitly acquire a new one. Hiding a window does not emit native window closure or trigger the last-window-closed quit policy.

## The capability

`WindowControls.capability` is the contract, and `sewed/main` exports `WindowControls` beside the window modules. Unlike an ambient surface, this one belongs to an owner, so its Layer threads that owner rather than an options bag: `WindowControls.native(window)` closes over an acquired window handle and resolves that window's page while the Layer builds. `Capability.serve` still takes one argument.

Acquire the window, serve its controls and load its renderer inside one `Effect.scoped` program, then wait for `window.awaitClosed` before that program returns. Returning just after `load` would close the window too soon. The [multi-window composition example](binding-composition.md#share-a-worker-without-sharing-window-lifetimes) shows the complete resource program.

The served owner lives for the scope `serve` runs in, not automatically for the native window's lifetime. Serving controls in the application scope keeps their owner connected after the native window closes; those calls fail `Closed` from the handler instead of because the connection dropped. Ending the per-window program after `awaitClosed` releases the controls owner while leaving application-owned services available to other windows.

One capability is one key. Two windows served separately are two owners under `sewed/binding/window-controls`, which is all a renderer entry needs, because `Binding.to` applies per entry. A single binding list that carries two windows at once needs an explicit `Binding.slot(name, WindowControls.protocol)` for each. `Binding.to` compares protocol identity rather than slot identity, so a served owner binds to any slot over its protocol; the capability's own slot serves the single-window case.

`find` is a search with a scope, and an operation cannot expose a scoped resource, so the capability's `find` is a stream that absorbs its own scope: the search ends when the stream ends. A window with no web contents fails `find`, `zoom`, `audio`, and `history` on the stream the caller subscribed to, with code `Protocol`.

For a Node test, supply a structural window to `WindowControls.native`. This layer imports no Electron; the native window is supplied by the caller.

## API details

The window handle exposes four `Effect<void, SewedError, MainContext>` values: `show`, `showInactive`, `hide`, and `focus`. `WindowControls.protocol` exposes the corresponding zero-argument RPC methods. A binding client keeps its normal `ClientContext` and `Scope` requirements, and a capability's own operations carry neither. Receiving the controls binding does not provide `MainContext` in either form.

`WindowControls.State` includes a required `visible: boolean`, read from Electron's `isVisible()`. `window.state` and the protocol's `changes()` both replay the current snapshot and observe subsequent native changes. `window.current` and the protocol's `state()` read the current native flags once, and fail with `Closed` after the window closes. Visibility is separate from focus, minimization, document readiness, and the renderer's Page Visibility API.

State snapshots are queried and published only while the state stream has subscribers. Every subscription refreshes its replay from native state, including after mutations made while nobody was observing. Native events in one turn share a deferred refresh after their mutations finish; an observed setting publishes synchronously and cancels a redundant pending refresh. Releasing the final subscriber or closing the window cancels deferred work. One-shot `current` and `state()` reads remain fresh without a subscription.

`show` reveals the window and requests focus. `showInactive` reveals it without requesting focus. `hide` hides it. `focus` requests focus. Completing an operation acknowledges its native invocation; consumers observe the state stream for resulting platform state. The adapter adds no optimistic state update or document reload. Calls on a closed native handle fail with `SewedError` code `Closed`; native invocation failures use code `Native`. Bound calls also retain Effect RPC transport failures when their owner disconnects.

Native handle commands and settings share fixed error adapters, not operation results. Validation, the main-runtime requirement and closed-window checks still apply when an Effect executes again. Settings validate first, so invalid values fail `Protocol` even after the window closes. Local `SewedError` instances pass through unchanged; other native exceptions retain their cause with code `Native`.

## Platform and verification

Electron documents [`showInactive` as unsupported on Wayland](https://www.electronjs.org/docs/latest/api/browser-window#winshowinactive). The desktop environment can also decline or redirect a [`focus` request](https://www.electronjs.org/docs/latest/api/browser-window#winfocus). Sewed preserves those platform rules.

The separate consumer verifies native visibility, focus requests, state replay, explicit bindings to distinct owners, and cleanup. Its window-control fixture uses Electron's X11 backend for `showInactive`. Focus checks invoke the real native method and compare the stream with Electron's state, including when the desktop declines or revokes focus. Other window managers and macOS/Windows need their own platform runs.

`title` in `WindowControls.State` is the native window title, and Electron only lets a program hold it through the BROWSER WINDOW's own `page-title-updated` event. For one title change Electron emits the window's event first, with its own event object, and then the contents' event of the same name. `preventDefault` on the window's event keeps the title Electron already has. `preventDefault` on the contents' event does not, even from a listener prepended ahead of every other. `Decidables.WebContents.TitleUpdate` is asked once per change: for a window's own contents the window's listener asks, and `"keep"` (the fallback) holds the title while `"accept"` lets the page's title through as `setTitle` would; for a guest, which has no window of its own, the contents' event asks. Probed directly: a `setTitle("Fixed")` window loading a titled page keeps `"Fixed"` when the window-level event is prevented, and shows the page's title when only the contents' event is prevented, whether that listener was added with `on` or `prependListener`.

## Appearance, relationships, and taskbar

`WindowControls.State` also carries `title`, `alwaysOnTop`, `opacity`, the
`resizable`, `movable`, `minimizable`, `maximizable`, `closable`, and
`fullScreenable` flags, `menuBarVisible`, `kiosk`, and `simpleFullScreen` —
Electron's pre-Lion fullscreen, mirroring `fullScreen`'s own command and state
field; see [window geometry and fullscreen](window-geometry.md). The window handle exposes
the matching commands, each publishing the new snapshot to active observers after Electron
applies it: `setTitle`, `setAlwaysOnTop(flag, level)`, `setOpacity`, the
flag setters, `setMenuBarVisibility`, `setKiosk`, `setSkipTaskbar`,
`setContentProtection`, `flash`, `setWindowButtonVisibility(visible)`,
`setProgress(progress, mode)`,
`setOverlayIcon(source, description)`, `setIcon(source)`, and
`setParent(handle)`. `setIcon` and `setOverlayIcon` take `Image.Source` (a
path or already-encoded bytes) that must decode to an image; a parent
must be another Sewed window, resolved through a private registry so no native
object crosses the boundary. `setTitle`, `setAlwaysOnTop`, `setOpacity`,
`setProgress`, and `flash` are also part of `WindowControls.protocol`.

Size and input constraints are main-only commands on the same handle.
`setMinimumSize(size)` and `setMaximumSize(size)` take a `WindowControls.Size`,
where zero in a maximum dimension leaves it unlimited, and `sizeLimits` reads
both back. `setAspectRatio(ratio, extra)` keeps width over height while the
user resizes, not counting `extra`, and zero removes the constraint.
`setEnabled(flag)` stops or resumes mouse and keyboard input, with `enabled`
as its read; `setIgnoreMouseEvents(flag)` lets clicks pass through to whatever
is beneath the window. `setBackgroundColor(color)` and `backgroundColor`,
`setAutoHideMenuBar(flag)`, and `setVisibleOnAllWorkspaces(flag)` with
`visibleOnAllWorkspaces` cover the rest. `center` moves the window to the
middle of its display and `moveTop` raises it without focusing it.

The content area has its own geometry: `setContentBounds(bounds)` and
`setContentSize(size)` place and size it without counting the frame, beside
the `contentBounds` read. `moveAbove(mediaSourceId)` raises the window just
above another one, named by that window's `mediaSourceId`. `setHasShadow(flag)`
with `shadow`, `setAccessibleTitle(title)` with `accessibleTitle`, `normal`
(neither maximized, minimized nor fullscreen), `menuBarAutoHide`, and
`nativeHandle` (the platform's own window handle as bytes) are the remaining
reads and settings. On Linux and Windows, `removeMenu` removes the menu bar,
`setShape(rectangles)` limits what is drawn and clickable to those rectangles,
and `setTitleBarOverlay(overlay)` restyles the native controls of a window
created with a title bar overlay.

`window.events` is a stream of what happens to a window outside its state, as
`WindowControls.Event` values: `ready-to-show` when a browser window can be
shown without a flash, and, on Linux and Windows, `app-command` for media and
browser keys and `system-context-menu` for a right click on the frame.
The state stream follows the window's own events. Geometry can settle a moment
after the event or the command that announced it, with no further event (the
content area after a menu bar hides on Windows, the bounds after leaving
fullscreen on macOS, frame extents on X11), so the window is read once more a
quarter of a second later and published again only if something changed.

`parentId` reads the Sewed id of a window's parent and `childIds` those of its
child windows.

A window made with a `name` and `windowStatePersistence` restores its bounds
and display mode from its last run and saves them as they change; `true`
persists both, and `{ bounds, displayMode }` chooses. `window.events` reports
`persisted-state-restored`, and `BaseWindow.clearPersistedState(name)` forgets
what a name stored. Persisting without a name fails with `Protocol`.
Position and size are set through `setBounds`, which takes any subset of
`x`, `y`, `width` and `height`; there are no separate position and size
commands.

`BrowserWindow.make` and `BaseWindow.make` accept the same plain options
schema: position and size limits, `frame`, `transparent`, `backgroundColor`,
the behavior flags, `opacity`, `icon`, `skipTaskbar`, `kiosk`,
`autoHideMenuBar`, the macOS `titleBarStyle` and `trafficLightPosition`, plus
`parent` and `modal`. Options are validated before
Electron creates the window, and a modal window without a parent fails with
`Protocol`.

## macOS window chrome and background throttling

`titleBarStyle` selects `default`, `hidden`, `hiddenInset`, or
`customButtonsOnHover`, and `trafficLightPosition` places the traffic light
buttons with integer coordinates. Other platforms apply only the styles Electron
supports there. `setWindowButtonVisibility(visible)` shows or hides the traffic
light buttons and fails with `Native` on other platforms.

`BrowserWindow.make` and `WebContentsView.make` also accept
`backgroundThrottling`. With `false`, Chromium keeps timers and animations
running while the page is hidden or occluded. The flag is validated before
Electron creates the web contents, and a bare `BaseWindow` has no web contents
to throttle. The playground's `verify:windows` checks the native options and
the button command's platform failure on Linux; macOS still needs its own run.

## Declared automation, content bounds, and capture sources

`BrowserWindow.make({ automation })` accepts the declaration guest views use:
`evaluate`, `input`, and a DevTools method allowlist, from the root `Automation`
module. The declaration is validated before Electron creates the window and
narrows the handle type, so `window.automation` has only the declared members
and a composition that omits the declaration has none. It is meant for
development tooling such as a QA harness; a release composition does not declare
it. The debugger attaches on the first DevTools command and detaches when the window's
scope closes. A DevTools command that waits for a compositor frame, such as
`Page.captureScreenshot`, does not complete for a window that has never been
shown; show the window first and bound such commands with `Effect.timeout`.

`WindowControls.State` includes `contentBounds`, the area inside the frame that
attached views are positioned within, published on move and resize. On X11 the
content area can also change without either event, when the window manager
reports frame extents after creation or when fullscreen and kiosk transitions
collapse the menu bar, so the published value can lag. Layout that must match the
window reads `window.contentBounds`, which reads the content area on demand and
fails with `Closed` after the window closes.
`window.mediaSourceId` reads the id that `DesktopCapturer.sources` reports for
the window; it is main-only and fails with `Closed` after the window closes.
