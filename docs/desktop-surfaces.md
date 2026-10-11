# Desktop surfaces

Use desktop capabilities to connect your application to the operating system. The same contract lets main perform an operation directly, a bound renderer call it, and a Node test exercise it in memory.

Each capability has a `native` layer for main, a `client` layer for bindings, and a `memory` layer for tests. The native and memory layers apply the selected policy. `Capability.serve` turns the layer you provide into an owner that other runtimes can call.

```ts
const theme = yield * Capability.serve(NativeTheme.capability);
const power = yield * Capability.serve(PowerMonitor.capability);
const notifications = yield * Capability.serve(Notification.capability);
const paste = yield * Capability.serve(Clipboard.capability);
const links = yield * Capability.serve(Shell.capability);

yield *
  window.webContents.load(entry, {
    bindings: [
      Binding.to(NativeTheme.capability.slot, theme),
      Binding.to(PowerMonitor.capability.slot, power),
      Binding.to(Notification.capability.slot, notifications),
      Binding.to(Clipboard.capability.slot, paste),
      Binding.to(Shell.capability.slot, links),
    ],
  });
```

Each of these surfaces is one capability, so the program above runs with their Layers
provided:

```ts
Effect.provide(
  Layer.mergeAll(
    NativeTheme.native({ allowSetSource: true }),
    PowerMonitor.native(),
    Notification.native(),
    Clipboard.native({ read: ["text", "html"], write: ["text"] }),
    Shell.native({
      policy: [{ kind: "origin", origin: "https://docs.example.com" }],
      paths: [app.getPath("downloads")],
    }),
  ),
);
```

Every `Capability.serve` acquires a separate Sewed owner in the calling scope.
Closing that scope closes the owner: active streams finish, bound clients fail
with code `Closed`, and no Electron object crosses the boundary. Invalid input fails with
code `Protocol` before Electron runs, and native failures fail with code
`Native` carrying the original cause.

## Native theme

`NativeTheme.current` reads the theme source and the derived flags.
`NativeTheme.state` is a stream that replays the current state and follows
`nativeTheme` updates; a slow observer skips superseded states rather than
buffering them, since only the latest theme matters. `NativeTheme.setSource`
changes the source. Those three are main-only queries and commands.

The surface is one capability. `NativeTheme.native({ allowSetSource })` is
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
fails that observer with code `Limit` and leaves the others untouched. Those two
are main-only queries.

The surface is one capability. `PowerMonitor.native()` is the Layer that
provides it in main, `Capability.serve(PowerMonitor.capability)` turns that Layer
into an owner a document binds to, and `Testing.PowerMonitor.memory()` provides
the same capability in a Node test without Electron. The surface carries no
policy, so `native` takes no options; the idle threshold is checked on every
call and fails with `Protocol` before Electron runs.

## Notifications

`Notification.show(options)` shows one notification for the acquiring scope
and returns a handle with an `events` stream and `close`. The stream ends when
the notification closes or fails; late observers fail with code `Closed`.
Actions are identified by the `id` given in `options.actions`, so renderers
never see native indices. Those are main-only operations.
If native setup or `show` fails, the notification closes and its listeners are
removed before acquisition fails, even if the caller keeps its scope open.

The surface is one capability. `Notification.native()` is the Layer that
provides it in main, `Capability.serve(Notification.capability)` turns that Layer
into an owner a document binds to, and `Testing.Notification.memory()` provides
the same capability in a Node test without Electron. Through the capability, one
`show` request is one notification: the stream carries its events and
interrupting the request closes it. The surface carries no policy, so `native`
takes no options; invalid options fail that request's stream with `Protocol`
before Electron runs.

## Clipboard

`Clipboard.read(format)` returns `null` when the clipboard holds nothing of
that format, `Clipboard.write(content)` replaces the clipboard atomically, and
`Clipboard.formats` lists the formats present. Content is one of `text`,
`html`, `rtf`, `image` (PNG bytes), and `bookmark`; the protocol uses the
binary transport, so images cross as bytes. Those four are main-only operations.

The surface is one capability. `Clipboard.native(policy)` is the Layer that
provides it in main and carries a policy of readable and writable formats,
`Capability.serve(Clipboard.capability)` turns that Layer into an owner a
document binds to, and `Testing.Clipboard.memory(policy)` provides the same
capability in a Node test without Electron. Anything outside the policy fails
with code `Protocol`, `formats` only reports readable formats, and `clear` needs
some writable format. A write decodes its content when the Effect runs, then
authorizes and writes that same snapshot. An invalid policy fails while the
Layer builds, before any call is made.

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
URLs matching a rule of the same `UrlRule` schema that sessions use, a
`WebRequest.Pattern` match pattern such as `*://*/*` for every http or https
URL, or a `mailto` rule, and `openPath`, `showItemInFolder`, and `trashItem`
only accept absolute paths inside the configured roots. A `mailto` rule names
one exact recipient address: a `mailto:` URL opens only when its single
recipient matches without regard to case, and a URL with another recipient or
with `to`, `cc`, or `bcc` parameters never matches. Origin and document rules
also accept schemes that `App.run` registers as standard, such as
`jobwright://app`. `beep` is an operation of the protocol like the others, so
the capability covers the whole surface.

Because `openExternal` hands the URL straight to the operating system, a
pattern's scheme is checked again on top of its own syntax: the shell refuses
`<all_urls>` and any scheme other than `*`, `http`, `https`, or one `App.run`
registers as standard. A pattern's path is matched against the URL as
written — percent-encoding is not decoded — so treat the host, not the path,
as the boundary of a grant. `file` is refused as a pattern scheme for exactly
this reason: `file:///tmp/*` would grant `file:///tmp/..%2f..%2fetc/passwd`,
since the WHATWG URL parser normalizes a literal `..` but leaves a
percent-encoded separator untouched. A local file goes through `openPath` or
`showItemInFolder` with a configured root instead, which does a real path
containment check, or an exact `document` rule, which compares one whole URL
rather than matching a wildcard against it. `openExternal` also refuses any
URL carrying credentials, such as `https://trusted@evil.example/`, whatever
rule would otherwise have allowed it — that shape is a phishing form, not a
login. Explicit default ports match the canonical URL: `https://example.com:443/*`
matches `https://example.com/` even though its parser drops the port. Numeric
ports must be within 0-65535. A pattern names an IPv4 literal or a host name, not an IPv6 literal — a
bracketed pattern such as `http://[::1]:8080/*` does not compile, so reach a
literal IPv6 address with an `origin` rule instead.

Because the policy lives in the Layer, a renderer reaching the served
capability obeys exactly the rules a main-side call does. An invalid policy or
a relative path root fails with `Protocol` while the Layer builds, before any
call is made.

### Grants

The configured `paths` are fixed for the Layer's lifetime, but a document
often only knows which path to reveal once the user has chosen one — the file
a save dialog just wrote. `Shell.Grants` is the scoped door for that case:
`Shell.native(options)` provides it beside `Shell.capability`, from the same
`ShellPolicy.operations` build that checks every call, so a granted path is
never a second, drifting copy of the containment rule. `grants.allow(path)`
admits one absolute path — a file, or a directory and everything under it,
under the same containment rule a configured root already uses — for the
caller's scope; closing the scope withdraws it. Granting the same path from
two scopes is counted, not overwritten: closing one leaves the other's grant
live until it closes too. Containment, for a root and a grant alike, is a check
on the resolved path and not on what the filesystem does with it: a symlink under
a root or a grant is followed by the OS, not by the check.

```ts
// reveal what the user just saved, wherever they saved it
const saved = yield * window.dialog.save({ defaultPath: "diagnostics.zip" });
if (saved.kind === "selected") {
  const grants = yield * Shell.Grants;
  yield * grants.allow(saved.path);
  yield * shell.showItemInFolder({ path: saved.path });
}
```

`Shell.Grants` is main-only, not because the service tag itself needs
Electron — it is declared beside `Shell.capability` in the Electron-free root
module, so nothing stops it appearing as a type wherever `Shell` does — but
because only `Shell.native` and `Testing.Shell.memory` ever build a Layer that
provides a _live_ instance of it. `Capability.serve(Shell.capability)` serves
exactly the five RPCs `Shell.protocol` declares; `allow` is not one of them,
so a renderer bound to a served shell has no route to widen its own policy,
however its own idea of the protocol is generated. Only main code holding
`Shell.Grants` can grant a path, one scope at a time — the same rule
`trashItem` already applies to a static root, given a lifetime.

## Safe storage

`SafeStorage.availability` reports whether OS encryption is available and
which backend serves it. `SafeStorage.encrypt` takes a `Redacted` string and
returns a `Sealed` value that records the schema version, the backend, and the
ciphertext; `SafeStorage.decrypt` reverses it into a `Redacted` string. Safe
storage is main-only by design: the `Sealed` schema travels through
application contracts, the plaintext does not. On Linux without an OS keyring,
`SafeStorage.allowPlainText` opts into Electron's in-memory `basic_text`
backend; the choice is explicit because it is not real encryption.

`SafeStorage.encryptAsync` and `SafeStorage.decryptAsync` do the same without
blocking the main process while a keychain prompt is up; `decryptAsync` also
answers `shouldReEncrypt` when the keystore's key has rotated, and
`SafeStorage.asyncAvailable` says whether they can encrypt.

## Verification

The external playground's `pnpm verify:surfaces` drives all six surfaces on
the isolated display with `--password-store=basic`, covering replayed theme
states, synthetic power events, notification lifetimes, clipboard round trips,
shell policy denials and grants, and a safe storage round trip.

Electron 44's clipboard is asynchronous and enumerating it materializes every
platform format, so the library reads text through the dedicated text call,
checks presence before materializing other formats, and lists formats with
parallel presence checks. On an X11 test display where the application owns
the selection it reads, Chromium's selection requests can time out at ten
seconds; the fixture budget accounts for that and the behavior is not part of
the library's contract.
