# Application lifecycle

`App.run` owns the application scope. It installs launch and quit listeners synchronously, before waiting for Electron readiness, then runs the supplied main Effect. A normal accepted quit interrupts application work and waits for its scoped finalizers before Electron exits.

## Launch ownership

```ts
App.run(program, {
  singleInstance: { additionalData: { source: "desktop" } },
  quitOnLastWindowClosed: false,
});
```

`singleInstance` is opt-in. The first process acquires Electron's single-instance lock. A secondary process forwards its arguments, working directory, and JSON `additionalData` to the primary and exits with code 0 without executing `program`. The primary releases its lock when its application scope finishes. Sewed does not choose a focus, reopen, or URL-registration policy.

`App.launches` is a `Stream<Launch.Request, SewedError, MainContext>`. Its variants are:

| Kind              | Data                                                   |
| ----------------- | ------------------------------------------------------ |
| `initial`         | `arguments`, `workingDirectory`                        |
| `file`            | `path`                                                 |
| `url`             | `url`                                                  |
| `second-instance` | `arguments`, `workingDirectory`, JSON `additionalData` |

The application owns one ordered queue with capacity 128. File and URL requests received before readiness remain available when the program starts consuming. There is exactly one draining consumer; a second simultaneous consumer fails with `Limit`. Interrupting the consumer leaves undelivered requests in the queue. Delivered requests are not replayed. Malformed native data fails with `Protocol`; queue overflow or a launch larger than 256 KiB fails with `Limit` after already buffered requests drain. Closing the application ends the queue; subscribing afterward fails with `Closed`.

On macOS, Electron's [`open-file` and `open-url` events](https://www.electronjs.org/docs/latest/api/app) can arrive before readiness. Call `App.run` in the entry module without first awaiting readiness or unrelated initialization. On Windows and Linux, interpret the initial and secondary argument lists according to the application's own contract. Platform URL handlers and file associations still require application packaging configuration. Launch input is external data: select allowed schemes and destinations before acting on it.

## Close and quit decisions

```ts
const guardQuit: <R>(
  decision: Effect<boolean, never, R>,
) => Effect<void, SewedError, R | MainContext | Scope>;

// A BrowserWindow.Handle exposes the same contract for an individual window.
yield * window.guardClose(decision);
yield * App.guardQuit(decision);
```

Register the guard in the scope that owns its policy. A normal native close or quit is prevented synchronously while the decision runs asynchronously. `true` permits it; `false` keeps the owner alive. Repeated requests while a decision is pending coalesce into that decision. Only one guard may be installed on each owner; duplicates fail with `Limit`.

The decision retains its Effect service requirements and runs in a fresh scope each time. Its resources finish before approval takes effect. Removing a guard interrupts a pending decision, waits for its finalizers, and prevents a late result from closing the owner. Application and window scope finalization also removes guards. Typed decision failures must be handled by the caller before registration; defects are logged and deny the request.

`App.guardQuit` decides application-wide admission. Once approved, application scope closure destroys its owned windows; it does not invoke each window's `guardClose` again. Put any application-wide coordination in the quit decision. `guardClose` handles individual user/window close requests. Explicit resource scope closure is finalization and does not negotiate with guards.

`App.quit` requests the normal quit path and requires `MainContext`. Completion acknowledges the request, so a guard may still deny it or remain pending. A caller inside the application scope may be interrupted when quit is accepted. Native invocation errors are `SewedError` with code `Native`.

Forced process termination and some operating-system shutdown paths do not guarantee normal Electron quit events or finalizers. See Electron's [`before-quit` event](https://www.electronjs.org/docs/latest/api/app#event-before-quit) and [`BrowserWindow` close event](https://www.electronjs.org/docs/latest/api/browser-window#event-close).

## Activation

`App.activations` remains an inert `Stream<{ hasVisibleWindows: boolean }, SewedError, MainContext>`. Each observer owns its listener and a queue of 128 events. Overflow drains buffered events and then fails with `Limit`. Activation has no replay or early capture; launch delivery has its separate application-owned queue.

Electron's `activate` event is macOS-specific. A false visibility flag does not mean all windows have closed: they may be hidden or minimized. The application explicitly chooses whether to reveal, focus, or create a window. Closed handles are never revived.

## Verification

The external playground exercises real native window close requests, denial and approval, decision interruption, application finalization, and a second Electron process sharing an isolated user-data directory. Linux tests inject macOS file/URL events at Electron's event boundary to verify early adaptation and ordering; they do not prove Finder, Dock, or OS protocol-handler delivery on macOS.
