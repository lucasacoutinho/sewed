# Native view composition

`BaseWindow` hosts multiple renderer documents. `WebContentsView` owns one document,
its preload bridge, and its bindings. Both are available from `sewed/main` and
require `MainContext` and `Scope` to acquire. Core does not depend on a UI framework.

```ts
import { Effect } from "effect";
import { BaseWindow, WebContentsView } from "sewed/main";

const compose = Effect.gen(function* () {
  const window = yield* BaseWindow.make({ width: 1000, height: 700 });
  const sidebar = yield* WebContentsView.make();
  const content = yield* WebContentsView.make();

  // Load each view with your Renderer.entry and its explicit bindings.
  const sidebarAttachment = yield* window.attach(sidebar, {
    bounds: { x: 0, y: 0, width: 280, height: 700 },
  });
  yield* window.attach(content, {
    bounds: { x: 280, y: 0, width: 720, height: 700 },
  });

  yield* sidebarAttachment.setVisible(false);
});
```

Run the program inside `App.run`. Each view's `webContents.load(entry, { bindings })`
uses the same API as a BrowserWindow's primary document. A view can use a Sewed
session through `WebContentsView.make({ session })`. The library fixes sandboxing,
context isolation, disabled Node integration, and the Sewed preload; it exposes
no native Electron handle or foreign WebContents adoption option.

## Ownership

`window.attach(view, options)` returns an attachment with `setBounds`, `setVisible`,
and `detach`. Bounds are integer rectangles relative to the window's content area;
width and height must be non-negative. Layout is explicit: observe `window.state`
and update attachment bounds when the window resizes.

A view has one active attachment. Attaching it again, including to the same window,
fails with `Protocol` without moving the current view. Detach it before attaching
it elsewhere. Detachment removes its presentation and leaves its WebContents alive
under the scope that acquired the view.

Closing a window closes the WebContents of views still attached to it. Closing a
view removes its attachment. `awaitClosed` waits for native destruction, and closed
handles reject further operations with `Closed`. A stale attachment cannot resize
or hide a view after it has moved; repeated `detach` is harmless.

The caller's attachment scope also detaches the view when it ends. Scope finalizers
run in reverse acquisition order, so an attachment may detach before its containing
window closes during outer-scope cleanup. Its view remains owned by the view's own
acquisition scope. Acquire views in the intended lifetime and detach explicitly when
retaining a view beyond a window's lifetime.

`BrowserWindow` also supports `attach`, alongside its primary `webContents`, dialogs,
menus, and window controls. A vetoed BrowserWindow close leaves its views alive;
confirmed native closure releases them. BaseWindow provides the common window
controls, state, close guard, and `awaitClosed`, without a primary document.

## Renderer boundaries

Each view loads its own bindings and has its own document lifecycle. These are
capability boundaries, not a promise of a distinct operating-system renderer
process for every view. Electron can share renderer processes. Heavy computation
still belongs in an explicitly bound worker or utility process.

Views expose the same native responsiveness stream and explicit recovery operation
as BrowserWindow documents. See [WebContents lifecycle](webcontents-lifecycle.md),
including recovery's possible effect on other documents sharing a renderer process.

Electron does not automatically destroy child WebContents when a BaseWindow closes.
Sewed owns that cleanup. See Electron's [BaseWindow resource management](https://github.com/electron/electron/blob/v44.3.0/docs/api/base-window.md#resource-management).

The external playground's `pnpm verify:native-views` exercises production renderer
loading, distinct bindings, session and preload settings, attachment moves, invalid
operations, close vetoes, and native cleanup through the public package exports.

## Container and image views

`View.make(options)` creates a plain container view and `ImageView.make(options)`
a view that displays one image from a path or from encoded image bytes. Both are attachable exactly like a
`WebContentsView`: `window.attach(view, { bounds, visible })` returns the same
attachment record, and a container's own `attach` nests any Sewed view inside
it, so a sidebar can be a container holding an image and a document.

```ts
const panel = yield * View.make({ backgroundColor: "#202020", borderRadius: 8 });
const logo = yield * ImageView.make({ image: logoPath });
yield * window.attach(panel, { bounds: { x: 0, y: 0, width: 280, height: 700 } });
yield * panel.attach(logo, { bounds: { x: 16, y: 16, width: 48, height: 48 } });
```

Containers expose `setBackgroundColor`, `setBorderRadius`, and `setVisible`;
image views expose `setImage(image)`, which takes a path or encoded bytes such
as a PNG, and an image that does not decode fails with `Protocol`. Closing a container closes the views attached
inside it, closing any view detaches it from its parent, and a closed view's
attachment operations fail with `Closed`. One private attachment registry
serves windows, containers, and every view kind, so no native `View` object
crosses the boundary.
