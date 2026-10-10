# Window geometry and fullscreen

Move and resize a window, or switch it to fullscreen, through its existing handle. The same operations are available to a renderer bound to that window's controls.

The desktop environment decides the final position and size. Observe the window's state when later work depends on the result of a resize or fullscreen transition.

## Set bounds and fullscreen

```ts
const window = yield * BrowserWindow.make({ show: false });
yield * window.setBounds({ x: 100, y: 100, width: 960, height: 640 });
yield * window.show;
yield * window.setFullScreen(true);

const controls = yield * Controls();
yield * controls.setBounds({ width: 800 });
yield * controls.setFullScreen({ fullScreen: false });

// Simple fullscreen before hiding a window to the tray: on macOS it is the pre-Lion fullscreen
// that does not create a Space, which is why a window minimizing to the tray leaves it first.
if ((yield * window.state.pipe(Stream.runHead)).pipe(Option.exists((s) => s.simpleFullScreen)))
  yield * window.setSimpleFullScreen(false);
```

Observe `window.state` or the client's `changes()` stream for `bounds`, `normalBounds`, `contentBounds`, `fullScreen`, and `simpleFullScreen`. The client's `state()` reads the current native snapshot. `normalBounds` reports the rectangle to restore to when leaving maximized or fullscreen mode. Applications choose whether and where to persist it.

## API details

`WindowControls.Bounds` is a schema with integer `x`, `y`, `width`, and `height` fields. Coordinates use Electron's signed 32-bit range; dimensions are nonnegative within that range. Zero dimensions are accepted as requests, and the window manager can enforce a minimum. `BoundsUpdate` derives optional fields from that schema. Omitted fields retain their native values; an empty update is a no-op.

`WindowControls.State` includes required `bounds`, `normalBounds`, and `contentBounds` fields, read from Electron's `getBounds()`, `getNormalBounds()`, and `getContentBounds()`. `bounds` and `normalBounds` describe the outer window rectangle, including its frame. Native `move` and `resize` events update the existing state stream alongside fullscreen, visibility, and window-state events. `contentBounds` is the area inside the window frame; attached views are positioned relative to it.

The main handle exposes `setBounds(bounds: BoundsUpdate)`, `setFullScreen(fullScreen: boolean)`, and `setSimpleFullScreen(simpleFullScreen: boolean)`, all returning `Effect<void, SewedError, MainContext>`. The window controls capability exposes the same requests through the existing protocol, with `{ fullScreen: boolean }` and `{ simpleFullScreen: boolean }` as their payloads. Clients keep their `ClientContext` and `Scope` requirements.

`simpleFullScreen` is Electron's pre-Lion fullscreen: probed on Linux, `setSimpleFullScreen(true)` is honoured there too — `state.simpleFullScreen` and `state.fullScreen` both answer true afterwards — even though its distinguishing behavior (no macOS Space, so a window minimizing to the tray leaves fullscreen first) is macOS-only. It reports on the same native state stream `fullScreen` already uses.

Both native operations validate their input during Effect execution, before invoking Electron. Direct validation or invocation failures use `SewedError` code `Native`, retaining the original cause. Closed handles fail with `Closed`. Bound calls also retain Effect RPC encoding, decoding, and transport errors. Effect RPC's checked payload constructor treats invalid typed input as a defect. Parse external values with `Schema.decodeUnknownEffect(WindowControls.BoundsUpdate)` before calling the client when validation should be a typed failure. Invalid input cannot mutate the native window.

Operation completion acknowledges a native request. It does not promise that the window manager honored the exact coordinates or that a fullscreen transition finished. Streams report native state without a desired-state cache, polling, retries, or automatic restoration.

Window state uses a sliding buffer with two pending snapshots and replays the current snapshot to new observers. Slow subscribers skip superseded states, so repeated move and resize events cannot accumulate an unbounded backlog. Stream delivery and RPC can already have snapshots in flight when newer ones arrive. This is a state stream, not an event history; observers must not depend on seeing every intermediate transition.

The native fixture checks bounded delivery by pausing one observer during 64 resize requests. Both observers must still reach the final geometry. Applications can use the latest snapshot without keeping every intermediate resize.

## Platform and verification

Electron documents [platform constraints on bounds](https://www.electronjs.org/docs/latest/api/base-window#winsetboundsbounds-animate): macOS constrains some coordinates, and Wayland prohibits global window positioning. Wayland can also restrict programmatic resizing. [Fullscreen transitions on macOS are asynchronous](https://www.electronjs.org/docs/latest/api/browser-window#winsetfullscreenflag). Consumers observe state when later work depends on a transition.

The separate consumer's native window fixture verifies geometry and fullscreen against real Electron windows using X11. This provides Linux evidence; macOS, Windows, and other window managers need their own native runs.
