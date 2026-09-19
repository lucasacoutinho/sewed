# Session cookies, interception, and settings

`sewed/main` extends a selected `Session.Handle` with the rest of Electron's
session surface. Every operation requires `MainContext`, validates its input
before Electron runs, and fails with `Protocol` for invalid input, `Native`
for Electron failures, and `Limit` when an observer's queue overflows.

## Cookies

`session.cookies` is an inert handle with `get(filter)`,
`set(details)`, `remove(url, name)`, `flush`, and a `changes` stream of
`Cookie.Change` values. Each observer owns its native listener and a queue of
128 changes. Those are main-only operations.

The cookie surface is one capability, scoped to a session rather than ambient,
so its Layer takes the acquired handle beside the policy.
`Cookies.native(session, policy)` provides it in main,
`Capability.serve(Cookie.capability)` turns that Layer into an owner a document
binds to, and `Testing.Cookies.memory(policy)` provides the same capability in a
Node test with no session at all. Reads and writes need a URL inside the policy,
the change stream only carries cookies whose domain belongs to a policy origin,
and flushing asks the policy nothing. An invalid policy fails with `Protocol`
while the Layer builds.

```ts
const jar =
  yield *
  Capability.serve(Cookie.capability).pipe(
    Effect.provide(Cookies.native(session, [{ kind: "origin", origin: "https://app.example" }])),
  );
yield * window.webContents.load(entry, { bindings: [Binding.to(Cookie.capability.slot, jar)] });
```

## Request interception

`Session.intercept(session, rules)` installs Effect deciders on a filter for
the caller's scope. The filter uses Chromium match patterns such as
`https://*.example.com/api/*` or `<all_urls>` plus optional resource types;
`WebRequest.compilePattern` is the same matcher the library applies, exported
so applications can test their patterns.

```ts
yield *
  Session.intercept(session, {
    filter: { urls: ["https://*.example.com/*"], types: ["xhr", "script"] },
    request: (request) =>
      Effect.succeed(request.method === "DELETE" ? { kind: "block" } : { kind: "allow" }),
    requestHeaders: ({ headers }) =>
      Effect.succeed({ kind: "headers", headers: { ...headers, "x-trace": traceId } }),
    responseHeaders: () => Effect.succeed({ kind: "allow" }),
  });
```

A decider runs in main with the services the installing Effect had, so it
can read application state or log through its own layers. Decisions are data:
`allow`, `block`, `redirect` for requests; `allow`, `block`, or replacement
`headers` for request and response headers, with an optional `statusLine` on
responses. Several intercepts can be installed on one session: each stage runs
the matching deciders in installation order, the first block or redirect wins,
header decisions chain, and a decider that fails or dies blocks its request
and logs the cause. Electron allows one native listener per stage, so the
library keeps one listener over the union of the installed filters and
dispatches to the intercepts whose own filter matches. Closing the scope
removes the deciders and reinstalls the remaining ones.

`session.requests(filter)` is the observation tap beside interception: a
stream of the stages deciders never see, with headers sent, response started,
redirects, completion, and errors for the requests the filter selects, each
carrying the request fields and the cache flag. It shares the one-listener-per-
stage registry with interception and gives every observer its own bounded
queue.

A filter may ask for the request stage's upload data with `body`: `maxBytes`
caps the bytes the decider receives and `blobs` selects `resolve`, which reads
blob parts through the session and counts them, or `reference`, which keeps
their ids and counts nothing. A part is kept only when it fits the remaining
budget; the first part that does not ends the body as `truncated`. File parts
are metadata the library never reads, and a request without upload data gets
an empty body. Every request stage also carries `sourceId`, the id of the Sewed
window, view, or guest whose contents issued it, so a decider can scope to one
tab:

```ts
yield *
  Session.intercept(session, {
    filter: {
      urls: ["https://jobs.example.com/apply/*"],
      types: ["mainFrame", "xhr"],
      body: { maxBytes: 4_000_000, blobs: "resolve" },
    },
    request: (request) =>
      request.sourceId === guest.id && request.method === "POST"
        ? Effect.map(grant.matches(request.body), (ok) =>
            ok ? { kind: "allow" } : { kind: "block" },
          )
        : Effect.succeed({ kind: "allow" }),
  });
```

## Proxy, spell checker, cache, user agent, downloads

`Session.setProxy(session, config)` takes one of the `Proxy.Config` modes
and `Session.resolveProxy(session, url)` reports the proxy string Chromium
would use. `Session.spellChecker` reads the enabled flag, selected languages,
and available languages, and `Session.setSpellChecker` updates the first
two. `Session.cacheSize` and `Session.clearCache` cover the HTTP cache,
`Session.userAgent` and `Session.setUserAgent` the session-wide user agent,
and `Session.setDownloadPath` the default download directory, which must be
absolute.

## Permissions, certificates, and display media

`session.decide` installs a decider for one of `Decidables.Session`'s
decidables against the session's own registry, for the caller's scope. Any
number of deciders may be installed on the same decidable, and any number of
sessions each keep their own independent registry; the decidable's own
composition decides among the deciders installed on one.

`Decidables.Session.Permission` is asked for each permission check or
request, and for each HID, serial, or USB device check, which shares the same
decidable: `name` is the permission or device type Electron reports, and
`document` is the requesting document's key for a permission check or `null`
for a device check, which Electron identifies by origin only. `origin` is
`null` too, for any document whose origin is opaque — `file:`, `data:`, or an
unregistered scheme — since Electron's own `URL.origin` for those is the
literal string `"null"`, which is not an identity: every `file:` document in
an app shares it, so granting on it would grant every one of them. Both
fields are `string | null` rather than a bare string that reuses one shape
for two different things: without them told apart, a decider granting by
`document` could not tell a document key from an origin, and
`document.startsWith(origin)` would silently grant a device check too; the
same reasoning is why an opaque `origin` is `null` rather than the string
`"null"` a decider could mistake for a real value. Grant an opaque document
by `document`, never by `origin`. Rules grant access only to the current
main-frame document; subframes, requests without a live `WebContents`, and a
mismatched requesting origin never reach a decider at all — they deny before
any decision runs, the same way they always have. With no decider installed,
or when every installed decider fails or answers off-schema, the fallback
denies.

```ts
yield *
  session.decide(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "document", url: "https://example.com/app", permissions: ["notifications"] },
    ]),
  );
```

`Permission.Policy` is declared once, with `Decision.definePolicy`, by the
`Permission` module itself; a caller installs it with rule data alone through
the two-argument `Decision.policy(kind, rules)`. It names the least it needs
from an event: an **origin** rule is answered from `origin` alone and misses
when it is `null`; a **document** rule is answered only from `document`, so a
device check (`document: null`) is never granted by a document rule, even one
whose document happens to key the same origin.

Under `restrictive` composition the fallback is the floor, not a participant: it
answers only when no decider contributes anything at all. A decider that
answers the closed value on a miss instead of passing — `"deny"` here, ranked
first in `Decidables.Session.Permission`'s declared order — outranks and
revokes every other decider's `"allow"` for every permission and origin, not
just the one this decider has an opinion about. Answer the closed value on a
miss only when that veto is actually meant; otherwise pass, so a decider with
no opinion stays out of the way of one that has one.

**Grant or cap.** A policy — `Permission.Policy` above, `Navigation.Policy`,
`Certificate.Policy` — is a grant: it answers only what its rules match and
passes on everything else, so several features' policies compose as a union
of grants instead of vetoing each other. A cap is different in kind: an
explicit `Decision.sync` (or `Decision.async`) that answers the closed value
on a miss, denying everything nothing else explicitly allowed — installing
another decider later can never widen it. Reach for a cap only when that veto
is actually meant, such as a fixed ceiling no feature may loosen:

```ts
Decision.sync(({ origin }) => (origin !== null && allowedOrigins.has(origin) ? "allow" : "deny"));
```

`Decidables.Session.Preconnect` is asked for each of the renderer's
speculative preconnections; the fallback allows them, matching a session's
previous default, and its declared failure denies, which costs a
preconnection's latency and nothing else.
`Decidables.Session.Certificate` is asked for each server certificate
verification: an async decider answers `"trust"`, `"reject"`, or `"system"`,
which map onto `setCertificateVerifyProc`'s numeric `0`, `-2`, and `-3`
callback. With no decider installed there is no proc at all, so the
verification is not Sewed's to answer and Chromium's own verdict runs
unmediated; that is what its fallback (`"system"`) means. A decider that is
installed and then _fails_ is a different case, and this decidable declares
`"reject"` for it: a broken fingerprint pin must not silently become no pin
by deferring to the CA validity the pin exists to distrust. A decider that
needs a fallible native call must empty its own error channel first
(`Effect.orDie`, for one) — a decidable's own `Effect` never carries a typed
failure, so a decider that dies is treated exactly like one that throws or
answers off-schema: it contributes the decidable's declared failure, or its
fallback where none is declared, and is logged.
`Certificate.Policy`'s own rules are a bare hostname the WHATWG host parser
can canonicalize — no scheme, port, or path — with an internationalized host
written in its punycode (`xn--`) form, since that is the spelling Chromium
itself reports and a Unicode one would never match.

`Decidables.Session.DisplayMedia` is asked for each screen-share request; an
async decider answers `{ kind: "deny" }` or `{ kind: "source", id, audio? }`,
picking one of `DesktopCapturer.sources` or denying. With no decider
installed there is no handler at all, so the request is not Sewed's to
answer and Electron's own default handling applies — in practice a failed
request, since Electron has no built-in picker; once a decider is installed
and later fails, the handler itself still exists, so its fallback denies.
There is no separate setter and no `null`-removal path; closing the
decider's own scope is what removes it, the same as any other decidable.

The certificate proc and the display-media handler are both installed only
while a `Session.Certificate` or `Session.DisplayMedia` decider exists: the
first `decide` call on either installs the matching native handler, and
closing the last decider's own scope removes it again, restoring Electron's
own default handling. A session with no interest in certificates or screen
sharing carries neither handler at all, the same as before this decidable
model existed. The permission handlers and the preconnect listener stay
installed for the session's whole lifetime, since deciding "no opinion" for
those two is itself the default every session already needs.

```ts
yield *
  session.decide(
    Decidables.Session.DisplayMedia,
    Decision.async((request) =>
      Effect.map(DesktopCapturer.sources({ types: ["screen"] }), (found) =>
        request.userGesture && found[0] !== undefined
          ? { kind: "source" as const, id: found[0].id }
          : Decision.Pass,
      ).pipe(Effect.orDie),
    ),
  );
```

## Extensions and service workers

`Session.loadExtension(session, directory, options)` loads an unpacked
extension for the caller's scope and returns its `Extension.Info`; closing
the scope unloads it. Electron only loads extensions into persistent
sessions, so a memory session fails with `Protocol` before Electron runs. `Session.serviceWorkers(session)` reports the running
workers and streams registration and running-status events with the same
bounded observers as the other streams.

## Connections, host resolution, and blobs

`session.closeAllConnections` closes every open connection, for example after
the session's proxy changes. `session.resolveHost(host, options)` resolves
through the session's own resolver with Chromium's `queryType`, `source`,
`cacheUsage`, and `secureDnsPolicy` options and returns the `Net.ResolvedHost`
shape; `cacheUsage: "disallowed"` skips cached answers. `session.blobData(id)`
reads one upload blob, so a request decider that asks for `blobs: "reference"`
controls when, and in what order, blobs are read. Invalid arguments fail with
`Protocol`, and a native failure fails with `Native` and keeps its cause. On
Electron 44 on Linux, a response that was still streaming stayed open after
`closeAllConnections`, both through Sewed and through Electron directly, so do
not rely on it to end in-flight streams. The playground could not observe
preconnects to loopback hosts, so it verifies `Decidables.Session.Preconnect`
only as a setting.

## Verification

The external playground's `pnpm verify:session-extras` drives cookies
directly and through a bound client, blocks, redirects, and rewrites headers
on real requests from a loaded document, sets and resolves a direct proxy,
round-trips the spell checker, cache, user agent, and download path, installs
and removes a certificate decider, loads and unloads an unpacked extension,
and subscribes to service worker events.
