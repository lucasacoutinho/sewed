# Desktop surfaces

The `sewed/main` entry point covers six ambient Electron surfaces with the
same shape: inert schemas and a protocol in the `sewed` root, main operations
that require `MainContext`, and a hosted owner that carries the policy for
bound renderers, workers, and utilities.

```ts
const theme = yield * Capability.serve(NativeTheme.capability);
const power = yield * PowerMonitor.host();
const notifications = yield * Notification.host();
const paste = yield * Clipboard.host({ read: ["text", "html"], write: ["text"] });
const links = yield * Capability.serve(Shell.capability);

yield *
  window.load(entry, {
    bindings: [
      Binding.to(NativeTheme.capability.slot, theme),
      Binding.to(Power, power),
      Binding.to(Notifications, notifications),
      Binding.to(Paste, paste),
      Binding.to(Shell.capability.slot, links),
    ],
  });
```

The theme and the shell are capabilities, so the program above runs with their Layers
provided:

```ts
Effect.provide(
  Layer.mergeAll(
    NativeTheme.native({ allowSetSource: true }),
    Shell.native({
      policy: [{ kind: "origin", origin: "https://docs.example.com" }],
      paths: [app.getPath("downloads")],
    }),
  ),
);
```

Every host acquires a separate Sewed owner in the calling scope. Closing that
scope closes the owner: active streams finish, bound clients fail with code
`Closed`, and no Electron object crosses the boundary. Invalid input fails with
code `Protocol` before Electron runs, and native failures fail with code
`Native` carrying the original cause.

## Native theme

`NativeTheme.current` reads the theme source and the derived flags.
`NativeTheme.state` is a stream that replays the current state and follows
`nativeTheme` updates; a slow observer skips superseded states rather than
buffering them, since only the latest theme matters. `NativeTheme.setSource`
changes the source. Those three are main-only queries and commands.

The hosted path is one capability. `NativeTheme.native({ allowSetSource })` is
the Layer that provides it in main and carries the options,
`Capability.serve(NativeTheme.capability)` turns that Layer into an owner a
document binds to, and `Testing.NativeTheme.memory(options)` provides the same
capability in a Node test without Electron. The capability only allows
`setSource` when the options allow it; observing is always allowed. Invalid
options fail with `Protocol` while the Layer builds, before any call is made.

## Power monitor

`PowerMonitor.state(idleThresholdSeconds)` snapshots battery, idle, and
thermal information. `PowerMonitor.events` emits suspend, resume, power
source, screen lock, user activity, shutdown, thermal, and speed limit events.
Each observer owns its native listeners and a queue of 128 events; overflow
fails that observer with code `Limit` and leaves the others untouched.

## Notifications

`Notification.show(options)` shows one notification for the acquiring scope
and returns a handle with an `events` stream and `close`. The stream ends when
the notification closes or fails; late observers fail with code `Closed`.
Actions are identified by the `id` given in `options.actions`, so renderers
never see native indices. Through the hosted owner, one `show` request is one
notification: the stream carries its events and interrupting the request
closes it.

## Clipboard

`Clipboard.read(format)` returns `null` when the clipboard holds nothing of
that format, `Clipboard.write(content)` replaces the clipboard atomically, and
`Clipboard.formats` lists the formats present. Content is one of `text`,
`html`, `rtf`, `image` (PNG bytes), and `bookmark`; the protocol uses the
binary transport, so images cross as bytes. The hosted owner takes a policy of
readable and writable formats; anything outside it fails with code `Protocol`
and `formats` only reports readable formats.

## Shell

The shell is one capability rather than a handle beside a host.
`Shell.native({ policy, paths })` is the Layer that provides it in main and
carries the policy, `Capability.serve(Shell.capability)` turns that Layer into
an owner a document binds to, and `Testing.Shell.memory(options)` provides the
same capability in a Node test without Electron. Every caller writes the same
two lines:

```ts
const shell = yield * Shell.capability;
yield * shell.openExternal({ url });
```

Operations check the policy before Electron runs. `openExternal` only opens
URLs matching a rule of the same `UrlRule` schema that sessions use, and
`openPath`, `showItemInFolder`, and `trashItem` only accept absolute paths
inside the configured roots. A `mailto` rule names one exact recipient address:
a `mailto:` URL opens only when its single recipient matches without regard to
case, and a URL with another recipient or with `to`, `cc`, or `bcc` parameters
never matches. Origin and document rules also accept schemes that `App.run`
registers as standard, such as `jobwright://app`. `beep` is an operation of the
protocol like the others, so the capability covers the whole surface.

Because the policy lives in the Layer, a renderer reaching the served
capability obeys exactly the rules a main-side call does. An invalid policy or
a relative path root fails with `Protocol` while the Layer builds, before any
call is made.

## Safe storage

`SafeStorage.availability` reports whether OS encryption is available and
which backend serves it. `SafeStorage.encrypt` takes a `Redacted` string and
returns a `Sealed` value that records the schema version, the backend, and the
ciphertext; `SafeStorage.decrypt` reverses it into a `Redacted` string. Safe
storage is main-only by design: the `Sealed` schema travels through
application contracts, the plaintext does not. On Linux without an OS keyring,
`SafeStorage.allowPlainText` opts into Electron's in-memory `basic_text`
backend; the choice is explicit because it is not real encryption.

## Verification

The external playground's `pnpm verify:surfaces` drives all six surfaces on
the isolated display with `--password-store=basic`, covering replayed theme
states, synthetic power events, notification lifetimes, clipboard round trips,
shell policy denials, and a safe storage round trip.

Electron 44's clipboard is asynchronous and enumerating it materializes every
platform format, so the library reads text through the dedicated text call,
checks presence before materializing other formats, and lists formats with
parallel presence checks. On an X11 test display where the application owns
the selection it reads, Chromium's selection requests can time out at ten
seconds; the fixture budget accounts for that and the behavior is not part of
the library's contract.
