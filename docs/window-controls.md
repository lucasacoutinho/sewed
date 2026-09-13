# Window visibility and focus

## Problem

Applications can create hidden windows and observe activation requests, but an existing hidden window needs operations to reveal it and request focus. Hiding a window must preserve its owner, current document, bindings, and scope. Native closure still ends that owner's lifetime.

`BrowserWindow.make` already acquires a native window in a child scope. It adapts native operations into main-required Effects, owns a current-state stream, and hosts `WindowControls.protocol` for explicitly bound clients. Native event listeners update the shared snapshot; closing the window ends the stream and closes its bound host. Slow observers receive the latest pending state and can skip superseded snapshots.

## Usage

```ts
const window = yield * BrowserWindow.make({ show: false });
yield * window.webContents.load(View, { bindings });
yield * window.show;

// Main can reveal a background window without requesting activation.
yield * window.showInactive;

// A client operates on the exact window selected by Binding.to.
const controls = yield * Controls();
yield * controls.hide();
yield * controls.show();
```

An activation handler can call an existing owner's `show` or `focus` Effect. If that owner has closed, the application must explicitly acquire a new one. Hiding a window does not emit native window closure or trigger the last-window-closed quit policy.

## Shape

The existing handle gains four `Effect<void, SewedError, MainContext>` values: `show`, `showInactive`, `hide`, and `focus`. The existing `WindowControls.protocol` gains the corresponding zero-argument RPC methods. Clients keep their normal `ClientContext` and `Scope` requirements; receiving the controls binding does not provide `MainContext`.

`WindowControls.State` gains a required `visible: boolean`, read from Electron's `isVisible()`. Both `window.state` and the bound `changes()` stream replay the current snapshot and observe subsequent native changes. `state()` reads the current native flags. Visibility is separate from focus, minimization, document readiness, and the renderer's Page Visibility API.

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
