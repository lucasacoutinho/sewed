# Guest views

`GuestView.make` acquires a view for a page the application does not own: a job posting, a
third-party login, a document viewer. The page receives no preload and no bridge, browses only
within a pattern policy the application chose, and is driven from main with typed, fenced
automation declared when the view is created. Trust is a type: a guest handle has no `load`
and carries no bindings, and a renderer view has no `navigate` and no automation.

```ts
import { Effect, Stream } from "effect";
import { BrowserWindow, GuestView, Session } from "sewed/main";

const tab = Effect.gen(function* () {
  const session = yield* Session.fromPartition({ kind: "persistent", name: "browsing" });
  const window = yield* BrowserWindow.make({ title: "Jobs" });
  const guest = yield* GuestView.make({
    session,
    navigation: ["http://*/*", "https://*/*"],
    webRtc: "disableNonProxiedUdp",
    automation: {
      evaluate: true,
      devtools: ["Runtime.evaluate", "Runtime.callFunctionOn", "Runtime.releaseObject"],
    },
  });
  yield* window.attach(guest, { bounds: { x: 320, y: 0, width: 960, height: 900 } });
  yield* guest.navigate("https://jobs.example.com/apply/123");
  yield* guest.webContents.state.pipe(
    Stream.filter((state) => state.status === "ready"),
    Stream.take(1),
    Stream.runDrain,
  );
  const snapshot = yield* guest.automation.evaluate(readPageScript, PageSnapshot);
  const png = yield* guest.webContents.capture({});
});
```

The view is constructed with context isolation, the sandbox, web security, no Node integration,
no `webview` tag, and the selected session. `webRtc` selects Chromium's IP handling policy and
`backgroundThrottling` its throttling. The handle attaches like any view, and `guest.webContents`
is the shared contents core: state and responsiveness streams, capture, PDF, print, find, style,
zoom, audio, history, focus, and recover. It closes with its scope, with `close`, or with the
window it is attached to, and it is never recreated.

## Navigation policy

`navigation` is a list of Chromium match patterns such as `https://*.example.com/*`; an empty
policy loads nothing. One rule set decides everything: `navigate(url)` fails with `Protocol` for a
target outside it, the guard prevents main-frame navigations and redirects the page initiates,
and history moves check it before Electron moves. `setNavigationPolicy` validates, compiles, and
replaces the patterns atomically. `window.open` and `<webview>` are always denied.

Nothing the guard prevents is an error in main. `guest.blocked` is an observation stream of
`{ kind, url }` values with kinds `navigation`, `redirect`, `popup`, `webview`, and `download`;
each observer owns a bounded queue and fails with `Limit` when it overflows.

## Downloads

A download the page starts is denied unless main installs a decider:

```ts
yield *
  guest
    .downloads((offer) => Effect.succeed({ kind: "save", path: join(root, offer.filename) }))
    .pipe(
      Stream.runForEach((download) => download.awaitDone),
      Effect.forkScoped,
    );
```

The decider receives the URL, filename, MIME type, size, and the guest's `sourceId`, and answers
`deny` or `save` with an absolute path. Accepted items come back on the stream as the existing
`Download.Handle` with `snapshot`, `progress`, `awaitDone`, `pause`, `resume`, and `cancel`. The
decider lives for the stream's scope; when it ends, the view returns to deny. Electron honors the
veto and the save path only inside its own callback, so the decider runs synchronously with the
installing Effect's services: a decider that suspends or fails denies the download and logs why.

## Automation

Automation is declared at creation and narrows the handle type. An undeclared operation does not
exist on the type, and a declaration built at runtime still fails with `Protocol`.

- `evaluate(script, schema, options?)` runs the script with `executeJavaScript`, optionally as a
  user gesture, and decodes the result with the caller's schema. A page that throws fails with
  `Native`; a result outside the schema fails with `Protocol`.
- `devtools(method, params, schema)` sends one DevTools protocol command over a private debugger
  session the view owns. The method must be in the declared allowlist, `params` must be JSON, and
  the result is decoded with the caller's schema. The session attaches on the first command with
  protocol version 1.3 and detaches when the view closes. Debugger events are not exposed. When
  Electron reports that another client already holds the target, the call fails with `Limit`; on
  Electron 44 an open DevTools front-end coexists with the session instead.
- `input(event)` decodes a data mirror of Electron's mouse, wheel, or keyboard event and sends it
  with `sendInputEvent`.

## Hosting a tab

A renderer that shows a tab bar binds a hosted owner, exactly like `window.controls`:

```ts
// shared/bindings.ts
export const Tab = Binding.slot("tab", GuestView.protocol);

// main/app.ts
yield *
  window.webContents.load(Renderer.entry(url, { bindings }), {
    bindings: [Binding.to(Tab, yield * guest.host({ navigate: true, capture: false }))],
  });

// renderer
const tab = useClient(Tab);
const state = useStream(() => tab.state(), [tab]);
const go = useAction((url: string) => tab.navigate({ url }));
```

`GuestView.protocol` serves `state`, `focus`, `zoom`, `setZoom`, `history`, `back`, `forward`,
`find`, `findNext`, and `stopFind` always; `navigate` and `capture` only when the host policy
grants them. Automation, downloads, and policy changes are not on the protocol.

## Interception with bodies

Body-aware interception is a session concern. `Session.intercept` accepts a `body` filter that
exposes the request stage's upload data within a byte cap, and every request stage names the
Sewed handle that issued it as `sourceId`, so a decider can scope to one tab. See
[session cookies, interception, and settings](session-extras.md).

## Errors

| Situation                                                                                                                                                                                                              | Code       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Invalid options, policy, event, or host policy; a DevTools method outside the allowlist; undeclared automation; `navigate` outside the policy; a result outside its schema; a host operation the policy does not grant | `Protocol` |
| The page threw during evaluate; a load failed; a DevTools command or input event failed; a download item could not be configured                                                                                       | `Native`   |
| Another client holds the debugger; an observer queue overflowed                                                                                                                                                        | `Limit`    |
| The contents are destroyed; the view, attachment, or debugger session is closed                                                                                                                                        | `Closed`   |

The native cause is retained on every `Native` and `Limit` failure.

## Lifecycle

`make` forks a lifetime scope from the caller's, creates the native view, registers it with the
view registry and the contents registry, and installs the guard. Finalizers run in reverse: the
registries and the download decider are released, the debugger detaches, the contents close, and
`awaitClosed` resolves. A `downloads` decider lives for its stream's scope. `setNavigationPolicy`
on a closed view fails with `Closed`, and every stream ends when the view closes.
