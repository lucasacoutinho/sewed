# Application menus

Give your application a native menu with `App.menu(options)`. Acquire the menu in your application scope, then handle selections through its `selections` stream.

Acquiring the resource installs the menu. The stream delivers future custom selections, and the scope handles cleanup.

```ts
import { Effect, Match, Stream } from "effect";
import { App, BrowserWindow } from "sewed/main";

App.run(
  [],
  Effect.gen(function* () {
    const window = yield* BrowserWindow.make({ title: "Menu example" });
    const menu = yield* App.menu({
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
    });
    yield* menu.selections.pipe(
      Stream.runForEach((selection) =>
        Match.value(selection).pipe(
          Match.when({ kind: "command", id: "show" }, () => window.show),
          Match.orElse(() => Effect.void),
        ),
      ),
    );
  }),
);
```

The command deliberately targets the captured window owner. Using it after that window closes fails with `Closed`; Sewed does not create a replacement. Use application-owned work or explicit bindings when a command needs a different owner. A scoped fork can observe selections alongside other setup work. Observe its fiber if an observer failure should stop the application.

## Data and boundaries

`Menu.ApplicationOptions`, `Menu.ApplicationItem`, and `Menu.Selection` are inert schemas from `sewed`. Menu installation is `App.menu` in `sewed/main`, a scoped main resource; its `selections` stream carries no requirement of its own because the handle was acquired under `MainContext`. React and worker programs cannot observe it directly. To forward selections to a renderer, keep a main-owned observer and expose its data through a host and explicit binding. The renderer's subscription then owns only its transport connection.

Top-level items are labeled submenus or standard menu roles: `appMenu`, `fileMenu`, `editMenu`, `viewMenu`, and `windowMenu`. Submenus accept commands, checkboxes, radio items, separators, nested submenus, and supported native roles. Custom IDs are nonempty and unique across the entire tree. Menus are nonempty and cannot contain only separators. Checkbox and radio items require an initial `checked` value. Options are decoded and copied at startup; later mutation does not update the menu.

Custom selectable items accept an optional nonempty Electron accelerator string. Electron parses key names and applies platform behavior; Sewed does not detect shortcut conflicts. Supported leaf roles are `undo`, `redo`, `cut`, `copy`, `paste`, `pasteAndMatchStyle`, `delete`, `selectAll`, `reload`, `forceReload`, `toggleDevTools`, `resetZoom`, `zoomIn`, `zoomOut`, `togglefullscreen`, `minimize`, `close`, `about`, `quit`, `services`, `hide`, `hideOthers`, `unhide`, `front`, `zoom`, `help`, `window`, `recentDocuments`, `clearRecentDocuments`, `toggleTabBar`, `selectNextTab`, `selectPreviousTab`, `showAllTabs`, `mergeAllWindows`, `moveTabToNewWindow`, `toggleSpellChecker`, `showSubstitutions`, `toggleSmartQuotes`, `toggleSmartDashes`, `toggleTextReplacement`, `startSpeaking`, and `stopSpeaking` — every role Electron defines except `shareMenu`, which needs a `SharingItem` and stays with the context menu's own `share` operation. Roles use Electron's default labels, shortcuts, and focused-window behavior; a role a platform ignores still builds as an inert item carrying Electron's own label (the tab roles build with an empty label off macOS). Their behavior varies by platform.

A submenu may also carry a role: `help`, `window`, `services`, or `recentDocuments`. `help` and `window` keep their own items alongside whatever the platform adds. `services` and `recentDocuments` are filled entirely by the OS on macOS, so Sewed refuses a submenu with either role and a nonempty `items` list at decode, with `Protocol` — on Linux, Electron silently keeps custom items the OS would otherwise drop, which is the platform difference this refusal closes. A submenu carrying a role may omit `label`, since Electron supplies its own ("Services", "Open Recent", …); a role-less submenu still needs one. Contributing items to a library-owned menu skeleton with named anchors is the redesign's own step; `App.menu`'s whole-template replacement remains this wave's composition mechanism.

A role item has no command ID or custom handler and emits no selection. Custom commands emit `{ kind: "command", id }`, checkboxes include their actual native `checked` value, and radio selections emit their ID. There is no dismissal event for a persistent menu. Unknown native callbacks and options are stripped before constructing the native template.

## Lifetimes and failure

`App.menu` installs the menu once for its scope. It persists across observer completion, interruption, or failure; renderer reloads; and window closure. New windows inherit it. Where a decider on `Decidables.App.LastWindowClosed` answers `"stay"`, it also survives having no windows. An application that never calls `App.menu` keeps Electron's default menu behavior; a second live `App.menu` fails `Limit`.

Observers receive future events independently, with no replay. An event with no observers has no custom handler. Each observer has a queue of 128 pending selections. A slow observer drains its accepted events and then fails with `Limit`; other observers and native roles remain usable. Native events do not wait for an Effect handler to finish. Applications decide whether observation failures should stop their setup program or be handled locally.

Ending an observer releases its queue registration. Application shutdown closes all menu observers and destroys its scoped windows before Electron exits. Native command callbacks stop delivering when the application scope closes. A callback from an unmanaged native replacement cannot emit through the old menu; directly replacing the menu with Electron APIs is outside this contract.

Invalid options fail acquisition with `Protocol`; native construction or installation failures fail it with `Native`. Scoped restoration is not supported.

## Replacing the menu

`menu.replace(options)` replaces the installed native menu. It validates the same `Menu.ApplicationOptions` schema, builds the new native menu, and installs it. Existing observers keep receiving selections, now from the new menu. A callback from the replaced menu does not emit, because each installed menu publishes only while it is Electron's application menu. Replacement never returns to an earlier menu, so it does not share the teardown problem described below.

Invalid options fail with `Protocol` and leave the current menu installed. A native construction or installation failure fails with `Native`. After the menu's scope closes, `replace` also fails with `Closed`.

## Design decision

`App.menu` acquires the ready main capability and the caller's scope. It constructs the native template once and returns a handle with `replace` and `selections`, instead of installing a private observation service into `setup`'s environment. Custom callbacks publish into each observer's bounded queue; roles remain in Electron. The observer's scope owns only registration, while the acquiring scope owns the native menu.

A stream-owned installation was implemented and rejected after a real Electron 44.3.0 X11 test. Restoring the previous menu bar left an already-open submenu visible. Clearing the menu bar before restoration had the same result. Electron's menu-bar submenu uses a different native runner from `Menu.closePopup`, so callback guards alone cannot revoke native roles. Tying installation to application lifetime avoids promising independent native teardown that the public API cannot provide.

A scoped handle reuses ordinary Effect streams for observation, matching the native ownership boundary the X11 finding requires. This keeps resource identity and native callbacks private while leaving command handling and failure policy in application Effects. The scoped handle here therefore does not restore on release; it stops the menu's callbacks and leaves the native menu in place. It is the interim path between this step and the contribution model, which replaces it.

## Verification and limits

The external playground consumes the packed package and uses X11 keyboard input to exercise menu-bar navigation, native shortcuts, checkbox/radio state, editing roles, and window closure. It also verifies independent observers, bounded overflow, renderer bindings/reload, startup failures, and application shutdown with a submenu open. It replaces the menu while a submenu is open, checks that the replaced menu's callbacks stay silent while the new menu's accelerator reaches observers, and rejects invalid replacements and a second live menu. These runs cover Linux/X11; macOS and Windows still need native verification.

There is no per-item update API, previous-menu restoration, native window reference in selection events, tray menu, icon support, or global shortcut registration. Context popup schemas continue to exclude roles because their request-result contract must report the selection.

Sources: [Electron Menu](https://www.electronjs.org/docs/latest/api/menu), [MenuItem](https://www.electronjs.org/docs/latest/api/menu-item), the [Electron 44.3.0 menu-bar runner](https://github.com/electron/electron/blob/v44.3.0/shell/browser/ui/views/menu_delegate.cc), and its separate [context popup runner](https://github.com/electron/electron/blob/v44.3.0/shell/browser/api/electron_api_menu_views.cc).
