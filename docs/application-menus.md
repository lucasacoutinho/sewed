# Application menus

Configure an application menu with `App.run(setup, { menu })`. Sewed installs it after Electron is ready and before setup runs. The application owns the menu until shutdown. `App.menuSelections` is a main-only stream of future custom selections; observing that stream does not acquire or replace the native menu.

```ts
import { Effect, Match, Stream } from "effect";
import { App, BrowserWindow } from "sewed/main";

App.run(
  Effect.gen(function* () {
    const window = yield* BrowserWindow.make({ title: "Menu example" });
    yield* App.menuSelections.pipe(
      Stream.runForEach((selection) =>
        Match.value(selection).pipe(
          Match.when({ kind: "command", id: "show" }, () => window.show),
          Match.orElse(() => Effect.void),
        ),
      ),
    );
  }),
  {
    menu: {
      items: [
        {
          kind: "submenu",
          label: "&Window",
          items: [
            {
              kind: "command",
              id: "show",
              label: "Show window",
              accelerator: "CommandOrControl+Shift+S",
            },
            { kind: "role", role: "close" },
          ],
        },
        { kind: "role", role: "editMenu" },
      ],
    },
  },
);
```

The command deliberately targets the captured window owner. Using it after that window closes fails with `Closed`; Sewed does not create a replacement. Use application-owned work or explicit bindings when a command needs a different owner. A scoped fork can observe selections alongside other setup work. Observe its fiber if an observer failure should stop the application.

## Data and boundaries

`Menu.ApplicationOptions`, `Menu.ApplicationItem`, and `Menu.Selection` are inert schemas from `sewed`. Menu installation belongs to `App.run` in `sewed/main`. `App.menuSelections` retains `MainContext` through stream composition. React and worker programs cannot observe it directly. To forward selections to a renderer, keep a main-owned observer and expose its data through a host and explicit binding. The renderer's subscription then owns only its transport connection.

Top-level items are labeled submenus or standard menu roles: `appMenu`, `fileMenu`, `editMenu`, `viewMenu`, and `windowMenu`. Submenus accept commands, checkboxes, radio items, separators, nested submenus, and supported native roles. Custom IDs are nonempty and unique across the entire tree. Menus are nonempty and cannot contain only separators. Checkbox and radio items require an initial `checked` value. Options are decoded and copied at startup; later mutation does not update the menu.

Custom selectable items accept an optional nonempty Electron accelerator string. Electron parses key names and applies platform behavior; Sewed does not detect shortcut conflicts. Supported leaf roles are `undo`, `redo`, `cut`, `copy`, `paste`, `pasteAndMatchStyle`, `delete`, `selectAll`, `reload`, `forceReload`, `toggleDevTools`, `resetZoom`, `zoomIn`, `zoomOut`, `togglefullscreen`, `minimize`, `close`, `about`, and `quit`. Roles use Electron's default labels, shortcuts, and focused-window behavior. Their behavior varies by platform.

A role item has no command ID or custom handler and emits no selection. Custom commands emit `{ kind: "command", id }`, checkboxes include their actual native `checked` value, and radio selections emit their ID. There is no dismissal event for a persistent menu. Unknown native callbacks and options are stripped before constructing the native template.

## Lifetimes and failure

`App.run` installs the configured menu once. It persists across observer completion, interruption, or failure; renderer reloads; and window closure. New windows inherit it. With `quitOnLastWindowClosed: false`, it also survives having no windows. Omitting `menu` leaves Electron's default menu behavior intact; observing `App.menuSelections` in that application fails with `SewedError` code `Closed`.

Observers receive future events independently, with no replay. An event with no observers has no custom handler. Each observer has a queue of 128 pending selections. A slow observer drains its accepted events and then fails with `Limit`; other observers and native roles remain usable. Native events do not wait for an Effect handler to finish. Applications decide whether observation failures should stop their setup program or be handled locally.

Ending an observer releases its queue registration. Application shutdown closes all menu observers and destroys its scoped windows before Electron exits. Native command callbacks stop delivering when the application scope closes. A callback from an unmanaged native replacement cannot emit through the old menu; directly replacing the menu with Electron APIs is outside this contract.

Invalid options and native construction or installation failures become `Native` errors with the original cause. They fail `App.run` before setup starts, following its existing error reporting and nonzero exit behavior. Menu updates and scoped restoration are not supported.

## Design decision

`App.run` supplies the ready main capability and application scope. Its menu adapter constructs the native template once and provides a private observation service to setup. Custom callbacks publish into each observer's bounded queue; roles remain in Electron. The observer scope owns only registration, while the application owns the native menu.

A stream-owned installation was implemented and rejected after a real Electron 44.3.0 X11 test. Restoring the previous menu bar left an already-open submenu visible. Clearing the menu bar before restoration had the same result. Electron's menu-bar submenu uses a different native runner from `Menu.closePopup`, so callback guards alone cannot revoke native roles. Tying installation to application lifetime avoids promising independent native teardown that the public API cannot provide.

A scoped handle with a separate selection stream would retain that teardown problem and require callers to coordinate installation and observation. The selected startup option follows the native ownership boundary and reuses ordinary Effect streams for observation. This keeps resource identity and native callbacks private while leaving command handling and failure policy in application Effects.

## Verification and limits

The external playground consumes the packed package and uses X11 keyboard input to exercise menu-bar navigation, native shortcuts, checkbox/radio state, editing roles, and window closure. It also verifies independent observers, bounded overflow, renderer bindings/reload, startup failures, and application shutdown with a submenu open. These runs cover Linux/X11; macOS and Windows still need native verification.

There is no menu-update API, previous-menu restoration, native window reference in selection events, tray menu, icon support, or global shortcut registration. Context popup schemas continue to exclude roles because their request-result contract must report the selection.

Sources: [Electron Menu](https://www.electronjs.org/docs/latest/api/menu), [MenuItem](https://www.electronjs.org/docs/latest/api/menu-item), the pinned [Electron 44.3.0 menu-bar runner](https://github.com/electron/electron/blob/v44.3.0/shell/browser/ui/views/menu_delegate.cc), and its separate [context popup runner](https://github.com/electron/electron/blob/v44.3.0/shell/browser/api/electron_api_menu_views.cc).
