# Native file pickers

File pickers select paths in main. The existing window handle fixes the native parent; a renderer can call only the operations main exposes through a binding.

```ts
const selected =
  yield *
  window.dialog.open({
    mode: "file",
    multiple: true,
    filters: [{ name: "Text", extensions: ["txt", "md"] }],
  });

const destination =
  yield *
  window.dialog.save({
    defaultPath: "notes.txt",
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
```

Both methods return Effects requiring `MainContext`, with `SewedError` in their error channel. Constructing an operation opens nothing. Each execution validates its options and checks its selected parent before invoking Electron. It does not show or focus the parent.

## Inputs and results

`Dialog.OpenOptions` requires `mode: "file"` or `mode: "directory"`. Both modes accept optional `multiple`, `title`, `defaultPath`, and `buttonLabel`. Only file mode accepts `filters`. The single mode prevents Electron's platform-dependent interpretation of combined file and directory selection.

`Dialog.SaveOptions` accepts optional `title`, `defaultPath`, `buttonLabel`, and `filters`. Sewed requests native overwrite confirmation on Linux; backends can ignore that hint. Selecting a destination does not write, open, reserve, or truncate a file. The application still owns any later filesystem operation, overwrite policy, and errors.

Each `Dialog.FileFilter` has a nonempty `name` and nonempty `extensions` array. Extensions exclude dots, separators, whitespace, and wildcard patterns; `"*"` alone is supported. Omit `filters` for unrestricted selection. Sewed copies filter objects and their arrays before native invocation. Undeclared native options, including alternate parents and security-scoped bookmarks, are not forwarded.

| Schema              | Successful result                                                              |
| ------------------- | ------------------------------------------------------------------------------ |
| `Dialog.OpenResult` | `{ kind: "selected", paths: [string, ...string[]] }` or `{ kind: "canceled" }` |
| `Dialog.SaveResult` | `{ kind: "selected", path: string }` or `{ kind: "canceled" }`                 |

Selected paths are nonempty strings. User dismissal is an ordinary successful canceled result. An invalid native selection fails with `Native`; it does not fabricate a path or reinterpret an empty selection as user cancellation.

## Request and native lifetimes

**Interrupting a file picker Effect stops the request but cannot dismiss the native picker.** Electron exposes no open/save abort operation. The same rule applies to action cancellation, host closure, and renderer document disconnection. A later native response is discarded for the interrupted request.

Closing the selected parent fails a pending direct request with `Closed`. Calls on its closed handle also fail with `Closed`. The native picker may outlive the parent, depending on the backend. Sewed does not promise dismissal or create a replacement window.

Sewed admits one pending native dialog across `message`, `open`, and `save`, across all its window handles. A competing call fails with `Limit` before native invocation. Admission remains occupied until the original Electron promise settles, even after interruption or parent closure. Native throws and promise rejections release it. If a backend never settles its picker, that slot remains occupied until application exit. There is no queue, timeout-based release, or automatic retry.

Message boxes retain their abort signal behavior. Shared admission prevents a message box from being stacked over an abandoned file picker, or a picker over a pending message box. These rules cover dialogs opened through Sewed; raw Electron calls can bypass them.

## Exposing a picker

The shared protocol contains inert result schemas:

```ts
const Picker = RpcGroup.make(Rpc.make("open", { success: Dialog.OpenResult, error: SewedError }));
const Files = Binding.slot("files", Picker);
```

Main chooses the parent and the permitted operation:

```ts
const picker =
  yield *
  host(
    Picker,
    Picker.toLayer({
      open: () => window.dialog.open({ mode: "file" }),
    }),
  );

yield *
  window.webContents.load(View, {
    bindings: [Binding.to(Files, picker)],
  });
```

React keeps using `useClient` and `useAction`. Prefer `mode: "exhaust"` while a picker request is pending. After explicit cancellation the native picker can still be open; a replacement call then fails with `Limit`. Binding window controls alone grants no file picker access. Applications can keep paths entirely in main by exposing an operation that consumes the selection there and returns an application result instead. Forwarded path arrays remain subject to the existing RPC message size limit.

## Design and platform evidence

The implementation extends the existing window-owned dialog adapter with inert public schemas and shared native admission. A direct mirror of Electron's property array would permit contradictory selection modes. Temporary native windows per request would add focus and ownership behavior without a portable dismissal guarantee. Separate request and native lifetimes express the guarantees the available API can provide.

Electron documents its [file picker options and results](https://www.electronjs.org/docs/latest/api/dialog). The pinned [44.3.0 adapter](https://github.com/electron/electron/blob/v44.3.0/lib/browser/api/dialog.ts) supplies cancellation IDs only to message boxes. On Linux, portal backend versions can affect `defaultPath`; Sewed does not select or replace the desktop backend.

The separate playground consumes the packed library and exercises real GTK/X11 selections, cancellation, ownership, and explicit bindings. On the tested Electron 44.3.0 GTK backend, both open and save pickers remained visible after their native parent closed. An existing save path was returned without an overwrite prompt despite the supplied confirmation flag; the file's contents were unchanged. The report records whether a native prompt appears instead of treating the flag as proof of one.

The fixture forces GTK and English labels only for native keyboard verification. Windows dialogs, macOS sheets, and Linux portal behavior require their own native runs. Security-scoped bookmarks and their access lifetimes remain a separate capability.
