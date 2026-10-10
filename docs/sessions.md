# Browser session isolation

Keep account data and previews separate by choosing a session for each window. Windows using the same session share its cookies and origin storage; different sessions keep those stores apart.

```ts
import { Effect } from "effect";
import { App, BrowserWindow, Session } from "sewed/main";

App.run(
  [],
  Effect.gen(function* () {
    const account = yield* Session.fromPartition({ kind: "persistent", name: "Work" });
    const preview = yield* Session.fromPartition({ kind: "memory", name: "preview" });

    const editor = yield* BrowserWindow.make({ session: account });
    const settings = yield* BrowserWindow.make({ session: account });
    const guest = yield* BrowserWindow.make({ session: preview });
  }),
);
```

The editor and settings windows share browser state. The guest window uses a separate in-memory session. Reusing a name and kind selects the same native session; use stable names for groups of windows that should share state.

## Public API

`Session.fromPartition({ kind, name, mapping? })` returns `Effect<Session.Handle, SewedError, MainContext>`. The kind is `"memory"` or `"persistent"`, and the name is a nonempty string. Defining the Effect acquires nothing. Running it validates the options and resolves the native session after Electron readiness through `App.run`.

`Session.defaultSession` is an Effect with the same result, error, and main requirement. It selects Electron's default session. `BrowserWindow.make()` continues to use that default when its `session` option is omitted. Omitting the option does not isolate a window from other default-session windows.

`BrowserWindow.make({ session })` accepts an acquired Sewed handle. Raw partition strings, unexecuted acquisition Effects, native Electron sessions, and fabricated or copied handles do not select a session. Invalid handles fail with `SewedError` code `Native` before native window construction. The native session object remains internal.

The returned handle carries `cookies`, `clearStorage`, `closeAllConnections`, `resolveHost`, `blobData`, `requests`, `decide`, and `intercept` as methods, matching how a window and a web contents already read; the remaining settings stay free functions taking the handle. `decide` installs a decider for one of `Decidables.Session`'s own decidables — `Permission`, `Preconnect`, `Certificate`, and `DisplayMedia` — for the caller's scope. `intercept` is the other door: it installs a decider for one of the three request stages — `Request`, `RequestHeaders`, `ResponseHeaders` — and takes the filter that says which requests that decider sees. Each door refuses the other's decidables, at compile time and at run time. See [the decision model](native-policy.md) for what a decider is and how several compose, and [session cookies, interception, and settings](session-extras.md) for what each of the seven decides.

The session is fixed for the lifetime of the native window. Loading another entry or reloading its document preserves it. Sewed keeps its sandbox, context isolation, and preload configuration when a session is supplied.

Invalid partition definitions and native acquisition errors fail with code `Native`, preserving the original cause. Options such as native paths and first-creation-only cache settings are not part of this API and are not forwarded.

## Identity and lifetime

Names are case-sensitive. `"Work"` and `"work"` select distinct stores. Memory and persistent partitions with the same name are also distinct. A name such as `"persist:guest"` cannot change the explicit memory kind into persistent storage.

By default (`mapping` omitted or `"hashed"`), Sewed derives native keys as `sewed-v1-` followed by the lowercase SHA-256 digest of the name's UTF-16LE bytes. Persistent keys add Electron's `persist:` prefix. This fixed mapping avoids Electron's lowercase persistent-directory names and native path syntax. It also distinguishes exact JavaScript strings, including strings that UTF-8 encoding would replace. The mapping is part of persistence compatibility; existing raw Electron partition names are not adopted automatically by default.

`mapping: "raw"` hands `name` to Electron unchanged instead — still `persist:`-prefixed for a persistent kind, exactly as a bare `session.fromPartition(name)` call would key it. A memory partition with raw mapping rejects names beginning with `persist:` because Electron interprets that prefix as persistent storage, regardless of the explicit kind. This exists for an application that already has real users under a native partition name and cannot pay a one-time migration: **switching an existing deployment from the default `hashed` mapping to `raw` does not carry old data forward.** `sewed-v1-<sha256 of "Work">` and `raw`'s own `persist:Work` are two different native partitions with two different on-disk stores; a user's cookies, local storage, and cache under the hashed key stay exactly where they are, invisible to the raw-mapped session, and a user who already has a hashed-keyed store effectively starts over. Choose `raw` at first use, or plan an explicit one-time storage migration (reading with `mapping: "hashed"`, writing under `mapping: "raw"`) before ever switching a name already in use.

Sessions have application lifetime. Acquiring one does not require `Scope`, and the handle has no `close` or `destroy` operation. Closing a caller scope or the last window using a session does not erase its browser state. A later window can use the same session. Electron retains the native backing contexts until application shutdown.

Memory sessions do not retain their browser profile across application restarts. Persistent sessions can retain stored browser data under Electron's configured session-data directory. The external fixture checks normal quit and restart; it does not establish durability after a crash or forced termination. Cookie expiry and ordinary browser origin rules still apply.

## Other boundaries

Browser sessions group browser state. Effect runtime requirements still determine where operations execute, and explicit bindings determine which main or worker owners a document can call. Sharing a session does not grant another window's controls capability or worker binding. Separate sessions can intentionally bind the same worker.

React continues to use the existing bootstrap, clients, actions, and streams. Main selects the session before loading the renderer. No session handle crosses IPC, and there is no renderer operation for changing the selected session.

Main decides permission checks, preconnects, certificates, and screen-share requests for a selected session through `session.decide`:

```ts
yield *
  session.decide(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "origin", origin: "https://example.com", permissions: ["notifications"] },
    ]),
  );
```

Each session keeps its own registry, so deciders installed on one never reach another, and a new session denies permissions until something grants them. Main requests [explicit storage clearing](session-storage.md) through `session.clearStorage`. Custom protocols and downloads remain separate surfaces. Cookies are one capability whose Layer takes the acquired session beside its origin policy; request interception, proxies, cache, spell checker, user agent, extensions, and service workers are covered in [session cookies, interception, and settings](session-extras.md). This API does not claim to isolate main-process authority or arbitrary computation.

## Design and verification

A partition string directly on a window would expose Electron's persistence prefix and disk-name rules. A scoped session constructor would imply native cleanup that Electron does not offer. An application-lived opaque handle keeps selection explicit and lets windows share one native owner without promising erasure on scope exit.

The native behavior follows Electron's [session API](https://github.com/electron/electron/blob/v44.3.0/docs/api/session.md), [window session selection](https://www.electronjs.org/docs/latest/api/structures/web-preferences), and [browser-context lifetime and path construction](https://github.com/electron/electron/blob/v44.3.0/shell/browser/electron_browser_context.cc).

The separate playground consumes the packed package. Its session fixture uses loopback pages and an isolated session-data directory to verify native identity, storage sharing and isolation, scope/window/document lifetimes, forged-handle rejection, and binding behavior. Separate Electron processes check persistence through normal application exit. Native desktop coverage is Linux; macOS and Windows require their own runs.
