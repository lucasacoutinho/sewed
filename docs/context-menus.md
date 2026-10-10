# Native context menus

Use `window.menu.popup(options)` to offer native commands for a particular window. The result tells you whether the user selected a command or dismissed the menu.

The popup belongs to that request. Interrupting the Effect closes its native menu. Main selects the window, and the operation requires `MainContext`.

```ts
import { Effect, Match } from "effect";
import { App, BrowserWindow } from "sewed/main";

App.run(
  [],
  Effect.gen(function* () {
    const window = yield* BrowserWindow.make({ title: "Menu example" });
    const result = yield* window.menu.popup({
      items: [
        { kind: "command", id: "inspect", label: "Inspect" },
        { kind: "separator" },
        { kind: "checkbox", id: "details", label: "Show details", checked: false },
      ],
      position: { x: 24, y: 24 },
    });
    const description = Match.value(result).pipe(
      Match.when({ kind: "command" }, ({ id }) => `Selected ${id}`),
      Match.when({ kind: "checkbox" }, ({ id, checked }) => `${id}: ${checked}`),
      Match.when({ kind: "radio" }, ({ id }) => `Selected ${id}`),
      Match.when({ kind: "dismissed" }, () => "Dismissed"),
      Match.exhaustive,
    );
    yield* Effect.log(description);
  }),
);
```

## Data and placement

The root `sewed` export contains inert `Menu.Item`, `Menu.PopupOptions`, and `Menu.PopupResult` schemas. Items form a tree of commands, checkboxes, radio items, separators, and submenus. Commands, checkboxes, and radio items have unique, nonempty IDs across the whole tree. Submenus have nonempty `items`; a menu cannot consist entirely of separators. Selectable items and submenus accept `enabled: false`. Checkbox and radio items require an initial `checked` value. Electron groups adjacent radio items; selecting one returns its ID. The caller owns any state retained for the next invocation.

`position` supplies both coordinates in integer device-independent pixels, relative to the parent window's content area. Omit it to use the current cursor position. Negative coordinates are rejected because Electron treats `-1` as a cursor-position sentinel. Native placement can adjust the popup to fit the screen.

Creating an Effect or importing a schema does not create or show a native menu. The options are decoded when the Effect runs. Native menu objects, click callbacks, and the parent remain in main. Applications expose chosen menu operations through an ordinary `host` protocol and explicit `Binding.to` instance. A protocol can use `Menu.PopupResult` as its result schema; it need not accept arbitrary menu definitions from the renderer. Window controls do not implicitly grant menu access.

React uses the bound client from an ordinary feature hook with `useAction`. No component subscription or cleanup hook is needed. Cancellation and document disconnection reach the handler through the existing RPC request lifetime.

## Completion and ownership

A command returns `{ kind: "command", id }`; a checkbox also returns its native `checked` value; a radio item returns `{ kind: "radio", id }`. Escape, clicking outside, and other native dismissals return `{ kind: "dismissed" }`. Interruption stays interruption. Closing the parent fails a pending direct request with `SewedError` code `Closed`; later calls on that handle also fail with `Closed`. Electron can call the popup completion callback partway through `BrowserWindow.destroy()`. Sewed defers completion to a microtask so that synchronous parent destruction finishes before classifying the result.

Sewed admits one native popup at a time across its window handles. A competing request fails with `SewedError` code `Limit`; it cannot dismiss the active menu. Admission remains occupied after interruption until Electron calls the native close callback or the parent is destroyed. A late callback from an old invocation cannot release a newer one. Each accepted invocation builds its own native menu. Sewed does not queue or reopen menus. Native construction or popup failures become `SewedError` code `Native` with the original cause.

## Design decision

The existing path is `BrowserWindow.make` -> main-owned handle -> application `host` -> explicitly bound client. Window scope closure destroys its native window; document disconnection interrupts its pending RPC handlers. The popup adapter listens for native parent closure and converts selection, dismissal, and parent closure into one Effect result. Its close listener remains until native completion or parent destruction, even if the request was interrupted.

Two shapes were considered. A standalone `Menu.make` handle with `popup`, a selection stream, and explicit closing would require callers to coordinate subscription and display lifetimes for a single choice. A request on the window handle hides that coordination, preserves the chosen parent, and leaves command execution as ordinary Effect composition after the result. This is the selected design. A persistent application menu has a different lifetime and needs its own API. The initial design allowed concurrent independent popups. A real X11 run dismissed the first popup while the second emitted no show event or completion callback. Exclusive admission replaces that design, with no implicit replacement policy.

Native roles are excluded from this command-result API: Electron executes a role instead of calling the item's click handler, so the role's selection is not reported through the same callback contract. [Application menus](application-menus.md) support native roles and custom accelerators with application ownership and separate selection observers. Context popup accelerators, icons, and automatic WebContents context-menu event integration remain separate work.

## Verification and limits

The external playground consumes the packed library and exercises real native menu selection, dismissal, cancellation, parent closure, and bound renderer requests. Native interactions run on Linux/X11. macOS and Windows still need native verification.

Sources: [Electron Menu](https://www.electronjs.org/docs/latest/api/menu), [MenuItem](https://www.electronjs.org/docs/latest/api/menu-item), and the [Electron menu adapter](https://github.com/electron/electron/blob/main/lib/browser/api/menu.ts).
