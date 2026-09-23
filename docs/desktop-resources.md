# Tray and global shortcuts

The `sewed/main` entry point exposes two scoped native resources:

```ts
const tray = Tray.make({
  icon: trayPng,
  template: true,
  tooltip: "Sewed",
  menu: { items: [{ kind: "command", id: "open", label: "Open" }] },
});

const shortcut = GlobalShortcut.register("CommandOrControl+Shift+S");
```

Both definitions are inert until their Effects run with `MainContext` and a
`Scope`. Acquiring a tray creates its native icon and a separate Sewed owner
ID. Acquiring a shortcut registers exactly the
requested accelerator. The returned handles contain only the public ID or
accelerator, typed operations, and Effect streams; Electron objects remain in
`src/internal`.

`Tray.Options` and `Tray.Event` are host-neutral schemas in
the `sewed` root entry point. `Tray.Options.icon` and `setImage(icon, { template? })` take
`Image.Source` (a path or already-encoded bytes), over the same main-side image helper `Window.setIcon`
and `App.dock.setIcon` use; an invalid source or an image no decoder reads back non-empty fails
`Protocol`, naming the icon. `template: true` calls the native image's own `setTemplateImage(true)`
— macOS semantics (a monochrome image the system tints for light and dark menu bars) and a probed
no-op elsewhere: `isTemplateImage` stays `false` on Linux. Tray menus reuse the `items`
schema and whole-menu unique-ID refinement from `Menu.PopupOptions`, while
omitting popup `position`. Menu selections are emitted as
`{ kind: "menu-selection", selection }`. Click, right-click, and double-click
events use the intentionally minimal `{ kind }` shapes allowed by the native
desktop contract, so Electron event objects and native bounds never cross the
boundary. `setMenu` accepts the same item tree as `Tray.Options.menu`.

`GlobalShortcut.Accelerator` is also exported from `sewed`. Empty
accelerators, duplicate registrations, and malformed/native-unavailable
accelerators produce `SewedError` with code `Native`; native tray or shortcut
failures do too. A closed owner produces code `Closed`; observer queues have capacity
128 and report code `Limit` on overflow.

Each observer subscription has its own queue and is removed when interrupted.
Closing its owning scope ends active observers, removes private
native listeners, destroys the tray, and unregisters only the accelerator that
the shortcut owner acquired. No `unregisterAll` operation is used.

A renderer receives these streams only through an explicitly hosted protocol
and a binding to that owner. Canceling a renderer subscription releases its
observer; it leaves the main-owned tray or shortcut alive.
