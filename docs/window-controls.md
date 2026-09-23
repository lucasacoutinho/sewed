# Window visibility and focus

## Problem

Applications can create hidden windows and observe activation requests, but an existing hidden window needs operations to reveal it and request focus. Hiding a window must preserve its owner, current document, bindings, and scope. Native closure still ends that owner's lifetime.

`BrowserWindow.make` already acquires a native window in a child scope. It adapts native operations into main-required Effects and owns a current-state stream. `WindowControls.capability` serves those operations to a document, and `sewed/main` builds it per window with `WindowControls.native(window)`. Native event listeners update the shared snapshot; closing the window ends the stream. Slow observers receive the latest pending state and can skip superseded snapshots.

## Usage

```ts
// Main serves the window's controls inside the window's own scope.
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

Serve a window's controls inside that window's own scope. The owner lives for the scope `serve` runs in, not for the window's, and nothing in the types stops a composition from holding a served owner after its window has closed. Such an owner stays connected, and its calls fail `Closed` from the handler rather than because the connection dropped. Serving in the window's scope makes the two lifetimes the same.

One capability is one key. Two windows served separately are two owners under `sewed/binding/window-controls`, which is all a renderer entry needs, because `Binding.to` applies per entry. A single binding list that carries two windows at once needs an explicit `Binding.slot(name, WindowControls.protocol)` for each. `Binding.to` compares protocol identity rather than slot identity, so a served owner binds to any slot over its protocol; the capability's own slot serves the single-window case.

`find` is a search with a scope, and an operation cannot expose a scoped resource, so the capability's `find` is a stream that absorbs its own scope: the search ends when the stream ends. A window with no web contents fails `find`, `zoom`, `audio`, and `history` on the stream the caller subscribed to, with code `Protocol`.

There is no `memory` Layer for window controls, and none is needed. `WindowControls.native` imports no Electron; the window is the Electron part, and it arrives as an argument. A Node test supplies its own structural window and calls `native` directly.

## Shape

The existing handle gains four `Effect<void, SewedError, MainContext>` values: `show`, `showInactive`, `hide`, and `focus`. The existing `WindowControls.protocol` gains the corresponding zero-argument RPC methods. A binding client keeps its normal `ClientContext` and `Scope` requirements, and a capability's own operations carry neither. Receiving the controls binding does not provide `MainContext` in either form.

`WindowControls.State` gains a required `visible: boolean`, read from Electron's `isVisible()`. `window.state` and the protocol's `changes()` both replay the current snapshot and observe subsequent native changes. `window.current` and the protocol's `state()` read the current native flags once, and fail with `Closed` after the window closes. Visibility is separate from focus, minimization, document readiness, and the renderer's Page Visibility API.

`show` reveals the window and requests focus. `showInactive` reveals it without requesting focus. `hide` hides it. `focus` requests focus. Completing an operation acknowledges its native invocation; consumers observe the state stream for resulting platform state. The adapter adds no optimistic state update or document reload. Calls on a closed native handle fail with `SewedError` code `Closed`; native invocation failures use code `Native`. Bound calls also retain Effect RPC transport failures when their owner disconnects.

## Synthesis decision

Extend the existing scoped window adapter and its bound protocol. Per boundary discipline, callers get the same error handling, main capability requirement, instance selection, and cleanup as the existing minimize and maximize operations. The shared snapshot reads native values on `show` and `hide` as well as the existing focus and window-state events.

## Alternatives considered

- A desired-presence resource such as `Window.present({ visible, active })` would have to reconcile operating-system decisions and user actions. It could repeatedly steal focus or reopen a deliberately closed window.
- A separate visibility service would split operations and state for the same owner across two handles and two binding protocols. The existing window adapter already owns all of their native state and lifetime.
- A single `show({ focus: boolean })` method would compress two distinct native operations into an option. Explicit `show` and `showInactive` match Electron's semantics and make their platform support clear.

## Platform and verification

Electron documents [`showInactive` as unsupported on Wayland](https://www.electronjs.org/docs/latest/api/browser-window#winshowinactive). The desktop environment can also decline or redirect a [`focus` request](https://www.electronjs.org/docs/latest/api/browser-window#winfocus). Sewed preserves those platform rules.

The separate consumer verifies native visibility, focus requests, state replay, explicit bindings to distinct owners, and cleanup. Its window-control fixture uses Electron's X11 backend for `showInactive`. Focus checks invoke the real native method and compare the stream with Electron's state, including when the desktop declines or revokes focus. Other window managers and macOS/Windows need their own platform runs.

`title` in `WindowControls.State` is the native window title, and Electron only lets a program hold it through the BROWSER WINDOW's own `page-title-updated` event. For one title change Electron emits the window's event first, with its own event object, and then the contents' event of the same name. `preventDefault` on the window's event keeps the title Electron already has. `preventDefault` on the contents' event does not, even from a listener prepended ahead of every other. `Decidables.WebContents.TitleUpdate` is asked once per change: for a window's own contents the window's listener asks, and `"keep"` (the fallback) holds the title while `"accept"` lets the page's title through as `setTitle` would; for a guest, which has no window of its own, the contents' event asks. Probed directly on Electron 44.3.0: a `setTitle("Fixed")` window loading a titled page keeps `"Fixed"` when the window-level event is prevented, and shows the page's title when only the contents' event is prevented, whether that listener was added with `on` or `prependListener`.

## Appearance, relationships, and taskbar

`WindowControls.State` also carries `title`, `alwaysOnTop`, `opacity`, the
`resizable`, `movable`, `minimizable`, `maximizable`, `closable`, and
`fullScreenable` flags, `menuBarVisible`, `kiosk`, and `simpleFullScreen` —
Electron's pre-Lion fullscreen, mirroring `fullScreen`'s own command and state
field; see [window geometry and fullscreen](window-geometry.md). The window handle gains
the matching commands, each publishing the new snapshot after Electron
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
