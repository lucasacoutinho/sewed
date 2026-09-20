# Native message dialogs

## Problem

A message dialog belongs to a native window and an individual request. Ending either lifetime should dismiss it. A renderer may request an operation exposed by main, but must not select a native parent or receive an Electron dialog object.

`BrowserWindow.make` already owns a window scope and a native-close signal. `host` runs handlers in scoped RPC requests; cancellation and document disconnection interrupt those handlers. Effect's `tryPromise` supplies an abort signal. These paths connect the request to Electron's asynchronous message box without adding another resource owner.

## Usage

```ts
import { Effect } from "effect";
import { App, BrowserWindow } from "sewed/main";

App.run(
  [],
  Effect.gen(function* () {
    const window = yield* BrowserWindow.make({ title: "Dialog example" });
    const result = yield* window.dialog.message({
      message: "Continue?",
      buttons: ["Cancel", "Continue"],
      defaultId: 1,
      cancelId: 0,
      checkbox: { label: "Remember this choice", checked: false },
    });
    return result;
  }),
);
```

Main can expose a fixed message through a deliberately chosen protocol:

```ts
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Dialog, SewedError } from "sewed";
import { BrowserWindow, host } from "sewed/main";

const Prompt = RpcGroup.make(Rpc.make("ask", { success: Dialog.MessageResult, error: SewedError }));
const makePrompt = (window: BrowserWindow.Handle) =>
  host(
    Prompt,
    Prompt.toLayer({
      ask: () =>
        window.dialog.message({
          message: "Continue?",
          buttons: ["Cancel", "Continue"],
          cancelId: 0,
        }),
    }),
  );
```

Acquire `makePrompt(window)` in the intended host scope and bind it with `Binding.slot` and `Binding.to`. React uses the existing `useClient` and `useAction` adapters. The host chooses the parent and text. Cancellation, action replacement, or document disconnection interrupts that request. Native presentation permits one pending Sewed dialog at a time across message, open, and save; a competing request fails with `Limit`. `useAction` with `mode: "exhaust"` avoids replacing a still-pending prompt from the same action.

## Shape

`window.dialog.message(options)` returns `Effect<Dialog.MessageResult, SewedError, MainContext>`. Constructing it is inert. Each execution checks the parent, validates options, invokes Electron once with a fresh abort signal, and races against native parent closure. Closed handles fail with `SewedError` code `Closed`. Invalid options and native throws or rejected promises fail with code `Native`, preserving the cause.

The root `Dialog.MessageOptions` schema contains a message, a nonempty button array, optional type/title/detail, optional default and cancel button indexes, an optional `{ label, checked? }` checkbox, and `noLink`/`normalizeAccessKeys` flags. Button indexes must refer to the supplied array. A checkbox must have a nonempty label. Electron receives a copy of the button array.

`Dialog.MessageResult` contains `response` (the button index) and `checkboxChecked`. An ordinary user dismissal returns Electron's cancel-button response as success. Effect interruption stays interruption; it does not become a successful cancel-button response. Parent closure fails pending direct requests with `Closed`; it never opens a replacement dialog.

Each invocation supplies Electron's abort signal. Interruption requests native dismissal, which may settle after the Effect has been interrupted. Sewed admits one native dialog at a time across its window handles and message/open/save methods. Another request fails with `SewedError` code `Limit` before native invocation. The occupied slot remains held until Electron's promise settles, including after interruption. Native throws and rejections release it. There is no queue or automatic retry; applications decide whether to try again.

## Synthesis decision

Keep one operation on the existing window handle, inert schemas in `Dialog.ts`, and native adaptation in an internal dialog module. This concentrates validation, parent selection, native errors, interruption, and closure behind one method. Applications choose their RPC authority through ordinary hosts; window controls do not automatically gain dialog access. Native verification rejected the initial concurrent-dialog design: on the tested GTK backend, aborting a background modal dialog left it open after a foreground dialog had been shown. Exclusive admission avoids that combination and keeps scope cancellation useful.

## Alternatives considered

- A global `Dialog.message` with an optional parent allows a parentless macOS message box to block synchronously and ignore its abort signal. It exposes platform-dependent lifetime coordination to the caller.
- A queued global presenter would defer competing requests and own scheduling policy. Immediate `Limit` failures keep that policy explicit while preventing overlapping native modal boxes.
- A `Dialog.make` owner with `show`, `result`, and `close` would give applications a second lifetime to coordinate with the request and parent. A single interruptible Effect expresses this temporary interaction directly.

## Platform and verification

Electron's [asynchronous message box](https://www.electronjs.org/docs/latest/api/dialog#dialogshowmessageboxwindow-options) supports an abort signal. Parentless message boxes cannot use that signal on macOS; Sewed requires a window parent. Applications should display their parent before requesting a dialog; Sewed does not show or focus it automatically.

The external playground checks the packed package, real Electron dialog invocation and cancellation on Linux/X11, owner selection, typed RPC responses, validation, and native error adaptation. Native UI and response paths are identified separately in its verification report. macOS sheets and Windows dialogs need native runs on those platforms.

See [native file pickers](file-dialogs.md) for `open` and `save`. They do not share Electron's message-box abort contract. Custom icons and certificate trust dialogs remain separate capabilities.
