# Displays and screen coordinates

## Problem

Window geometry needs display bounds, work areas, and scale factors. Electron owns the system's displays; an application can query them and subscribe to changes. An Effect scope should own those subscriptions without pretending to own a monitor's lifetime.

Sewed's main operations already check `MainContext` at execution time. `App.run` waits for Electron readiness. Its `host` adapter installs schema-checked RPC handlers under an explicit owner, and bindings select that owner. Screen operations use these existing paths.

## Usage

```ts
import { Screen } from "sewed/main";

const displays = yield * Screen.displays;
const primary = yield * Screen.primary;
const cursor = yield * Screen.cursor;
const nearest = yield * Screen.nearest(cursor);
const matching = yield * Screen.matching(primary.workArea);

yield * Screen.changes.pipe(Stream.runForEach(onDisplayChange), Effect.forkScoped);
```

The root `sewed` entry point exports inert `Screen.Display`, `Screen.Point`, `Screen.Bounds`, and `Screen.Change` schemas for application protocols. Main can expose only the operations its clients need:

```ts
import { Screen as ScreenData, SewedError } from "sewed";
import { Screen, host } from "sewed/main";

const DisplayInfo = RpcGroup.make(
  Rpc.make("primary", { success: ScreenData.Display, error: SewedError }),
);
const displayInfo =
  yield * host(DisplayInfo, DisplayInfo.toLayer({ primary: () => Screen.primary }));
```

Bind `displayInfo` with the existing `Binding.slot` and `Binding.to` APIs. React keeps using `useClient`, `useAction`, and `useStream`. A renderer receives its chosen RPC capability; it does not receive `MainContext` or a native screen object.

## Shape

`Screen.displays`, `Screen.primary`, and `Screen.cursor` are main-required Effects. `Screen.nearest(point)` and `Screen.matching(bounds)` return main-required Effects too. Every query fails with `SewedError` code `Native` if input validation or the native operation throws, preserving the original cause. Point and rectangle inputs are checked during Effect execution, before native invocation.

`Screen.Display` contains `id`, `label`, `bounds`, `workArea`, `scaleFactor`, `rotation`, and `internal`. Display bounds, work areas, and cursor points use device-independent pixels. Rectangle schemas share their definition with window bounds. Display IDs identify Electron's reported display; an ID is not a capability or a durable guarantee that the same hardware remains attached.

`Screen.changes` is a `Stream<Screen.Change, SewedError, MainContext>`. Its variants are `{ kind: "added", display }`, `{ kind: "removed", display }`, and `{ kind: "metrics", display, metrics }`. Removed events retain the removed display's data. Metrics preserve Electron's string names. Each event captures its display data and metric list.

Each observer owns three native listeners and a queue of at most 128 pending events. Events do not replay. Overflow fails that observer with `SewedError` code `Limit` after its buffered events drain. Cancellation, completion, or owning-scope closure removes its listeners. Unlike window-state snapshots, this stream preserves ordered events until overflow; applications can query the current display list again after a failure.

If listener registration throws, the stream fails with `SewedError` code `Native` and the original cause. Its scope releases any listeners acquired before that failure.

Snapshot queries and event subscription are separate operations. They do not form an atomic snapshot-plus-events transaction. Applications requiring a derived display store must choose their own reconciliation policy.

## Synthesis decision

Use direct main Effects and a scoped event stream, following `App.activations`. This hides native callback registration, cleanup, queue limits, and typed error adaptation behind five queries and one stream. Applications choose the protocol they expose through `host`; the library creates no implicit global binding.

## Alternatives considered

- A `Screen.make` resource could share cached state, but would suggest that displays belong to an application-created owner. Its lifetime would actually control only listeners and client access, which existing scopes and hosts already express.
- A reconciled display-state service could replay a synthesized topology, but would need policy for snapshot/event races, dropped updates, and recovery. Native queries and explicit event variants expose those decisions without imposing a store on consumers.

## Platform and verification

Electron's [screen API](https://www.electronjs.org/docs/latest/api/screen) is available after application readiness. Its cursor query is unsupported on Wayland. The [display data](https://www.electronjs.org/docs/latest/api/structures/display) describes the operating system's view, including virtual displays.

The external consumer verifies native queries on Linux/X11 and injects display notifications at Electron's event boundary to check delivery, bounds, cancellation, and cleanup. Those injected notifications do not prove physical monitor hotplug, rotation, or DPI changes. Other platforms need their own native runs.
