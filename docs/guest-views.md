# Guest views

`GuestView.make` acquires a view for a page the application does not own: a job posting, a
third-party login, a document viewer. The page receives no preload and no bridge, browses only
within a pattern policy the application chose, and is driven from main with typed, fenced
automation declared when the view is created. Trust is a type: a guest handle has no `load`
and carries no bindings, and a renderer view has no `navigate`. A renderer window has
automation only when the composition that creates it declares some, for development tooling.

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
zoom, audio, history, focus, favicons, terminate, and recover. It closes with its scope, with `close`, or with the
window it is attached to, and it is never recreated.

## Navigation policy

`navigation` is a list of Chromium match patterns such as `https://*.example.com/*`; an empty
policy loads nothing. It is fixed at creation and there is no setter: one rule set decides
everything, so `navigate(url)` fails with `Protocol` for a target outside it, main-frame navigations
and redirects the page starts are prevented, and history moves check it before Electron moves.
`window.open` and `<webview>` are always denied.

A guest has no entry document and so no allowance ahead of its deciders: unlike a window's web
contents, every navigation it starts is decided. The creation-time patterns are installed on
`Decidables.WebContents.Navigation` as a permanent decider of the guest's own, and deliberately as a
cap rather than a grant — it answers `"deny"` for a target it does not match, not `Decision.Pass`.
A later decider can therefore narrow the policy within its own scope, and none can widen it, because
composition is restrictive and a denial outranks every allowance. See
[the decision model](native-policy.md) for what grant and cap mean.

Nothing the guard prevents is an error in main. `guest.blocked` is an observation stream of
`WebContents.Blocked` values, `{ kind, url }` with kinds `navigation`, `redirect`, `popup`, `webview`, and `download`;
each observer owns a bounded queue and fails with `Limit` when it overflows. The stream carries
only what the page started: a `navigate` call outside the policy is main's own mistake, fails
with `Protocol`, and is not reported there.

## Input policy

Keyboard and mouse input is decided by `Decidables.WebContents.Input`, the same decidable every web
contents shares: Sewed prevents `before-input-event` and `before-mouse-event` inside Electron's
callbacks while it resolves `"block"`. `input: "block"` at creation declares this guest's own
fallback when no decider is installed — its own, not the decidable's catalog default of `"allow"`.

A decider installed afterward through `guest.webContents.decide` composes over that fallback. It has
to answer `"allow"` outright rather than `Decision.Pass` to loosen it, because a pass leaves the
fallback answering, and it loosens it only while no _other_ installed decider answers `"block"`:
composition is restrictive, so a denial outranks an allowance regardless of install order.

```ts
yield *
  guest.webContents.decide(
    Decidables.WebContents.Input,
    Decision.sync(() => "allow"),
  );
```

A guest's own registry is a web contents' registry, so `Decidables.WebContents`'s decidables install
on it and no other owner's do; installing a decider elsewhere is a compile error. See
[the decision model](native-policy.md).

On Electron 44, input sent with `automation.input` or `sendInputEvent` passes through these events
too, so a blocking policy blocks it; install an allowing decider before driving the page with
`automation.input`.

## Downloads

A download the page starts is decided by `Decidables.WebContents.Download`: a guest's own registry
denies it by default, so a decider must be installed to accept one at all. A decider answers for the
offers it recognises and passes on the rest, which leaves them to that denying fallback.

```ts
yield *
  guest.webContents.decide(
    Decidables.WebContents.Download,
    Decision.sync((offer) =>
      offer.mimeType === "application/pdf"
        ? { kind: "save", path: join(root, offer.filename) }
        : Decision.Pass,
    ),
  );
yield *
  guest.downloads.pipe(
    Stream.runForEach((download) => download.awaitDone),
    Effect.forkScoped,
  );
```

The decider's event carries the URL, filename, MIME type, size, and the guest's `sourceId`
(`Download.Offer`), and answers `deny`, `save` with an absolute path, or `prompt` to let Electron
show its save dialog with optional `Dialog.SaveOptions` (`Download.Decision`). `guest.downloads` is
a plain stream of the `Download.Handle` values a decider accepted — `snapshot`, `progress`,
`awaitDone`, `pause`, `resume`, and `cancel` — with no decider argument of its own; a denied download
never appears there, only on `guest.blocked`. Any number of deciders may be installed, composing
restrictively so `deny` beats `prompt` beats `save`: Electron honors the veto and the save path only
inside its own callback, so each decider runs synchronously, and one that throws, suspends, or
answers off-schema denies and logs why, the same as a decider that answers `deny` outright.

A guest's download posture is installed for the view's whole lifetime, not for `downloads`'s
subscription: an accepted download starts and writes to disk whether or not anything is subscribed
to the stream. With no subscriber, the accepted handle is still adopted and then immediately
dropped — bounded and self-clearing, but worth knowing before relying on `downloads` to observe
every accepted download.

Any number of subscribers share that one posture, as they do on a window's stream: each download is
decided once and reported to `blocked` once, an accepted one reaches every subscriber as the same
handle — so a `pause` or `cancel` by one subscriber is the download's, and every subscriber sees it
on `progress` and `awaitDone` — and one subscription ending leaves the others receiving.

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
  Electron reports that another client already holds the target, the call fails with `Limit`; on Electron 44 an open DevTools front-end coexists with the session instead. A command that waits for
  a compositor frame, such as `Page.captureScreenshot`, does not complete for a view that has never
  been shown; bound such commands with `Effect.timeout`.
- `input(event)` decodes a data mirror of Electron's mouse, wheel, or keyboard event and sends it
  with `sendInputEvent`.

## Serving a tab

A renderer that shows a tab bar binds the guest's tab capability. `GuestView.make` and
`GuestView.native` are two different functions with two different jobs: `make(options)` acquires
the view, and `native(guest, policy)` builds the tab capability for a view that already exists.

```ts
// shared/bindings.ts
export const Tab = GuestView.tab.slot;

// main/app.ts
const tab =
  yield *
  Capability.serve(GuestView.tab).pipe(
    Effect.provide(GuestView.native(guest, { navigate: true, capture: false })),
  );
yield *
  window.webContents.load(Renderer.entry(url, { bindings }), {
    bindings: [Binding.to(Tab, tab)],
  });

// renderer
const tab = useClient(Tab);
const state = useStream(() => tab.state(), [tab]);
const go = useAction((url: string) => tab.navigate({ url }));
```

`GuestView.tab` is the capability over `GuestView.protocol`. It serves `state`, `focus`, `zoom`,
`setZoom`, `history`, `back`, `forward`, `find`, `findNext`, and `stopFind` always; `navigate`
and `capture` only when the host policy grants them. Automation, downloads, and policy changes
are not on the protocol.

The policy travels with the `native` Layer, so a bound renderer call obeys exactly the rules a
main-side call does. An invalid policy fails with `Protocol` while the Layer builds, before any
call is made.

Serve a tab inside the guest's own scope. The owner lives for the scope `Capability.serve` runs
in, not for the view's, and nothing in the types stops a composition from holding a served owner
after the view has closed. Such an owner stays connected, and its calls fail `Closed` from the
handler rather than because the connection dropped.

`find` is a search with a scope, and an operation cannot expose a scoped resource, so the
capability's `find` is a stream that absorbs its own scope: the search ends when the stream ends.
A search the guest refuses fails on that same stream with `Protocol`.

There is no `memory` Layer for a tab, and none is needed. `GuestView.native` imports no Electron;
the guest is the Electron part, and it arrives as an argument. A Node test supplies its own
structural guest and calls `native` directly.

## Interception with bodies

Body-aware interception is a session concern. A `Decidables.Session.Request` filter passed to
`session.intercept` accepts a `body` option that exposes the request's upload data within a byte
cap, and every request stage names the Sewed handle that issued it as `sourceId`, so a decider can
scope to one tab. See [session cookies, interception, and settings](session-extras.md).

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
view registry and the contents registry, and installs the navigation cap. Finalizers run in reverse:
the registries and the download dispatch are released, the debugger detaches, the contents close,
and `awaitClosed` resolves. A decider installed through `decide` lives for the scope that installed
it; the guest's own navigation cap and download posture live for the view. `decide` on a closed view
fails with `Closed` rather than registering a decider nothing will consult, and every stream ends
when the view closes.
