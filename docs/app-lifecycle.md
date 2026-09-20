# Application lifecycle

`App.run(declarations, program)` owns the application scope. It installs launch and quit listeners synchronously, applies every declaration in order, waits for Electron readiness, then runs `program`. A normal accepted quit interrupts application work and waits for its scoped finalizers before Electron exits.

## Declarations

```ts
App.run(
  [
    Protocol.declare(jobwright),
    () => CommandLine.declare({ name: "lang", value: osLocale() }),
    Paths.declare({ sessionData: paths.session }),
    Gpu.declare({ acceleration: true }),
  ],
  program,
);
```

A declaration is an inert value: making one runs nothing, and it is not an Effect, so a program cannot yield one after readiness. `App.run` applies the list in order, synchronously, before it waits for readiness, and fails with `Startup` naming the first declaration that cannot apply; nothing after it is applied. An entry may be a synchronous thunk, called where it stands, for a value the entry computes — the OS locale above; a throw inside it fails `Startup` with the thunk's position. Asynchronous work belongs in the program. An application with nothing to declare writes `App.run([], program)`.

| Declaration                             | Applies                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| `Protocol.declare(...schemes)`          | privileged schemes, in one call; a second declaration fails `Startup` |
| `CommandLine.declare({ name, value? })` | one Chromium switch                                                   |
| `Paths.declare({ [name]: path })`       | application paths, every entry checked before any is set              |
| `Gpu.declare({ acceleration })`         | `false` disables hardware acceleration                                |
| `App.declare({ userModelId })`          | the Windows application user model id                                 |
| `CrashReporter.declare(options)`        | `@sewed/forge`'s crash reporter, with its `directory` set first       |
| `Declaration.make(name, apply)`         | a step of your own; every declaration above is built on it            |

## Launch ownership

```ts
const program = Effect.gen(function* () {
  yield* launcherChecks;
  const instance = yield* App.claimInstance({ data: { source: "desktop" } });
  yield* instance.launches.pipe(
    Stream.runForEach(() => focusMainWindow),
    Effect.forkScoped,
  );
}).pipe(Effect.catchTag("SecondaryInstance", () => App.quit));
```

`App.claimInstance` claims Electron's single-instance lock for the caller's scope, when the program chooses: an application that runs launcher or handoff checks first claims after them, and one that wants the cheapest possible secondary exit claims first. The claim's `data` is a JSON object. A second process's claim fails `App.SecondaryInstance`, a tagged error, once Electron has forwarded that process's arguments, working directory and `data` to the holder; the program decides how that process exits, and `App.quit` in a `catchTag` is the quiet way. `App.run` does not treat the failure specially: left uncaught, it exits with code 1 like any other. The lock is released when the claim's scope closes. One claim may be held at a time; a second fails `Limit`.

`instance.launches` is a `Stream<Launch.SecondInstance, SewedError>` of later launches, each carrying `arguments`, `workingDirectory` and the JSON `additionalData` the other process claimed with (`null` when it claimed with none). `App.launches` is a `Stream<Launch.Request, SewedError, MainContext>` of this process's own launch facts:

| Kind      | Data                            |
| --------- | ------------------------------- |
| `initial` | `arguments`, `workingDirectory` |
| `file`    | `path`                          |
| `url`     | `url`                           |

Each stream owns one ordered queue with capacity 128. Launches that arrive before the program subscribes remain available — file and URL requests received before readiness, and second instances between the claim and the subscription. There is exactly one draining consumer per stream; a second simultaneous consumer fails with `Limit`. Interrupting the consumer leaves undelivered launches in the queue. Delivered launches are not replayed. Malformed native data fails with `Protocol`; queue overflow or a launch larger than 256 KiB fails with `Limit` after already buffered launches drain. Closing the application ends `App.launches`, and closing the claim's scope ends `instance.launches`; subscribing afterward fails with `Closed`.

On macOS, Electron's [`open-file` and `open-url` events](https://www.electronjs.org/docs/latest/api/app) can arrive before readiness. Call `App.run` in the entry module without first awaiting readiness or unrelated initialization. On Windows and Linux, interpret the initial and second-instance argument lists according to the application's own contract. Platform URL handlers and file associations still require application packaging configuration. Launch input is external data: select allowed schemes and destinations before acting on it.

## Close and quit decisions

Closing a window and quitting the application are two decidables, each installed on its own owner.
The model — deciders, composition, fallback against failure, scope — is
[the decision model](native-policy.md); this section is what the two of them decide.

```ts
yield *
  window.decide(
    Decidables.Window.Close,
    Decision.async(() => Effect.map(editor.unsaved, (dirty) => (dirty ? "deny" : Decision.Pass))),
  );
yield *
  App.decide(
    Decidables.App.Quit,
    Decision.async(() => Effect.map(sync.pending, (busy) => (busy ? "deny" : Decision.Pass))),
  );
```

Install each decider in the scope that owns the state it reads. A normal native close or quit is
prevented synchronously while the resolution runs; a resolved `"allow"` lets it proceed. Any number
of deciders may be installed on either, and both compose restrictively, so one feature's `"deny"`
cannot be widened by another's `"allow"` whichever installed first. A decider with no opinion
answers `Decision.Pass` and leaves the decision to the others.

Both declare a failure of `"deny"` separately from their `"allow"` fallback. Nobody objecting closes
the window or quits the application; a decider that throws, dies, or answers off-schema decided
nothing, and is not grounds for either. A broken unsaved-changes guard therefore keeps its window
open and logs the cause rather than closing on the strength of a crash.

An asynchronous decider runs with the services the installing Effect had, so it can read application
state or ask another owner. A decidable's Effect carries no typed failure, so empty a fallible call's
error channel first — with `Effect.orDie`, for one — and the dying decider then contributes `"deny"`
like any other broken one. Repeated native requests while a resolution is pending coalesce into it.

A decider that never **settles** is a different case from one that breaks, and nothing times one
out. Its gate stays pending, every later close or quit request coalesces into the resolution still
waiting, and closing the decider's own scope does not release it — the window then closes only with
the scope that owns it. Bound a decider that can wait on anything, a dialog or a network call or
another owner, with `Effect.timeout`, and let the expiry die (`Effect.orDie`) so it contributes
`"deny"` like any other broken decider. The request stages carry the same rule, with one difference
that matters here: a request Chromium eventually cancels, and a gate nothing cancels.

That timeout covers the decider and not its cleanup. A decider acquires scoped resources on a scope
the registry opens and closes around each decision, so a finalizer that dies makes its decider a
failed one and discards the answer it just gave, and a finalizer that never returns leaves the
decision unsettled with the gate still pending — outside the reach of an `Effect.timeout` on the
decider itself, which has already finished by then. Bound what a finalizer waits on too.

`App.decide(Decidables.App.Quit, …)` decides application-wide admission. Once a quit is approved,
application scope closure destroys its owned windows; it does not resolve each window's `Close`
again, so application-wide coordination belongs in the quit decider. Explicit resource scope closure
is finalization and does not negotiate with any decider.

`App.quit` requests the normal quit path and requires `MainContext`. Completion acknowledges the
request, so a decider may still deny it or remain pending. A caller inside the application scope may
be interrupted when quit is accepted. Native invocation errors are `SewedError` with code `Native`.

`Decidables.App.LastWindowClosed` decides what closing the last window does. It composes `first`, so
the earliest decider with an opinion wins, and its fallback preserves the platform default: `"stay"`
on macOS, `"quit"` elsewhere.

```ts
yield *
  App.decide(
    Decidables.App.LastWindowClosed,
    Decision.sync(() => "quit"),
  );
```

Forced process termination and some operating-system shutdown paths do not guarantee normal Electron quit events or finalizers. See Electron's [`before-quit` event](https://www.electronjs.org/docs/latest/api/app#event-before-quit) and [`BrowserWindow` close event](https://www.electronjs.org/docs/latest/api/browser-window#event-close).

## Activation

`App.activations` remains an inert `Stream<{ hasVisibleWindows: boolean }, SewedError, MainContext>`. Each observer owns its listener and a queue of 128 events. Overflow drains buffered events and then fails with `Limit`. Activation has no replay or early capture; launch delivery has its separate application-owned queue.

Electron's `activate` event is macOS-specific. A false visibility flag does not mean all windows have closed: they may be hidden or minimized. The application explicitly chooses whether to reveal, focus, or create a window. Closed handles are never revived.

## Verification

The external playground exercises real native window close requests, denial and approval, decision interruption, application finalization, and a second Electron process sharing an isolated user-data directory. Linux tests inject macOS file/URL events at Electron's event boundary to verify early adaptation and ordering; they do not prove Finder, Dock, or OS protocol-handler delivery on macOS.

## Application queries, settings, and events

`App` also covers the rest of Electron's `app` module, every operation
requiring `MainContext` and validating its input before Electron runs:

- Queries: `App.info` (name, version, locales, packaging, app path, hardware
  acceleration), `App.path(name)` and `App.setPath`, `App.gpu(kind)` and
  `App.gpuFeatures`, `App.loginItems`, `App.badge`,
  `App.isDefaultProtocolClient`, and `App.secureKeyboardEntry`.
- Commands: `App.setLoginItems`, `App.setBadge`, `App.setAboutPanel` and
  `App.showAboutPanel`, `App.setDefaultProtocolClient` and
  `App.removeDefaultProtocolClient`, and `App.setSecureKeyboardEntry`.
  Operations a platform does not support fail with `Native`.
- Streams: `App.windowFocus` reports focus entering or leaving windows with
  the Sewed window id, or null for a window the library did not create;
  `App.childProcesses` reports child process exits; `App.webContentsCreated`
  reports every new web contents with its id and type, which is how an
  application notices content it did not create. Each observer owns its
  listener and a queue of 128 events.
- Platform groups: `App.dock` (badge, bounce, hide, show, visibility) is
  macOS only and `App.taskbar` (user tasks, jump list) is Windows only; both
  fail with `Native` elsewhere rather than pretending to succeed.

See [declarations](#declarations) above for what must precede readiness:
Chromium switches, the Windows application user model id, GPU acceleration,
privileged schemes, and steps other packages need, such as `@sewed/forge`'s
crash reporter.

TLS errors and HTTP authentication are the application's other two decidables,
installed like the rest through `App.decide`.
`Decidables.App.CertificateError` is asked for each TLS error, with the URL, the
hostname, and the fields a trust decision needs from the presented certificate;
`Certificate.Policy` installs here and on a session's own certificate decidable
alike. Its fallback rejects, so Chromium's verdict stands where nobody grants.
`Decidables.App.Login` is asked for each HTTP authentication challenge, and
answers with redacted credentials or a cancellation; it composes `first`, and
without a decider every challenge is cancelled. A decider that fails there
contributes nothing, so the challenge is cancelled and the cause is logged.

```ts
yield *
  App.decide(
    Decidables.App.CertificateError,
    Decision.policy(Certificate.Policy, [
      { hostname: "internal.example.com", trust: { fingerprint } },
    ]),
  );
```
